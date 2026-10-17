-- Reports and terms acceptance: the two pieces App Store Review Guideline 1.2
-- and Google Play's user-generated content policy require that the starter
-- did not have (blocking and account deletion it had already).
--
-- Reports (public.reports, public.report_user):
--   * A signed-in person reports another person with a reason from a fixed
--     list and optional text, and may block them in the same call.
--   * Only the service role reads reports. RLS is on with no policies and
--     every privilege is revoked from anon and authenticated: the reporter
--     cannot read a report back, the reported person never learns of one,
--     and nothing about a report is public. The operator reads them in
--     Studio or with the query in docs/moderation.md.
--   * report_user answers every call the same way (void) whether or not the
--     id is a profile in the tenant: an unknown id is counted and dropped,
--     never an error, so reporting is not an existence oracle. Reporting
--     yourself is refused (22023), which says nothing about anyone else.
--   * A per-reporter ledger, 10 per rolling 24 hours, counted before the id
--     is looked up. The publishable key reaches PostgREST directly, so the
--     limit lives in the RPC (the claim_tag pattern), not the API Worker.
--   * Each report keeps a snapshot of the card as it was (name, bio, photo
--     path), so a later edit cannot erase what was reported.
--   * Account deletion, reporter: their reports are anonymised (reporter_id
--     set null; reason, text and snapshot stay), so a report about someone
--     abusive survives the person who filed it leaving.
--   * Account deletion, reported person: their reports are kept for 90
--     days (reported_id set null, reported_deleted_at stamped, snapshot
--     kept), then purged. Deleting an account must not be a way to erase
--     every report against it before the operator reads them; 90 days is
--     the legitimate-interest window for acting on abuse (a returning
--     abuser, a request from the authorities). The purge is lazy, the way
--     request expiry is (the stack has no background jobs): every report
--     and every profile deletion first deletes the expired rows.
--   * The ledger is cleared by delete_my_account.
--   * Optional notification: private.report_config holds one webhook URL,
--     unset by default (the private.push_config shape). When set, every new
--     report POSTs {"text", "content"} naming the report id only, through
--     pg_net (asynchronous, transactional: a report that rolls back sends
--     nothing). Slack and Discord incoming webhooks both read it.
--
-- Terms (profiles.terms_version, profiles.terms_accepted_at):
--   * Which version of the fork's terms the person agreed to, and when. The
--     current version is TERMS_VERSION in packages/contract; the web shell
--     and the mobile root layout ask again when the two differ.
--   * terms_accepted_at is stamped by a trigger whenever terms_version
--     changes, so no client can backdate or forge it; any other write keeps
--     it. terms_version cannot be cleared once set.
--   * profiles_insert requires a terms_version: no client creates a profile
--     without recording agreement. Existing rows stay null (the gate asks
--     their owners on next open).

-- ================================================================== terms ==

alter table public.profiles
  add column terms_version text
    constraint profiles_terms_version_shape
    check (terms_version is null or terms_version ~ '^[A-Za-z0-9._-]{1,32}$'),
  add column terms_accepted_at timestamptz;

alter table public.profiles
  add constraint profiles_terms_consistent
  check ((terms_version is null) = (terms_accepted_at is null));

create function private.stamp_terms_acceptance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.terms_accepted_at := case when new.terms_version is null then null else now() end;
  elsif new.terms_version is distinct from old.terms_version then
    if new.terms_version is null then
      raise exception 'terms acceptance cannot be withdrawn' using errcode = '22023';
    end if;
    new.terms_accepted_at := now();
  else
    new.terms_accepted_at := old.terms_accepted_at;
  end if;
  return new;
end
$$;

create trigger profiles_stamp_terms_acceptance
  before insert or update on public.profiles
  for each row execute function private.stamp_terms_acceptance();

drop policy profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (
    id = (select auth.uid())
    and tenant_id = private.current_tenant_id()
    and terms_version is not null
  );

-- ================================================================ reports ==

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default private.current_tenant_id(),
  -- Null once the reporter deletes their account (anonymised, kept).
  reporter_id uuid references public.profiles (id) on delete set null,
  -- Null once the reported person deletes their account; the row is kept
  -- for 90 days from reported_deleted_at, then purged.
  reported_id uuid references public.profiles (id) on delete set null,
  reported_deleted_at timestamptz,
  reason text not null constraint reports_reason_known check (reason in (
    'harassment', 'hate', 'sexual_content', 'violence', 'child_safety',
    'underage', 'spam', 'impersonation', 'other'
  )),
  details text constraint reports_details_shape check (
    details is null
    or (char_length(details) between 1 and 1000 and private.is_plain_text(details, true))
  ),
  -- The card as the reporter saw it: display_name, bio, avatar_path.
  snapshot jsonb not null,
  -- The operator's workflow. Nothing in the starter writes these but the
  -- operator (service role); docs/moderation.md.
  status text not null default 'open'
    constraint reports_status_known check (status in ('open', 'actioned', 'dismissed')),
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reports_distinct_parties check (reporter_id is null or reporter_id <> reported_id),
  -- Stamped (by the profile delete trigger below) before the foreign key
  -- clears reported_id, so a cleared row always carries its clock.
  constraint reports_reported_deleted_stamped check (reported_id is not null or reported_deleted_at is not null)
);

