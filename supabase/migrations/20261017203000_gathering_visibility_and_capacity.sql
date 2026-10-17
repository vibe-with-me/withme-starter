-- Two host controls on a gathering: who can see it, and how many can go.
--
-- Until now every signed-in user of the tenant saw every gathering
-- (20261014220000). Posting where you will be to the whole app is the wrong
-- default for a meetup at someone's home or among friends, and most
-- verticals have a natural cap (a round of golf is four). Both were left to
-- forks; they are core now, because the hard parts are RLS and concurrency.
--
--   * (a) visibility: 'everyone' (the default, the behaviour so far) or
--     'connections'. A connections gathering is listed, counted, readable
--     and joinable only by the host, its current members, and the host's
--     accepted connections, minus a block either way with the host, as
--     before. Switching an open gathering to 'connections' keeps everyone
--     already going (they are members); switching back is always allowed.
--     No invite lists and no third value.
--   * (b) One rule, private.sees_gathering, read by every path that shows a
--     gathering: gatherings_select (the feed, the detail, your own list, and
--     gathering_members_select through its subquery), the headcount,
--     join_gathering and resolve_tag's gathering line. Membership is read
--     through the definer private.is_gathering_member, so gatherings_select
--     still never reads gathering_members under RLS (no recursion).
--   * (c) capacity: null (no limit) or 2..500. The host counts toward it, so
--     a round of 4 is the host and three. 500 is about the largest room a
--     community meetup books; past that a cap no longer means "spots" and no
--     limit is the honest setting. Lowering it below the current headcount
--     keeps everyone and only stops new joins. Leaving frees a spot. No
--     waitlist and no push when a spot opens.
--   * (d) join_gathering locks the gathering row before it counts, so two
--     joins for the last spot serialize and the second one reads the first.
--     A full gathering answers 'gathering is full' (P0007), checked after
--     every visibility check: only someone who already sees the gathering
--     and its headcount can learn it is full, so nothing new leaks.
--   * (e) resolve_tag shows the gathering line only where sees_gathering
--     holds; otherwise the tap degrades to the profile card, the same answer
--     as a dangling destination, so a stranger (or anon) holding the host's
--     tag or share code learns nothing about a hidden gathering. The block
--     check there becomes symmetric with the feed: a tapper who blocked the
--     host no longer sees the line.
--
-- Mechanisms (a)-(e) are re-stated by packages/db/test/gathering-visibility
-- .test.ts and gathering-capacity.test.ts. Every redefined function starts
-- from its newest body: create_gathering (20261016120000), join_gathering
-- and gathering_member_counts (20261014220000), resolve_tag (20261011120000).

-- ================================================================ columns ==

alter table public.gatherings
  add column visibility text not null default 'everyone'
    constraint gatherings_visibility_known check (visibility in ('everyone', 'connections')),
  add column capacity integer
    constraint gatherings_capacity_range check (capacity is null or capacity between 2 and 500);

-- Hosts may change both after creating; host_id and tenant_id stay immutable.
revoke update on public.gatherings from authenticated;
grant update (title, starts_at, location, visibility, capacity) on public.gatherings to authenticated;

-- ============================================================= (b) rule ==

-- "Does p_viewer see this gathering?" The host always; otherwise no block
-- either way with the host, and either it is for everyone, or the viewer is
-- the host's accepted connection or already a member. A null viewer (anon,
-- in resolve_tag) sees only an 'everyone' gathering.
create function private.sees_gathering(
  p_viewer uuid,
  p_gathering uuid,
  p_host uuid,
  p_visibility text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_viewer = p_host, false)
    or (
      not private.is_blocked(p_viewer, p_host)
      and not private.is_blocked(p_host, p_viewer)
      and (
        p_visibility = 'everyone'
        or (
          p_viewer is not null
          and (
            exists (
              select 1 from public.connections c
              where c.user_a = least(p_viewer, p_host)
                and c.user_b = greatest(p_viewer, p_host)
            )
            or private.is_gathering_member(p_gathering, p_viewer)
          )
        )
      )
    )
$$;

revoke execute on function private.sees_gathering(uuid, uuid, uuid, text) from public, anon;
grant execute on function private.sees_gathering(uuid, uuid, uuid, text) to authenticated;

-- ============================================================ (a) feed ==

drop policy gatherings_select on public.gatherings;
create policy gatherings_select on public.gatherings
  for select to authenticated
  using (
    tenant_id = private.current_tenant_id()
    and private.sees_gathering((select auth.uid()), id, host_id, visibility)
  );

