-- Minted tags: a tag row for a blank sticker someone writes in the app.
--
-- mint_my_tag() inserts one physical tag, claimed to the caller from the
-- moment it exists and pointing at their card. It is never unclaimed, so
-- claim_tag can never take it and it never joins the inventory
-- provision-tags guards; only its owner's My tags lists it. After that it is
-- an ordinary tag: its owner re-points it and turns it off, and it resolves
-- through the unchanged resolve_tag.
--
-- The cap is the only limit. Owners cannot release a tag, so a per-person cap
-- already bounds how many rows one account can make. Claimed stickers count,
-- share codes do not, and claim_tag does not check it: someone at the cap can
-- still claim a tag they were given.
--
-- The cap's value is MAX_OWNED_TAGS in packages/contract/src/schemas/tag.ts.

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
    select count(*) from public.tags where claimed_by = v_user and kind = 'nfc'
  ) >= 25 then
    raise exception 'tag limit reached' using errcode = 'P0004';
  end if;

  loop
    v_uid := upper(encode(extensions.gen_random_bytes(7), 'hex'));
    begin
      insert into public.tags (uid, claimed_by, destination, status, kind)
      values (v_uid, v_user, '{"type": "profile"}'::jsonb, 'claimed', 'nfc');
      return v_uid;
    exception when unique_violation then
      -- A taken uid draws again.
      continue;
    end;
  end loop;
end
$$;

revoke execute on function public.mint_my_tag() from public, anon;
grant execute on function public.mint_my_tag() to authenticated, service_role;
