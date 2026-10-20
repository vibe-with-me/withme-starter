-- The card shows which platforms its owner can be reached on, locked.
--
-- A tap on a profile tag now lists the owner's link platforms ("Instagram",
-- "Email"), in their order, so a stranger knows what Connect unlocks. The
-- platform name moves to the card tier; the value (the handle, the number,
-- the address) stays in the connections tier and still never rides the
-- card. resolve_tag reads profile_links as its definer and selects only the
-- platform column, so the profile_links policies are unchanged: a client
-- still reads a row only as its owner or an accepted connection.
--
-- Every line of 20261017203000's body restated; the only change is the
-- 'link_platforms' key. Grants (anon, authenticated) survive the replace.
-- Re-stated by packages/db/test/links.test.ts.

create or replace function public.resolve_tag(p_uid text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid text := upper(trim(p_uid));
  v_tag public.tags%rowtype;
  v_profile public.profiles%rowtype;
  v_gathering public.gatherings%rowtype;
  v_destination jsonb;
  v_gathering_json jsonb := null;
begin
  select * into v_tag
    from public.tags
   where uid = v_uid and tenant_id = private.current_tenant_id();

  if not found or v_tag.status = 'unclaimed' then
    return jsonb_build_object('status', 'unclaimed', 'uid', v_uid);
  end if;

  if v_tag.status = 'disabled'
     or private.is_blocked((select auth.uid()), v_tag.claimed_by) then
    return jsonb_build_object('status', 'disabled', 'uid', v_uid);
  end if;

  select * into v_profile from public.profiles where id = v_tag.claimed_by;
  if not found then
    return jsonb_build_object('status', 'unclaimed', 'uid', v_uid);
  end if;

  v_destination := v_tag.destination;
  if v_destination->>'type' = 'gathering' then
    select * into v_gathering
      from public.gatherings
     where id = (v_destination->>'gathering_id')::uuid
       and tenant_id = private.current_tenant_id();
    if found
       and private.is_gathering_member(v_gathering.id, v_tag.claimed_by)
       and private.sees_gathering(v_gathering.id) then
      v_gathering_json := jsonb_build_object(
        'id', v_gathering.id,
        'title', v_gathering.title,
        'starts_at', v_gathering.starts_at,
        'location', v_gathering.location
      );
    else
      v_destination := '{"type": "profile"}'::jsonb;
    end if;
  end if;

  return jsonb_build_object(
    'status', 'claimed',
    'uid', v_uid,
    'destination', v_destination,
    'gathering', v_gathering_json,
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'display_name', v_profile.display_name,
      'avatar_path', v_profile.avatar_path,
      'bio', v_profile.bio
    ),
    -- Platform names only, never a value: the card tier.
    'link_platforms', coalesce(
      (select jsonb_agg(l.platform order by l.sort_order, l.platform)
         from public.profile_links l
        where l.profile_id = v_profile.id
          and l.tenant_id = private.current_tenant_id()),
      '[]'::jsonb
    )
  );
end
$$;