-- gathering_members_select is unchanged: its gatherings subquery runs under
-- the policy above, so a hidden gathering hides its member rows too.

-- ========================================================= (b) headcount ==

create or replace function public.gathering_member_counts(p_ids uuid[])
returns table (gathering_id uuid, member_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select gm.gathering_id, count(*)
    from public.gathering_members gm
    join public.gatherings g on g.id = gm.gathering_id
   where gm.gathering_id = any(p_ids)
     and g.tenant_id = private.current_tenant_id()
     and private.sees_gathering((select auth.uid()), g.id, g.host_id, g.visibility)
   group by gm.gathering_id
$$;

-- ==================================================== create_gathering ==

-- The two new arguments have defaults, so a caller that names only title,
-- start and location still resolves (PostgREST matches named arguments).
drop function if exists public.create_gathering(text, timestamptz, text);

create function public.create_gathering(
  p_title text,
  p_starts_at timestamptz,
  p_location text default null,
  p_visibility text default 'everyone',
  p_capacity integer default null
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

  -- The CHECKs refuse an unknown visibility or an out-of-range capacity (23514).
  insert into public.gatherings (host_id, title, starts_at, location, visibility, capacity)
  values (
    v_user,
    trim(p_title),
    p_starts_at,
    nullif(trim(p_location), ''),
    coalesce(p_visibility, 'everyone'),
    p_capacity
  )
  returning * into v_gathering;

  insert into public.gathering_members (gathering_id, profile_id, tenant_id)
  values (v_gathering.id, v_user, v_gathering.tenant_id);

  return jsonb_build_object(
    'id', v_gathering.id,
    'title', v_gathering.title,
    'starts_at', v_gathering.starts_at,
    'location', v_gathering.location,
    'visibility', v_gathering.visibility,
    'capacity', v_gathering.capacity,
    'host_id', v_gathering.host_id,
    'created_at', v_gathering.created_at
  );
end
$$;

revoke execute on function public.create_gathering(text, timestamptz, text, text, integer) from public, anon;
grant execute on function public.create_gathering(text, timestamptz, text, text, integer) to authenticated;

-- ============================================================ (d) join ==

-- Every refusal before the capacity check is the same 'gathering not found'
-- (P0003) as a missing id: blocked either way, or a connections gathering
-- the joiner is not admitted to. Grants survive the replace.
create or replace function public.join_gathering(p_gathering_id uuid)
returns void
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
    raise exception 'profile required before joining a gathering' using errcode = 'P0001';
  end if;

  -- The row lock serializes joins of one gathering, so the count below
  -- includes any join that committed first (two joins for the last spot
  -- cannot both pass), and a host's concurrent capacity edit lands before
  -- or after this whole join, never in the middle.
  select * into v_gathering
    from public.gatherings
   where id = p_gathering_id and tenant_id = private.current_tenant_id()
   for update;
  if not found then
    raise exception 'gathering not found' using errcode = 'P0003';
  end if;

  -- serialize against a concurrent block by/of the host
  perform private.lock_pair(v_user, v_gathering.host_id);

  if private.is_blocked(v_user, v_gathering.host_id)
     or private.is_blocked(v_gathering.host_id, v_user)
     or not private.sees_gathering(v_user, v_gathering.id, v_gathering.host_id, v_gathering.visibility) then
    raise exception 'gathering not found' using errcode = 'P0003';
  end if;

  -- Already going: a no-op, even when the gathering is full.
  if private.is_gathering_member(v_gathering.id, v_user) then
    return;
  end if;

  if v_gathering.capacity is not null and (
    select count(*) from public.gathering_members where gathering_id = v_gathering.id
  ) >= v_gathering.capacity then
    raise exception 'gathering is full' using errcode = 'P0007';
  end if;

  insert into public.gathering_members (gathering_id, profile_id, tenant_id)
  values (v_gathering.id, v_user, v_gathering.tenant_id)
  on conflict do nothing;
end
$$;

-- ===================================================== (e) resolve_tag ==

-- Every line of 20261011120000's body restated; the only change is the
-- gathering line's condition, which now asks sees_gathering instead of a
-- one-way block check. Grants (anon, authenticated) survive the replace.
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
       and private.sees_gathering(
         (select auth.uid()), v_gathering.id, v_gathering.host_id, v_gathering.visibility
       ) then
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
    )
  );
end
$$;
