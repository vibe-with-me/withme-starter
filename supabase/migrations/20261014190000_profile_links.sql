-- Profile links: the places a person can be reached, one row per platform.
--
-- Connections tier. A handle is contact information, so it never rides the
-- card: profiles_select and resolve_tag are untouched, and public.profile_links
-- is readable by the owner and by accepted connections with no block in
-- either direction. Not columns on profiles: RLS decides rows, and every
-- viewer of a profiles row (a pending-request recipient, a gathering
-- co-member, a blocker) reads every column of it.
--
-- The stored shape is checked here, mirroring @withme/contract's
-- isCanonicalLinkValue: a direct PostgREST write cannot store what the API
-- would refuse. The platform list lives in private.is_link_value; a fork adds
-- a platform there and in the contract's registry.
--
-- Writes go through set_my_links(jsonb): the whole list in one transaction,
-- platforms left out removed, the rest upserted in order. It runs as the
-- caller (security invoker), so the owner-only policies below are the
-- boundary; the function only supplies the transaction.
-- Re-stated by packages/db/test/links.test.ts.

-- ================================================================== helper ==

-- The one definition of the shape, shared by the CHECK. Immutable, so the
-- CHECK may call it. Keep in step with SHAPE in packages/contract/src/schemas/link.ts.
create function private.is_link_value(p_platform text, p_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is not null
    and char_length(p_value) between 1 and 200
    and case
      when p_platform in (
        'instagram', 'tiktok', 'x', 'threads', 'snapchat', 'facebook', 'youtube',
        'linkedin', 'bluesky', 'telegram', 'discord'
      ) then p_value ~ '^[A-Za-z0-9._-]{1,64}$'
      when p_platform in ('whatsapp', 'signal', 'phone') then p_value ~ '^\+?[0-9]{7,15}$'
      when p_platform = 'email' then p_value ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      when p_platform = 'website' then p_value ~ '^https?://[^[:space:]/]+\.[^[:space:]/]+'
      else false
    end
$$;

revoke execute on function private.is_link_value(text, text) from public, anon;
grant execute on function private.is_link_value(text, text) to authenticated, service_role;

-- =================================================================== table ==

create table public.profile_links (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  tenant_id uuid not null default private.current_tenant_id(),
  platform text not null,
  value text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_id, platform),
  constraint profile_links_value_shape check (private.is_link_value(platform, value))
);

create trigger profile_links_set_updated_at
  before update on public.profile_links
  for each row execute function private.set_updated_at();

-- ===================================================================== RLS ==

alter table public.profile_links enable row level security;

-- Owner updates pin to (value, sort_order): a row's identity and tenant can
-- never be reassigned by a client, even through an RLS-passing row.
revoke update on public.profile_links from authenticated;
grant update (value, sort_order) on public.profile_links to authenticated;

create policy profile_links_select on public.profile_links
  for select to authenticated
  using (
    tenant_id = private.current_tenant_id()
    and (
      profile_id = (select auth.uid())
      or (
        not private.is_blocked((select auth.uid()), profile_id)
        and not private.is_blocked(profile_id, (select auth.uid()))
        and exists (
          select 1 from public.connections c
          where c.user_a = least((select auth.uid()), profile_links.profile_id)
            and c.user_b = greatest((select auth.uid()), profile_links.profile_id)
        )
      )
    )
  );

create policy profile_links_insert on public.profile_links
  for insert to authenticated
  with check (profile_id = (select auth.uid()) and tenant_id = private.current_tenant_id());

create policy profile_links_update on public.profile_links
  for update to authenticated
  using (profile_id = (select auth.uid()) and tenant_id = private.current_tenant_id())
  with check (profile_id = (select auth.uid()) and tenant_id = private.current_tenant_id());

create policy profile_links_delete on public.profile_links
  for delete to authenticated
  using (profile_id = (select auth.uid()) and tenant_id = private.current_tenant_id());

-- ===================================================================== RPC ==

-- Replace the caller's links with p_links ([{platform, value}, ...], display
-- order). Invoker: every statement runs under the caller's own policies.
create function public.set_my_links(p_links jsonb)
returns setof public.profile_links
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_count integer;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_links is null or jsonb_typeof(p_links) <> 'array' then
    raise exception 'links must be an array' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_links);
  if v_count > 32 then
    raise exception 'too many links' using errcode = '22023';
  end if;
  if v_count <> (select count(distinct e->>'platform') from jsonb_array_elements(p_links) e) then
    raise exception 'one link per platform' using errcode = '23505';
  end if;

  delete from public.profile_links
   where profile_id = v_user
     and platform <> all (array(select e->>'platform' from jsonb_array_elements(p_links) e));

  insert into public.profile_links (profile_id, platform, value, sort_order)
  select v_user, e->>'platform', e->>'value', (ord - 1)::smallint
    from jsonb_array_elements(p_links) with ordinality as t(e, ord)
  on conflict (profile_id, platform) do update
    set value = excluded.value, sort_order = excluded.sort_order;

  return query
    select * from public.profile_links
     where profile_id = v_user
     order by sort_order;
end
$$;

-- Supabase's default privileges grant anon EXECUTE on new public functions.
revoke execute on function public.set_my_links(jsonb) from public, anon;
grant execute on function public.set_my_links(jsonb) to authenticated, service_role;

-- ================================================================== accept ==

-- A connection is the one place links travel: accept returns the requester's
-- with the new connection. Replaced in place (every attribute restated);
-- grants survive create or replace.
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

  insert into public.connections (tenant_id, user_a, user_b)
  values (
    v_req.tenant_id,
    least(v_user, v_req.requester_id),
    greatest(v_user, v_req.requester_id)
  )
  on conflict (user_a, user_b) do update set user_a = excluded.user_a
  returning * into v_conn;

  select * into v_profile from public.profiles where id = v_req.requester_id;

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
    )
  );
end
$$;
