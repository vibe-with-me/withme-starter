-- Share codes: a QR code that opens your card, for people without a tag or
-- without NFC on their phone.
--
-- A share code is a tag row of kind 'qr', minted and claimed to its owner
-- in one step by the database. It resolves through the unchanged
-- resolve_tag, so a scan shows exactly what a tap shows: the same card, a
-- blocked viewer gets 'disabled', the same edge and in-database limits.
--
--   * my_share_code() returns the caller's live code, minting it on first
--     use. One live code per person (a partial unique index).
--   * replace_my_share_code() retires the live code and mints a new one, so
--     a leaked screenshot stops working. A retired code is a tombstone:
--     status 'disabled', no owner, no destination, no scans. It resolves as
--     an inactive tag, nobody can claim it (claim_tag takes only
--     'unclaimed'), and nobody owns it to turn it back on. 10 replacements
--     per rolling hour per user, counted inside the RPC.
--   * Account deletion tombstones share codes instead of returning them to
--     unclaimed: a screenshot of a deleted person's code must never become
--     claimable, or the claimant's card would appear behind it.
--   * A share code always points at the owner's card (a CHECK), is never
--     unclaimed (a CHECK), and owners cannot update one through PostgREST
--     (tags_update_own now admits physical tags only).
--   * tag_scans gains scan_method, the @vibewithme/nfc ScanMethod values.
--     log_scan records 'qr' for every scan of a share code, whatever the
--     client says, and otherwise takes the client's optional hint.
--
-- Safe on live data: every existing tag becomes kind 'nfc' and every
-- existing scan 'unknown'; no share code exists until someone asks.

-- ================================================================== tables ==

alter table public.tags
  add column kind text not null default 'nfc' check (kind in ('nfc', 'qr'));

alter table public.tags add constraint tags_share_code_shape check (
  kind <> 'qr'
  or (status <> 'unclaimed' and (destination is null or destination = '{"type": "profile"}'::jsonb))
);

create unique index tags_one_live_share_code
  on public.tags (claimed_by) where kind = 'qr' and status = 'claimed';

alter table public.tag_scans
  add column scan_method text not null default 'unknown'
    check (scan_method in ('nfc', 'qr', 'direct', 'unknown'));

-- Ledger for replace_my_share_code, the private.claim_attempts pattern: no
-- FK (delete_my_account clears it), deny-all RLS, self-cleaning in the RPC.
create table private.share_code_replacements (
  user_id uuid not null,
  replaced_at timestamptz not null default now()
);
create index share_code_replacements_user_idx
  on private.share_code_replacements (user_id, replaced_at desc);
alter table private.share_code_replacements enable row level security;

-- ================================================================ policies ==

-- Owner CRUD covers physical tags only. A share code is managed through its
-- two RPCs; switching it off or re-pointing it is not a client's to do.
drop policy tags_update_own on public.tags;
create policy tags_update_own on public.tags
  for update to authenticated
  using (
    tenant_id = private.current_tenant_id()
    and claimed_by = (select auth.uid())
    and kind = 'nfc'
  )
  with check (
    tenant_id = private.current_tenant_id()
    and claimed_by = (select auth.uid())
    and kind = 'nfc'
  );

-- =============================================================== functions ==

