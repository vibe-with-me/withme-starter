-- Limits that hold even when a client skips the API, and an account
-- deletion that cannot leave photos behind.
--
-- The API Worker's rate limits only see calls that go through it. The
-- publishable key reaches PostgREST directly, so anything that must hold
-- for every caller lives here, inside the definer RPCs:
--
--   * claim_tag: a per-user attempt ledger (30 per rolling hour, success or
--     not), and one answer for a UID that does not exist and one that is
--     claimed or disabled: the function returns null. Before, P0003 vs P0002
--     told a caller which UIDs exist; with factory UIDs, which run nearly
--     sequentially, that let anyone map a batch and race its owners. It
--     returns rather than raises because an exception would roll back the
--     ledger row, and a failed guess is exactly what must count. The API
--     maps null to CONFLICT, as it mapped P0002.
--   * create_gathering: a per-host ledger (5 per rolling hour) and a cap of
--     20 upcoming gatherings per host. One account could otherwise fill the
--     domain-wide feed for everyone.
--   * gatherings.starts_at: at most a year ahead, on insert and on any
--     update of starts_at (the host edits through PostgREST, not an RPC), by
--     trigger: now() cannot sit in a CHECK. The same trigger holds the
--     20-upcoming cap when an edit moves a past gathering into the future.
--   * delete_my_account: refuses while the caller's avatar folder still
--     holds files. The API empties it through the Storage API first; a
--     direct RPC call, or an API run that failed partway, used to delete
--     the account and leave the photos public with no owner to remove them.
--
-- Safe on live data: the ledgers start empty, the trigger checks only rows
-- written from now on (an existing gathering more than a year out is kept
-- until someone edits its start), and a host who already has 20 upcoming
-- gatherings keeps them all and simply cannot create a 21st.
--
-- Ledgers follow private.connect_request_attempts: no FK (delete_my_account
-- clears them), deny-all RLS, self-cleaning inside the RPC. A transaction
-- advisory lock per user makes count-then-insert safe against parallel calls.

-- ================================================================= ledgers ==

create table private.claim_attempts (
  user_id uuid not null,
  attempted_at timestamptz not null default now()
);
create index claim_attempts_user_idx on private.claim_attempts (user_id, attempted_at desc);
alter table private.claim_attempts enable row level security;

create table private.gathering_create_attempts (
  host_id uuid not null,
  attempted_at timestamptz not null default now()
);
create index gathering_create_attempts_host_idx
  on private.gathering_create_attempts (host_id, attempted_at desc);
alter table private.gathering_create_attempts enable row level security;

-- ============================================================== claim_tag ==

create or replace function public.claim_tag(
  p_uid text,
  p_destination jsonb default '{"type": "profile"}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid text := upper(trim(p_uid));
  v_user uuid := (select auth.uid());
  v_tag public.tags%rowtype;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'profile required before claiming' using errcode = 'P0001';
  end if;

  -- Every attempt counts, before the tag is looked up: 30 per rolling hour.
  perform pg_advisory_xact_lock(hashtextextended('claim_tag:' || v_user::text, 0));
  delete from private.claim_attempts
   where user_id = v_user and attempted_at <= now() - interval '1 hour';
  if (select count(*) from private.claim_attempts where user_id = v_user) >= 30 then
    raise exception 'rate limit exceeded' using errcode = 'P0004';
  end if;
  insert into private.claim_attempts (user_id) values (v_user);

  update public.tags
     set claimed_by = v_user, destination = p_destination, status = 'claimed'
   where uid = v_uid
     and tenant_id = private.current_tenant_id()
     and status = 'unclaimed'
  returning * into v_tag;

  -- Unknown, claimed and disabled are one answer, null: no existence
  -- oracle, and no exception to roll back the attempt just recorded.
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'uid', v_tag.uid,
    'status', v_tag.status,
    'destination', v_tag.destination
  );
end
$$;

-- ======================================================= create_gathering ==

create or replace function public.create_gathering(
  p_title text,
  p_starts_at timestamptz,
  p_location text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_gathering public.gatherings%rowtype;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'profile required before hosting a gathering' using errcode = 'P0001';
  end if;

  -- 5 creations per rolling hour, and at most 20 upcoming at once.
  perform pg_advisory_xact_lock(hashtextextended('create_gathering:' || v_user::text, 0));
  delete from private.gathering_create_attempts
   where host_id = v_user and attempted_at <= now() - interval '1 hour';
  if (select count(*) from private.gathering_create_attempts where host_id = v_user) >= 5 then
    raise exception 'rate limit exceeded' using errcode = 'P0004';
  end if;
  if (
    select count(*) from public.gatherings where host_id = v_user and starts_at > now()
  ) >= 20 then
    raise exception 'too many upcoming gatherings' using errcode = 'P0004';
  end if;
  insert into private.gathering_create_attempts (host_id) values (v_user);

  insert into public.gatherings (host_id, title, starts_at, location)
  values (v_user, trim(p_title), p_starts_at, nullif(trim(p_location), ''))
  returning * into v_gathering;

  insert into public.gathering_members (gathering_id, profile_id, tenant_id)
  values (v_gathering.id, v_user, v_gathering.tenant_id);

  return jsonb_build_object(
    'id', v_gathering.id,
    'title', v_gathering.title,
    'starts_at', v_gathering.starts_at,
    'location', v_gathering.location,
    'host_id', v_gathering.host_id,
    'created_at', v_gathering.created_at
  );
end
$$;

-- ============================================================== starts_at ==

create function private.gathering_starts_at_in_range()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.starts_at > now() + interval '1 year' then
    raise exception 'starts_at is more than a year ahead' using errcode = '22023';
  end if;
  -- Moving a past gathering back into the future makes it upcoming again,
  -- so the 20-upcoming cap create_gathering checks applies here too.
  -- (Inserts only come through create_gathering: there is no insert policy.)
  if tg_op = 'UPDATE' and old.starts_at <= now() and new.starts_at > now() and (
    select count(*) from public.gatherings
     where host_id = new.host_id and starts_at > now() and id <> new.id
  ) >= 20 then
    raise exception 'too many upcoming gatherings' using errcode = 'P0004';
  end if;
  return new;
end
$$;

create trigger gatherings_starts_at_in_range
  before insert or update of starts_at on public.gatherings
  for each row execute function private.gathering_starts_at_in_range();

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
  delete from auth.users where id = v_user;
end
$$;