create index reports_open_idx on public.reports (created_at) where status = 'open';
create index reports_reported_idx on public.reports (reported_id);
create index reports_reporter_idx on public.reports (reporter_id);

alter table public.reports enable row level security;
-- No policies: deny-all for every role RLS applies to. The revoke makes the
-- intent explicit and keeps PostgREST from even describing the table.
revoke all on public.reports from public, anon, authenticated;

create index reports_expiring_idx on public.reports (reported_deleted_at)
  where reported_deleted_at is not null;

-- Reports about deleted accounts, past the 90-day window.
create function private.purge_expired_reports()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.reports
   where reported_id is null
     and reported_deleted_at < now() - interval '90 days'
$$;

-- Stamp the window's start on reports about an account being deleted,
-- before the foreign key's set null runs.
create function private.on_profile_deleted_reports()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.purge_expired_reports();
  update public.reports set reported_deleted_at = now() where reported_id = old.id;
  return old;
end
$$;

create trigger profiles_before_delete_reports
  before delete on public.profiles
  for each row execute function private.on_profile_deleted_reports();

-- ============================================================ notification ==

create extension if not exists pg_net with schema extensions;

create table private.report_config (
  id boolean primary key default true check (id),
  -- Unset by default: no report leaves the database until the operator
  -- sets it (go-live). https in production; http for the local test mock.
  webhook_url text check (webhook_url is null or webhook_url ~ '^https?://')
);
insert into private.report_config (webhook_url) values (null);
alter table private.report_config enable row level security;

create function private.notify_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_message text := 'A report was filed: ' || new.id::text;
begin
  select webhook_url into v_url from private.report_config;
  if v_url is null then
    return new;
  end if;
  -- The id only: no names, no reason, no text. The operator reads the row.
  -- A failure to queue never blocks the report itself.
  begin
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('text', v_message, 'content', v_message)
    );
  exception when others then
    null;
  end;
  return new;
end
$$;

create trigger reports_after_insert_notify
  after insert on public.reports
  for each row execute function private.notify_report();

create table private.report_attempts (
  user_id uuid not null,
  attempted_at timestamptz not null default now()
);
create index report_attempts_user_idx on private.report_attempts (user_id, attempted_at desc);
alter table private.report_attempts enable row level security;

create function public.report_user(
  p_reported uuid,
  p_reason text,
  p_details text default null,
  p_block boolean default false
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_details text := nullif(trim(p_details), '');
  v_target public.profiles%rowtype;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'profile required before reporting' using errcode = 'P0001';
  end if;
  if p_reported is null or p_reported = v_user then
    raise exception 'cannot report yourself' using errcode = '22023';
  end if;

  -- Every attempt counts, before the id is looked up: 10 per rolling day.
  perform pg_advisory_xact_lock(hashtextextended('report_user:' || v_user::text, 0));
  delete from private.report_attempts
   where user_id = v_user and attempted_at <= now() - interval '24 hours';
  if (select count(*) from private.report_attempts where user_id = v_user) >= 10 then
    raise exception 'rate limit exceeded' using errcode = 'P0004';
  end if;
  insert into private.report_attempts (user_id) values (v_user);

  perform private.purge_expired_reports();

  select * into v_target
    from public.profiles
   where id = p_reported and tenant_id = private.current_tenant_id();

  -- Unknown and other-tenant ids are the same answer as a stored report:
  -- no exception (it would roll back the attempt just counted), no row.
  if not found then
    return;
  end if;

  insert into public.reports (reporter_id, reported_id, reason, details, snapshot)
  values (
    v_user,
    v_target.id,
    p_reason,
    v_details,
    jsonb_build_object(
      'display_name', v_target.display_name,
      'bio', v_target.bio,
      'avatar_path', v_target.avatar_path
    )
  );

  -- The same rule blocks_insert applies: the block row reveals the card
  -- only if the reporter could already see it. Checked before the insert,
  -- whose trigger drops the connection that made the card visible.
  if p_block then
    insert into public.blocks (blocker_id, blocked_id, reveals_card)
    values (v_user, v_target.id, private.sees_card(v_user, v_target.id))
    on conflict (blocker_id, blocked_id) do nothing;
  end if;
end
$$;

revoke execute on function public.report_user(uuid, text, text, boolean) from public, anon;
grant execute on function public.report_user(uuid, text, text, boolean) to authenticated;

-- ====================================================== delete_my_account ==

create or replace function public.delete_my_account()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- The photos go first, through the Storage API (the API's delete flow
  -- does it). Deleting the account while they remain would leave public
  -- files that nobody can remove any more.
  if exists (
    select 1 from storage.objects
     where bucket_id = 'avatars' and name like v_user::text || '/%'
  ) then
    raise exception 'avatar files remain' using errcode = 'P0006';
  end if;

  delete from private.connect_request_attempts where requester_id = v_user;
  delete from private.claim_attempts where user_id = v_user;
  delete from private.gathering_create_attempts where host_id = v_user;
  delete from private.report_attempts where user_id = v_user;
  -- Reports this person filed are anonymised, and reports about them start
  -- their 90 days, by the reports foreign keys and the profile delete
  -- trigger, when the profile row goes.
  delete from auth.users where id = v_user;
end
$$;
