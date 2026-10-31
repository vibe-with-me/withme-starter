-- Minted tags: a tag row for a blank sticker someone writes in the app.
--
-- mint_my_tag() inserts one physical tag, claimed to the caller from the
-- moment it exists and pointing at their card. While its owner has an account
-- it is an ordinary tag: they re-point it and turn it off, it resolves through
-- the unchanged resolve_tag, and claim_tag cannot take it.
--
-- Deleting the account retires a minted tag instead of returning it to
-- unclaimed, the same treatment as a share code: status 'disabled', no owner,
-- no destination, no scans. Otherwise signing up, minting and deleting would
-- be a way to make claimable rows with no operator involved, which is what
-- provision-tags guards against. Provisioned tags still return to unclaimed.
--
-- The cap is the only limit. Owners cannot release a tag, so a per-person cap
-- bounds how many rows one account can make. Claimed stickers count, share
-- codes do not, and claim_tag does not check it: someone at the cap can still
-- claim a tag they were given.
--
-- The cap's value is MAX_OWNED_TAGS in packages/contract/src/schemas/tag.ts.

-- Not client-writable: tags grants update on destination and status only.
alter table public.tags add column minted boolean not null default false;

create function public.mint_my_tag()
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
    raise exception 'profile required before minting' using errcode = 'P0001';
  end if;

  -- Concurrent mints must not all pass the count.
  perform pg_advisory_xact_lock(hashtextextended('mint_tag:' || v_user::text, 0));
  if (
    select count(*)
      from public.tags
     where claimed_by = v_user and kind = 'nfc'
       and tenant_id = private.current_tenant_id()
  ) >= 25 then
    raise exception 'tag limit reached' using errcode = 'P0004';
  end if;

  loop
    v_uid := upper(encode(extensions.gen_random_bytes(7), 'hex'));
    begin
      insert into public.tags (uid, claimed_by, destination, status, kind, minted)
      values (v_uid, v_user, '{"type": "profile"}'::jsonb, 'claimed', 'nfc', true);
      return v_uid;
    exception when unique_violation then
      -- A taken uid draws again; any other unique violation is a real error.
      if exists (select 1 from public.tags where uid = v_uid) then
        continue;
      end if;
      raise;
    end;
  end loop;
end
$$;

revoke execute on function public.mint_my_tag() from public, anon;
grant execute on function public.mint_my_tag() to authenticated, service_role;

-- Account deletion: as in 20261017120100_share_codes, plus minted tags become
-- tombstones. The tombstones go first, so the last update only sees the tags
-- that return to unclaimed.
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
     set claimed_by = null, destination = null, status = 'disabled'
   where claimed_by = old.id and minted;
  update public.tags
     set claimed_by = null, destination = null, status = 'unclaimed'
   where claimed_by = old.id;
  return old;
end
$$;
