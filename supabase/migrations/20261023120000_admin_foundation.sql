-- Operators: the way into admin tooling (#134, part of #100) without a
-- service-role key anywhere a browser or the API Worker can reach. The API
-- runs every query under the caller's JWT and RLS, so an admin action is a
-- security-definer function that first asks whether the caller is an
-- operator of this tenant.
--
--   * private.operators: one row per operator. RLS on, no policies, no
--     privilege for anon or authenticated, and private is not exposed
--     through PostgREST. Rows are written only by SQL (the SQL Editor, a
--     migration, the local seed): no function makes an operator, so no
--     client path can. The row goes with the profile (on delete cascade),
--     so an operator who deletes their account loses the role.
--   * private.is_operator(): the check every admin function makes first.
--     No client role may execute it; public.is_operator() is the one door
--     to its answer (the API's adminProcedure), and it answers about the
--     caller only.
--   * admin_list_open_reports() and admin_get_report(id): the reports
--     queue's two reads. Each raises 42501 for anyone but an operator
--     before it reads anything, then purges expired reports (the lazy
--     90-day window, docs/moderation.md). public.reports stays deny-all to
--     every client role, operators included: these functions are the only
--     way a session reads a report. Neither returns who filed a report.
--   * reports.resolved_by: who resolved a report. Nothing writes it yet;
--     the reports queue's resolve function (#135) fills it in. Set null if
--     that operator's account goes.

-- ============================================================== operators ==

create table private.operators (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  tenant_id uuid not null default private.current_tenant_id(),
  granted_at timestamptz not null default now()
);

alter table private.operators enable row level security;
-- No policies: definer functions read it, nothing else does.
revoke all on private.operators from public, anon, authenticated;

create function private.is_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from private.operators
     where user_id = (select auth.uid())
       and tenant_id = private.current_tenant_id()
  )
$$;

-- Definers call it as their owner; no client role needs it.
revoke execute on function private.is_operator() from public, anon, authenticated;

-- Whether the caller is an operator, for the API's adminProcedure. About
-- the caller only (no argument), so it says nothing about anyone else.
create function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_operator()
$$;

revoke execute on function public.is_operator() from public, anon;
grant execute on function public.is_operator() to authenticated;

-- ================================================================ reports ==

alter table public.reports
  add column resolved_by uuid references public.profiles (id) on delete set null;

-- The "Open reports" query of docs/moderation.md, for an operator: child
-- safety first (moderation.md: they come first), then oldest first.
create function public.admin_list_open_reports()
returns table (
  id uuid,
  created_at timestamptz,
  reason text,
  details text,
  reported_name text,
  gathering_title text,
  gathering_snapshot jsonb,
  reported_id uuid,
  gathering_id uuid,
  open_reports_about_them bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.is_operator() then
    raise exception 'operator required' using errcode = '42501';
  end if;

  perform private.purge_expired_reports();

  return query
  select r.id,
         r.created_at,
         r.reason,
         r.details,
         r.snapshot ->> 'display_name',
         r.snapshot -> 'gathering' ->> 'title',
         r.snapshot -> 'gathering',
         r.reported_id,
         r.gathering_id,
         -- none for a deleted account: its reports no longer share an id
         case when r.reported_id is not null
              then count(*) over (partition by r.reported_id)
         end
    from public.reports r
   where r.status = 'open'
     and r.tenant_id = private.current_tenant_id()
   order by (r.reason = 'child_safety') desc, r.created_at, r.id;
end
$$;

revoke execute on function public.admin_list_open_reports() from public, anon;
grant execute on function public.admin_list_open_reports() to authenticated;

-- One report (any status) next to what it is about now: the reported
-- person's current card (null once the account is gone), the gathering as
-- it is now (null with no gathering_id), and how many open reports there
-- are about that person. An id that is not a report in the tenant is
-- P0003, which only an operator ever gets to see.
create function public.admin_get_report(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_report public.reports%rowtype;
  v_card jsonb;
  v_gathering jsonb;
  v_open bigint := 0;
begin
  if not private.is_operator() then
    raise exception 'operator required' using errcode = '42501';
  end if;

  perform private.purge_expired_reports();

  select * into v_report
    from public.reports
   where id = p_id and tenant_id = private.current_tenant_id();
  if not found then
    raise exception 'report not found' using errcode = 'P0003';
  end if;

  if v_report.reported_id is not null then
    select jsonb_build_object(
             'id', p.id,
             'display_name', p.display_name,
             'bio', p.bio,
             'avatar_path', p.avatar_path
           )
      into v_card
      from public.profiles p
     where p.id = v_report.reported_id;

    select count(*) into v_open
      from public.reports r
     where r.reported_id = v_report.reported_id
       and r.status = 'open'
       and r.tenant_id = private.current_tenant_id();
  end if;

  if v_report.gathering_id is not null then
    select jsonb_build_object(
             'id', g.id,
             'title', g.title,
             'starts_at', g.starts_at,
             'location', g.location,
             'visibility', g.visibility,
             'capacity', g.capacity,
             'host_id', g.host_id,
             'created_at', g.created_at
           )
      into v_gathering
      from public.gatherings g
     where g.id = v_report.gathering_id;
  end if;

  return jsonb_build_object(
    'report', jsonb_build_object(
      'id', v_report.id,
      'created_at', v_report.created_at,
      'reason', v_report.reason,
      'details', v_report.details,
      'snapshot', v_report.snapshot,
      'status', v_report.status,
      'reported_id', v_report.reported_id,
      'reported_deleted_at', v_report.reported_deleted_at,
      'gathering_id', v_report.gathering_id,
      'resolution_note', v_report.resolution_note,
      'resolved_at', v_report.resolved_at,
      'resolved_by', v_report.resolved_by
    ),
    'card', v_card,
    'gathering', v_gathering,
    'open_reports_about_them', v_open
  );
end
$$;

revoke execute on function public.admin_get_report(uuid) from public, anon;
grant execute on function public.admin_get_report(uuid) to authenticated;