-- A fresh share-code row for v_user. 56 random bits, the same 14-hex shape
-- as a physical UID; the primary key rejects the vanishing chance of a
-- collision with any existing tag, and the loop draws again.
create function private.mint_share_code(p_user uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid text;
begin
  loop
    v_uid := upper(encode(extensions.gen_random_bytes(7), 'hex'));
    begin
      insert into public.tags (uid, claimed_by, destination, status, kind)
      values (v_uid, p_user, '{"type": "profile"}'::jsonb, 'claimed', 'qr');
      return v_uid;
    exception when unique_violation then
      -- A taken uid draws again. The live-code index is the caller's to
      -- hold (both callers take the per-user lock first), so it never
      -- loops here.
      if exists (select 1 from public.tags where uid = v_uid) then
        continue;
      end if;
      raise;
    end;
  end loop;
end
$$;

-- Retire a share code: no owner, no destination, no scan history.
create function private.retire_share_codes(p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.tag_scans
   where tag_uid in (select uid from public.tags where claimed_by = p_user and kind = 'qr');
  update public.tags
     set claimed_by = null, destination = null, status = 'disabled'
   where claimed_by = p_user and kind = 'qr';
end
$$;

-- The caller's live share code, minted on first use.
create function public.my_share_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_uid text;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'profile required before sharing' using errcode = 'P0001';
  end if;

  -- Two first opens at once must mint one code, not race the index.
  perform pg_advisory_xact_lock(hashtextextended('share_code:' || v_user::text, 0));
  select uid into v_uid
    from public.tags
   where claimed_by = v_user and kind = 'qr' and status = 'claimed'
     and tenant_id = private.current_tenant_id();
  if found then
    return v_uid;
  end if;
  return private.mint_share_code(v_user);
end
$$;

-- Retire the caller's code and mint a new one: every copy of the old one
-- (a screenshot, a print) now opens an inactive tag.
create function public.replace_my_share_code()
returns text
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
  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'profile required before sharing' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('share_code:' || v_user::text, 0));
  delete from private.share_code_replacements
   where user_id = v_user and replaced_at <= now() - interval '1 hour';
  if (select count(*) from private.share_code_replacements where user_id = v_user) >= 10 then
    raise exception 'rate limit exceeded' using errcode = 'P0004';
  end if;
  insert into private.share_code_replacements (user_id) values (v_user);

  perform private.retire_share_codes(v_user);
  return private.mint_share_code(v_user);
end
$$;

-- log_scan gains the method. The old two-argument signature is dropped so
-- PostgREST has one function to call; the API passes the hint by name.
drop function public.log_scan(text, text);

create function public.log_scan(
  p_uid text,
  p_user_agent text default null,
  p_scan_method text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid text := upper(trim(p_uid));
begin
  if (
    select count(*)
      from public.tag_scans
     where tag_uid = v_uid and scanned_at > now() - interval '1 minute'
  ) >= 60 then
    return;
  end if;

  -- A share code is only ever reached by its QR code (or a copy of its
  -- link): its scans are 'qr' whatever the client says. For a physical tag
  -- the client's hint is kept when it is one of the known values.
  insert into public.tag_scans (tag_uid, tenant_id, user_agent, scan_method)
  select t.uid, t.tenant_id, nullif(left(p_user_agent, 512), ''),
         case
           when t.kind = 'qr' then 'qr'
           when p_scan_method in ('nfc', 'qr', 'direct') then p_scan_method
           else 'unknown'
         end
    from public.tags t
   where t.uid = v_uid;
end
$$;

-- Account deletion: physical tags go back to unclaimed, as before; share
-- codes become tombstones and never unclaimed.
create or replace function private.on_profile_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.retire_share_codes(old.id);
  delete from public.tag_scans
   where tag_uid in (select uid from public.tags where claimed_by = old.id);
  update public.tags
     set claimed_by = null, destination = null, status = 'unclaimed'
   where claimed_by = old.id;
  return old;
end
$$;

-- Restated from 20261016190000_reports_and_terms.sql (the newest version),
-- plus the share-code ledger.
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
  delete from private.share_code_replacements where user_id = v_user;
  -- Reports this person filed are anonymised, and reports about them start
  -- their 90 days, by the reports foreign keys and the profile delete
  -- trigger, when the profile row goes.
  delete from auth.users where id = v_user;
end
$$;

-- ================================================================== grants ==

revoke execute on function public.log_scan(text, text, text) from public;
grant execute on function public.log_scan(text, text, text) to anon, authenticated, service_role;

revoke execute on function public.my_share_code() from public, anon;
revoke execute on function public.replace_my_share_code() from public, anon;
grant execute on function public.my_share_code() to authenticated, service_role;
grant execute on function public.replace_my_share_code() to authenticated, service_role;

-- Called only from the definers above, never by a client.
revoke execute on function private.mint_share_code(uuid) from public, anon, authenticated;
revoke execute on function private.retire_share_codes(uuid) from public, anon, authenticated;
