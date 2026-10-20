-- Put the shared demo back the way the seed left it, on a schedule.
--
-- With a public demo login, visitors edit Ada's card, re-point or release
-- her tag, delete her gathering, block Lin. private.restore_demo() undoes
-- all of it in one transaction, touching only the two demo accounts
-- (Ada and Lin at the 'demo_account_domain' of private.settings) and the
-- three demo tags. Strangers' accounts, cards and gatherings stay; what
-- goes is what ties a stranger to the shared logins:
--   * Ada's and Lin's connections and requests, with anyone. Whoever holds
--     the demo password sees a connection's links, so a stranger who
--     connected with Ada is exposed until the next run, not for good.
--   * Blocks Ada or Lin made (a visitor as Ada blocking strangers would hide
--     her card from them). Blocks strangers made of Ada stay theirs.
--   * Ada's and Lin's memberships in strangers' gatherings, and every
--     gathering they host (recreated: new ids each run).
--   * Their push tokens, push throttle and rate-limit ledgers.
--   * Their sessions idle for more than a day. GoTrue can't delete a demo
--     session (20261020120000_demo_account_guard), so this is what ends
--     signed-out ones; a visitor active in the last day stays signed in.
-- Reports filed as Ada stay: they are for the moderator.
--
-- A photo a visitor uploads as Ada loses its pointer here; the file stays in
-- Storage → avatars (a SQL delete would orphan the blob). Empty the folder
-- after the demo window.
--
-- No-op (returns 'off') while the setting is null, and 'missing' when the
-- domain has no ada@/lin@ users (seed first). Nobody but postgres runs it:
-- the SQL Editor, or pg_cron:
--
--   select cron.schedule('restore-demo', '0 * * * *', 'select private.restore_demo()');
--   select cron.unschedule('restore-demo');   -- after the window
--
-- Keep it in step with supabase/seed/index.ts, which builds the same state
-- through the public RPCs. Re-stated by packages/db/test/demo-accounts.test.ts.

create function private.restore_demo()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_domain text := private.demo_account_domain();
  v_ada uuid;
  v_lin uuid;
  v_gathering uuid;
begin
  if v_domain is null then
    return 'off';
  end if;
  select id into v_ada from auth.users where lower(email) = 'ada@' || v_domain;
  select id into v_lin from auth.users where lower(email) = 'lin@' || v_domain;
  if v_ada is null or v_lin is null
     or (select count(*) from public.profiles where id in (v_ada, v_lin)) <> 2 then
    return 'missing';
  end if;

  -- One run at a time.
  perform pg_advisory_xact_lock(hashtext('private.restore_demo'));

  -- Quiet first: nothing below should push to a visitor's phone.
  delete from public.push_tokens where user_id in (v_ada, v_lin);
  delete from private.push_throttle where recipient_id in (v_ada, v_lin);
  delete from auth.sessions
   where user_id in (v_ada, v_lin)
     and coalesce(refreshed_at, updated_at, created_at) < now() - interval '1 day';

  update public.profiles
     set display_name = 'Ada', bio = 'Brings the good playlists.', avatar_path = null
   where id = v_ada;
  update public.profiles
     set display_name = 'Lin', bio = 'Will trade book recs.', avatar_path = null
   where id = v_lin;

  delete from public.profile_links where profile_id in (v_ada, v_lin);
  insert into public.profile_links (profile_id, platform, value, sort_order) values
    (v_ada, 'instagram', 'ada.plays', 0),
    (v_ada, 'tiktok', 'ada.plays', 1),
    (v_ada, 'x', 'ada_plays', 2),
    (v_ada, 'youtube', 'adaplays', 3),
    (v_ada, 'email', 'ada@' || v_domain, 4),
    (v_ada, 'website', 'https://ada.example', 5);

  delete from public.blocks where blocker_id in (v_ada, v_lin);
  delete from public.connections
   where user_a in (v_ada, v_lin) or user_b in (v_ada, v_lin);
  delete from public.connect_requests
   where requester_id in (v_ada, v_lin) or recipient_id in (v_ada, v_lin);
  delete from public.gathering_members where profile_id in (v_ada, v_lin);
  delete from public.gatherings where host_id in (v_ada, v_lin);

  delete from private.connect_request_attempts where requester_id in (v_ada, v_lin);
  delete from private.claim_attempts where user_id in (v_ada, v_lin);
  delete from private.gathering_create_attempts where host_id in (v_ada, v_lin);

  -- Lin has tapped Ada's tag and asked to connect.
  insert into public.connect_requests (requester_id, recipient_id)
  values (v_lin, v_ada);

  -- Ada hosts one Lin joined; Lin hosts one with a capacity. Days out, so
  -- the Events tab is never empty between runs.
  insert into public.gatherings (host_id, title, starts_at, location)
  values (v_ada, 'Rooftop listening session',
          date_trunc('day', now()) + interval '2 days 19 hours', 'The roof, 14 Loom St')
  returning id into v_gathering;
  -- create_gathering makes the host a member; so does this.
  insert into public.gathering_members (gathering_id, profile_id)
  values (v_gathering, v_ada), (v_gathering, v_lin);
  insert into public.gatherings (host_id, title, starts_at, location, capacity)
  values (v_lin, 'Vinyl swap in the park',
          date_trunc('day', now()) + interval '5 days 14 hours', 'The bandstand, Loom Park', 12)
  returning id into v_gathering;
  insert into public.gathering_members (gathering_id, profile_id)
  values (v_gathering, v_lin);

  -- The three demo tags: 04BB… opens Ada's card, 04CC… is hers but off,
  -- 04AA… waits to be claimed. Their scans stay.
  insert into public.tags (uid) values ('04AAAAAAAAAAAA'), ('04BBBBBBBBBBBB'), ('04CCCCCCCCCCCC')
  on conflict (uid) do nothing;
  update public.tags set claimed_by = null, destination = null, status = 'unclaimed', kind = 'nfc'
   where uid = '04AAAAAAAAAAAA';
  update public.tags
     set claimed_by = v_ada, destination = '{"type": "profile"}'::jsonb, status = 'claimed', kind = 'nfc'
   where uid = '04BBBBBBBBBBBB';
  update public.tags
     set claimed_by = v_ada, destination = '{"type": "profile"}'::jsonb, status = 'disabled', kind = 'nfc'
   where uid = '04CCCCCCCCCCCC';

  return 'restored';
end
$$;

revoke execute on function private.restore_demo() from public, anon, authenticated;
