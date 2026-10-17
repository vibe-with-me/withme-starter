-- Push notifications: transactional only, three kinds, ever.
--
--   * someone sent you a connect request  (connect_requests insert)
--   * someone accepted yours              (connect_requests -> accepted)
--   * people joined your gathering        (gathering_members insert)
--
-- Nothing else sends: no engagement, no digests, no reminders.
--
-- Why the database sends, not the API: the sender's request carries the
-- sender's JWT, which cannot (and must not) read the recipient's tokens.
-- The API never holds the service-role key, and a token-reading RPC would
-- be callable straight over PostgREST. So the send happens in triggers on
-- the rows that already encode consent, through pg_net, to one configured
-- URL (Expo's push service; private.settings 'push_url'). pg_net's queue
-- is transactional: a rolled-back
-- write sends nothing, and a send silently dropped by a block writes no row
-- and so cannot push. pg_net is asynchronous, so the caller's response time
-- does not depend on whether a push went out.
--
-- Expo's answers are read lazily, the way request expiry is (the stack has
-- no background jobs): every send first sweeps finished responses for
-- earlier batches and deletes the tokens Expo reported DeviceNotRegistered.
-- Nothing is retried: the in-app pending count is the source of truth, and
-- a missed push costs nothing. Tokens the app has not refreshed in 30 days
-- are swept too, which covers what Expo's receipts would have reported.

create extension if not exists pg_net with schema extensions;

-- Supabase grants pg_net's functions to anon and authenticated, and a
-- revoke from here is a no-op (Supabase's own role owns `net`). What keeps
-- them out is that `net` is not an exposed schema: never add it to
-- [api].schemas in config.toml. push.test.ts pins that PostgREST refuses it.

-- ================================================================== tokens ==

-- One row per device. The token is the key: a phone that changes hands
-- (sign out, someone else signs in) moves its token to the new account,
-- so it never receives the previous owner's pushes.
create table public.push_tokens (
  token text primary key,
  tenant_id uuid not null default private.current_tenant_id(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint push_tokens_token_shape
    check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$')
);

create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

-- Owner-only. No insert or update policy: registering goes through
-- register_push_token, which may move a token between accounts.
create policy push_tokens_select on public.push_tokens
  for select to authenticated
  using (tenant_id = private.current_tenant_id() and user_id = (select auth.uid()));

create policy push_tokens_delete on public.push_tokens
  for delete to authenticated
  using (tenant_id = private.current_tenant_id() and user_id = (select auth.uid()));

revoke all on public.push_tokens from anon, authenticated;
grant select, delete on public.push_tokens to authenticated;

-- ================================================================ ledgers ==

-- Deployment settings the database itself reads: one row per key, so a
-- later feature adds a key rather than a table. Private (never exposed,
-- deny-all RLS); set per deployment with SQL, never from a client.
-- Created if missing: the reports migration (20261016190000) makes the
-- same table, and either may land first. Keep the two definitions equal.
-- A key ending in `_url` holds an outbound URL; null means off.
create table if not exists private.settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value text,
  constraint settings_url_shape
    check (key !~ '_url$' or value is null or value ~ '^https?://')
);

-- push_url: where pushes go; null turns every push off. Shipped pointing
-- at Expo: nothing is sent until a device registers a token, so a local
-- stack or CI with no real devices sends nothing.
-- push_access_token: Expo's push access token ("enhanced push security"),
-- sent as the bearer when set, so a leaked device token alone cannot be
-- used to push to that device. Optional; go-live turns it on.
insert into private.settings (key, value) values
  ('push_url', 'https://exp.host/--/api/v2/push/send'),
  ('push_access_token', null)
on conflict (key) do nothing;

create or replace function private.setting(p_key text)
returns text
language sql
stable
set search_path = ''
as $$
  select value from private.settings where key = p_key
$$;

-- In-flight batches: the pg_net request id and the tokens in message
-- order, so a ticket can be matched back to its token. Deleted as soon as
-- the response is read (pg_net itself keeps responses for six hours).
create table private.push_batches (
  request_id bigint primary key,
  tokens text[] not null,
  created_at timestamptz not null default now()
);

-- Throttle: one row per (recipient, subject). A request's subject is the
-- requester (one push per directed pair per 24 hours, so decline and
-- re-send cannot re-ring); a gathering's subject is the gathering (one
-- push per 15 minutes; joins inside the window are held and counted into
-- the next push).
create table private.push_throttle (
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('request', 'gathering')),
  subject_id uuid not null,
  last_sent_at timestamptz not null,
  held integer not null default 0,
  primary key (recipient_id, kind, subject_id)
);

