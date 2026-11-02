-- admin_get_report built the gathering from a fixed list of columns, while
-- the API checks it against GatheringSchema. A fork that adds a gathering
-- field (customize-gathering) widened the schema but not the list, and
-- admin.reports.get failed on every gathering report with every suite green.
-- The gathering is now the whole row, as every other gathering read takes
-- it (select('*') in packages/db/src/queries/gatherings.ts), less the
-- tenant. The card stays a fixed list: it is the public tier of a profile,
-- and extend-profile names this function among the card builders.
-- Everything else is unchanged.

create or replace function public.admin_get_report(p_id uuid)
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
    select to_jsonb(g) - 'tenant_id'
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
