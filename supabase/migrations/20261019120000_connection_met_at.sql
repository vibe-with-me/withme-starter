-- A connection remembers the gathering where it happened.
--
-- A tag tap at a meetup became a connection with no trace of the meetup:
-- a week later the list said who, never where. Now accept_connect_request
-- records the gathering the two of them were at, and the list shows it.
--
--   * (a) Inferred, never claimed: the database picks the gathering, the
--     client sends nothing. It is one both parties are members of, starting
--     between 12 hours before and 2 hours after the request was sent (the
--     tap), the closest to the tap winning. No shared gathering in that
--     window: null, and the row shows no event. A client cannot name an
--     event it was not at, or attach a stranger's gathering to a connection.
--   * (b) Read at accept, from the request's created_at: membership is
--     checked then, so someone who left before the accept is not placed
--     there. Nothing is stored on connect_requests, so a pending request
--     never tells the recipient which gathering the requester is going to
--     (gathering_members_select shows co-members only to connections).
--   * (c) Nothing new leaks: once accepted the two are connections, and
--     gathering_members_select already shows each to the other as a member
--     of every gathering they share. The list reads the gathering through
--     gatherings_select (sees_gathering), so a viewer who no longer sees it
--     (a block with the host, a connections gathering they left) gets null.
--   * (d) Server-set only: connections has no insert or update policy, so
--     gathering_id is written by accept alone. A deleted
--     gathering sets it null; the connection stays.
--
-- Redefines accept_connect_request (extend-profile tells forks to change
-- it): every line of 20261014190000's body restated, plus the gathering
-- pick and the 'gathering' key. Grants survive the replace. Re-stated by
-- packages/db/test/connection-met-at.test.ts.

-- ================================================================= column ==

alter table public.connections
  add column gathering_id uuid references public.gatherings (id) on delete set null;

create index connections_gathering_idx on public.connections (gathering_id);

-- ================================================================= accept ==

create or replace function public.accept_connect_request(p_request_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_requester uuid;
  v_req public.connect_requests%rowtype;
  v_conn public.connections%rowtype;
  v_profile public.profiles%rowtype;
  v_gathering_id uuid;
  v_gathering public.gatherings%rowtype;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- Take the pair lock BEFORE the row lock (same order as send/block) so a
  -- block landing concurrently cannot interleave with this accept.
  select requester_id into v_requester
    from public.connect_requests
   where id = p_request_id and recipient_id = v_user and status = 'pending';
  if not found then
    raise exception 'request not found' using errcode = 'P0003';
  end if;
  perform private.lock_pair(v_user, v_requester);

  select * into v_req
    from public.connect_requests
   where id = p_request_id and recipient_id = v_user and status = 'pending'
   for update;
  if not found
     or private.is_blocked(v_user, v_req.requester_id)
     or private.is_blocked(v_req.requester_id, v_user) then
    -- deleted or blocked while we waited: identical to never-existed
    raise exception 'request not found' using errcode = 'P0003';
  end if;

  if v_req.expires_at <= now() then
    update public.connect_requests set status = 'expired' where id = p_request_id;
    raise exception 'request expired' using errcode = 'P0005';
  end if;

  update public.connect_requests set status = 'accepted' where id = p_request_id;

  -- (a)(b) The gathering they were both at when the request was sent.
  select g.id into v_gathering_id
    from public.gatherings g
    join public.gathering_members ma
      on ma.gathering_id = g.id and ma.profile_id = v_user
    join public.gathering_members mb
      on mb.gathering_id = g.id and mb.profile_id = v_req.requester_id
   where g.tenant_id = v_req.tenant_id
     and g.starts_at between v_req.created_at - interval '12 hours'
                         and v_req.created_at + interval '2 hours'
   order by abs(extract(epoch from g.starts_at - v_req.created_at)), g.id
   limit 1;

  insert into public.connections (tenant_id, user_a, user_b, gathering_id)
  values (
    v_req.tenant_id,
    least(v_user, v_req.requester_id),
    greatest(v_user, v_req.requester_id),
    v_gathering_id
  )
  on conflict (user_a, user_b) do update
    set gathering_id = coalesce(public.connections.gathering_id, excluded.gathering_id)
  returning * into v_conn;

  select * into v_profile from public.profiles where id = v_req.requester_id;

  -- (c) The accepter's own view of it, the same rule the list reads.
  if v_conn.gathering_id is not null and private.sees_gathering(v_conn.gathering_id) then
    select * into v_gathering from public.gatherings where id = v_conn.gathering_id;
  end if;

  return jsonb_build_object(
    'id', v_conn.id,
    'created_at', v_conn.created_at,
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'display_name', v_profile.display_name,
      'avatar_path', v_profile.avatar_path,
      'bio', v_profile.bio
    ),
    'links', (
      select coalesce(
        jsonb_agg(jsonb_build_object('platform', l.platform, 'value', l.value) order by l.sort_order),
        '[]'::jsonb
      )
      from public.profile_links l
      where l.profile_id = v_req.requester_id
    ),
    'gathering', case when v_gathering.id is null then null else jsonb_build_object(
      'id', v_gathering.id,
      'title', v_gathering.title,
      'starts_at', v_gathering.starts_at
    ) end
  );
end
$$;
