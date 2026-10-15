-- Gatherings are listed to the domain; who's going is connections-only.
-- (docs/superpowers/specs/2026-10-14-gatherings-domain-wide.md)
--
-- The invitation-only scope shipped in 20261008120000 hid the one thing that
-- makes a scene visible: what is happening. This migration carries over the
-- balance Vibe With Me struck for its meetups:
--
--   * (a) Every signed-in user of the tenant sees every gathering — title,
--     time, place — minus a block in either direction with the host. A
--     viewer the host blocked, and a viewer who blocked the host, see no
--     gathering and no headcount: exactly what a stranger sees of a
--     gathering that does not exist.
--   * (b) Membership rows are readable only where the row is the viewer's
--     own or an accepted connection's, on a gathering the viewer can see.
--     Joining reveals your membership to the people you have already
--     connected with, and to nobody else. The host sees the same list as
--     everyone. Hosting is not a way to collect strangers' cards.
--   * (c) The card bridge is gone: co-membership never reveals a card.
--     profiles_select returns to the initial schema's text and
--     private.shares_gathering is dropped. Connections already see each
--     other's cards; strangers must not.
--   * (d) The headcount is a definer read that re-states (a), so a hidden
--     gathering has no count either.
--
-- join_gathering stays the only way in; (e) below makes its block check
-- symmetric to match (a). Blocking still evicts; resolve_tag is untouched;
-- private.is_gathering_member stays for the resolver. The mechanisms are
-- (a)–(e), re-stated by packages/db/test/gatherings.test.ts.
--
-- What a stranger learns, stated plainly: a listed gathering exposes its
-- host_id to the tenant. The id is not a card (profiles_select still hides
-- the host until the pair connects); what it allows is one consent-gated
-- send_connect_request, which the host receives with the requester's card
-- and may decline or block.

-- ============================================================ (a) feed ==

drop policy gatherings_select on public.gatherings;
create policy gatherings_select on public.gatherings
  for select to authenticated
  using (
    tenant_id = private.current_tenant_id()
    and (
      host_id = (select auth.uid())
      or (
        not private.is_blocked((select auth.uid()), host_id)
        and not private.is_blocked(host_id, (select auth.uid()))
      )
    )
  );

-- ===================================================== (b) who's going ==

-- The gatherings subquery runs under (a) for the viewer, so a hidden
-- gathering hides its rows too. No recursion: gatherings_select no longer
-- reads gathering_members. The connections clause is the one
-- profiles_select uses; a block deletes the connection, so "no block either
-- way" is implied.
drop policy gathering_members_select on public.gathering_members;
create policy gathering_members_select on public.gathering_members
  for select to authenticated
  using (
    tenant_id = private.current_tenant_id()
    and exists (
      select 1 from public.gatherings g
      where g.id = gathering_members.gathering_id
    )
    and (
      profile_id = (select auth.uid())
      or exists (
        select 1 from public.connections c
        where (c.user_a = (select auth.uid()) and c.user_b = gathering_members.profile_id)
           or (c.user_b = (select auth.uid()) and c.user_a = gathering_members.profile_id)
      )
    )
  );

-- ======================================================= (c) no bridge ==

-- Byte-identical to the initial schema (20260610120000): the
-- shares_gathering disjunct that 20261008120000 added is the only removal.
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    tenant_id = private.current_tenant_id()
    and (
      id = (select auth.uid())
      -- the blocker always sees whom they blocked (their own list UI),
      -- even under a mutual block
      or exists (
        select 1 from public.blocks b
        where b.blocker_id = (select auth.uid()) and b.blocked_id = profiles.id
      )
      or (
        not private.is_blocked((select auth.uid()), id)
        and (
          exists (
            select 1 from public.connections c
            where (c.user_a = (select auth.uid()) and c.user_b = profiles.id)
               or (c.user_b = (select auth.uid()) and c.user_a = profiles.id)
          )
          or exists (
            select 1 from public.connect_requests r
            where r.requester_id = profiles.id
              and r.recipient_id = (select auth.uid())
              and r.status = 'pending'
              and r.expires_at > now()
          )
        )
      )
    )
  );

drop function private.shares_gathering(uuid, uuid);

-- ========================================================= (d) headcount ==

-- Definer: gathering_members_select would count only the rows the viewer
-- may see. The where clause re-states (a) so the count exists exactly when
-- the gathering does, for this viewer.
create function public.gathering_member_counts(p_ids uuid[])
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
     and (
       g.host_id = (select auth.uid())
       or (
         not private.is_blocked((select auth.uid()), g.host_id)
         and not private.is_blocked(g.host_id, (select auth.uid()))
       )
     )
   group by gm.gathering_id
$$;

revoke execute on function public.gathering_member_counts(uuid[]) from public, anon;
grant execute on function public.gathering_member_counts(uuid[]) to authenticated, service_role;

-- ============================================================ (e) join ==

-- A joiner who blocked the host now reads the gathering as nonexistent
-- ((a) is symmetric), and a gathering that does not exist cannot be
-- joined: without this, their membership would be invisible to them,
-- unleavable, and counted by the host. Same 'gathering not found' for both
-- directions and for a missing id — byte-identical, no oracle. Every
-- attribute of the original restated; grants survive the replace.
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

  select * into v_gathering
    from public.gatherings
   where id = p_gathering_id and tenant_id = private.current_tenant_id();
  if not found then
    raise exception 'gathering not found' using errcode = 'P0003';
  end if;

  -- serialize against a concurrent block by/of the host
  perform private.lock_pair(v_user, v_gathering.host_id);

  if private.is_blocked(v_user, v_gathering.host_id)
     or private.is_blocked(v_gathering.host_id, v_user) then
    raise exception 'gathering not found' using errcode = 'P0003';
  end if;

  insert into public.gathering_members (gathering_id, profile_id, tenant_id)
  values (v_gathering.id, v_user, v_gathering.tenant_id)
  on conflict do nothing;
end
$$;