create index push_throttle_subject_idx on private.push_throttle (subject_id);

-- Deny-all RLS, as on the other private ledgers.
alter table private.settings enable row level security;
alter table private.push_batches enable row level security;
alter table private.push_throttle enable row level security;

-- ================================================================ register ==

-- Register (or refresh) this device's token for the caller. A token held
-- by another account moves here. The answer is the same either way, so it
-- tells the caller nothing about who held it. Ten devices per account; the
-- longest-unseen one makes room.
create function public.register_push_token(p_token text, p_platform text)
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
  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'profile required' using errcode = 'P0001';
  end if;

  insert into public.push_tokens (token, user_id, platform)
  values (p_token, v_user, p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        tenant_id = excluded.tenant_id,
        created_at = case
          when public.push_tokens.user_id = excluded.user_id then public.push_tokens.created_at
          else now()
        end,
        last_seen_at = now();

  delete from public.push_tokens
   where token in (
     select token from public.push_tokens
      where user_id = v_user
      order by last_seen_at desc
      offset 10
   );
end
$$;

revoke execute on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

-- ==================================================================== send ==

-- Read Expo's answers to earlier batches. A 200 carries one ticket per
-- message, in order; DeviceNotRegistered means the token is dead. Any
-- other answer (an error ticket of another kind, a 4xx, a 5xx, a timeout)
-- is dropped without retry. Batches nobody answered within a day go too.
create function private.push_sweep()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_batch record;
begin
  for v_batch in
    select b.request_id, b.tokens, r.status_code, r.content
      from private.push_batches b
      join net._http_response r on r.id = b.request_id
  loop
    if v_batch.status_code = 200 then
      delete from public.push_tokens
       where token in (
         select v_batch.tokens[t.ordinality]
           from jsonb_array_elements(
                  coalesce(v_batch.content::jsonb -> 'data', '[]'::jsonb)
                ) with ordinality as t(ticket, ordinality)
          where t.ticket ->> 'status' = 'error'
            and t.ticket -> 'details' ->> 'error' = 'DeviceNotRegistered'
       );
    end if;
    delete from private.push_batches where request_id = v_batch.request_id;
  end loop;

  delete from private.push_batches where created_at < now() - interval '1 day';
end
$$;

-- Send one notification to every live device of one person. Never raises:
-- a push is a courtesy, and a failure here must not undo the handshake
-- write that triggered it.
create function private.push_send(p_recipient uuid, p_title text, p_body text, p_path text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_endpoint text;
  v_access_token text;
  v_tokens text[];
  v_messages jsonb;
  v_request bigint;
begin
  v_endpoint := private.setting('push_url');
  v_access_token := private.setting('push_access_token');
  if v_endpoint is null then
    return;
  end if;

  begin
    perform private.push_sweep();

    delete from public.push_tokens
     where user_id = p_recipient and last_seen_at < now() - interval '30 days';

    select array_agg(token order by token),
           jsonb_agg(
             jsonb_build_object(
               'to', token,
               'title', p_title,
               'body', p_body,
               'sound', 'default',
               'data', jsonb_build_object('path', p_path)
             ) order by token
           )
      into v_tokens, v_messages
      from public.push_tokens
     where user_id = p_recipient;

    if v_tokens is null then
      return;
    end if;

    select net.http_post(
             url := v_endpoint,
             body := v_messages,
             headers := jsonb_build_object(
               'Content-Type', 'application/json',
               'Accept', 'application/json'
             ) || case
               when v_access_token is null then '{}'::jsonb
               else jsonb_build_object('Authorization', 'Bearer ' || v_access_token)
             end,
             timeout_milliseconds := 5000
           )
      into v_request;

    insert into private.push_batches (request_id, tokens) values (v_request, v_tokens);
  exception when others then
    raise warning 'push not sent: %', sqlerrm;
  end;
end
$$;

-- ================================================================ triggers ==

-- A request to you, from someone you have not blocked and who has not
-- blocked you (the send RPC never stores one across a block; checked
-- again here). Names the sender: their card is on the request anyway.
create function private.on_connect_request_created()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_last timestamptz;
begin
  if new.status <> 'pending'
     or private.is_blocked(new.requester_id, new.recipient_id)
     or private.is_blocked(new.recipient_id, new.requester_id) then
    return null;
  end if;

  select last_sent_at into v_last
    from private.push_throttle
   where recipient_id = new.recipient_id and kind = 'request' and subject_id = new.requester_id
   for update;
  if v_last is not null and v_last > now() - interval '24 hours' then
    return null;
  end if;

  insert into private.push_throttle (recipient_id, kind, subject_id, last_sent_at)
  values (new.recipient_id, 'request', new.requester_id, now())
  on conflict (recipient_id, kind, subject_id) do update set last_sent_at = now(), held = 0;

  select display_name into v_name from public.profiles where id = new.requester_id;
  perform private.push_send(
    new.recipient_id,
    'New connect request',
    v_name || ' wants to connect.',
    '/connections?segment=requests'
  );
  return null;
end
$$;

create trigger connect_requests_push_created
  after insert on public.connect_requests
  for each row execute function private.on_connect_request_created();

-- Your request was accepted. Names the accepter: you are connected now,
-- so their card is yours to see.
create function private.on_connect_request_accepted()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if private.is_blocked(new.requester_id, new.recipient_id)
     or private.is_blocked(new.recipient_id, new.requester_id) then
    return null;
  end if;

  select display_name into v_name from public.profiles where id = new.recipient_id;
  perform private.push_send(
    new.requester_id,
    'Request accepted',
    v_name || ' accepted your connect request.',
    '/connections'
  );
  return null;
end
$$;

create trigger connect_requests_push_accepted
  after update of status on public.connect_requests
  for each row
  when (old.status = 'pending' and new.status = 'accepted')
  execute function private.on_connect_request_accepted();

-- People joined your gathering. Never names them: a host sees only their
-- connections among the members, and a push that named some joiners and
-- not others would tell the host which were strangers. The count is the
-- headcount the host already sees. One push per 15 minutes per gathering;
-- joins inside the window ride on the next one.
create function private.on_gathering_member_joined()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_gathering public.gatherings%rowtype;
  v_last timestamptz;
  v_held integer;
  v_count integer;
begin
  select * into v_gathering from public.gatherings where id = new.gathering_id;
  if not found
     or v_gathering.host_id = new.profile_id
     or private.is_blocked(new.profile_id, v_gathering.host_id)
     or private.is_blocked(v_gathering.host_id, new.profile_id) then
    return null;
  end if;

  select last_sent_at, held into v_last, v_held
    from private.push_throttle
   where recipient_id = v_gathering.host_id and kind = 'gathering' and subject_id = v_gathering.id
   for update;

  if v_last is not null and v_last > now() - interval '15 minutes' then
    update private.push_throttle
       set held = held + 1
     where recipient_id = v_gathering.host_id and kind = 'gathering' and subject_id = v_gathering.id;
    return null;
  end if;

  v_count := coalesce(v_held, 0) + 1;
  insert into private.push_throttle (recipient_id, kind, subject_id, last_sent_at)
  values (v_gathering.host_id, 'gathering', v_gathering.id, now())
  on conflict (recipient_id, kind, subject_id) do update set last_sent_at = now(), held = 0;

  -- Lazily forget throttle rows nobody has touched in a week.
  delete from private.push_throttle where last_sent_at < now() - interval '7 days';

  perform private.push_send(
    v_gathering.host_id,
    v_gathering.title,
    case when v_count = 1 then '1 person joined.' else v_count || ' people joined.' end,
    '/gathering/' || v_gathering.id
  );
  return null;
end
$$;

create trigger gathering_members_push_joined
  after insert on public.gathering_members
  for each row execute function private.on_gathering_member_joined();

-- ======================================================= delete_my_account ==

-- Erasure reaches the push ledgers: tokens and throttle rows about you go
-- with the profile (cascade), throttle rows naming you as a requester and
-- any in-flight batch addressed to your devices go here. Every attribute
-- of the previous version restated; grants survive the replace.
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

  delete from private.push_batches
   where tokens && array(select token from public.push_tokens where user_id = v_user);
  delete from private.push_throttle where kind = 'request' and subject_id = v_user;
  delete from private.connect_request_attempts where requester_id = v_user;
  delete from private.claim_attempts where user_id = v_user;
  delete from private.gathering_create_attempts where host_id = v_user;
  delete from auth.users where id = v_user;
end
$$;
