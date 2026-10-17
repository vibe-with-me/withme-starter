-- report_gathering looked the gathering up by the block rule alone, which
-- predates gathering visibility (20261017203000): a reporter could file a
-- report on a connections-only gathering they cannot see, given its id.
-- The lookup now asks sees_gathering, the one rule every definer that reads
-- gatherings goes through (packages/db/test/grants.test.ts, gathering readers).
-- Everything else is unchanged.

create or replace function public.report_gathering(
  p_gathering uuid,
  p_reason text,
  p_details text default null,
  p_block boolean default false
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_details text := nullif(trim(p_details), '');
  v_gathering public.gatherings%rowtype;
  v_host public.profiles%rowtype;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'profile required before reporting' using errcode = 'P0001';
  end if;
  if p_gathering is null then
    raise exception 'gathering required' using errcode = '22023';
  end if;

  -- Checked before anything about the gathering is read, as report_user
  -- does since 20261017200000: a CHECK failing on the insert would answer
  -- with the row, the host's card in it. Keep equal to the table's CHECKs.
  if p_reason is null or p_reason not in (
    'harassment', 'hate', 'sexual_content', 'violence', 'child_safety',
    'underage', 'spam', 'impersonation', 'other'
  ) then
    raise exception 'unknown reason' using errcode = '22023';
  end if;
  if v_details is not null
     and (char_length(v_details) > 1000 or not private.is_plain_text(v_details, true)) then
    raise exception 'details must be plain text, at most 1000 characters' using errcode = '22023';
  end if;

  -- The same ledger as report_user, counted before the id is looked up.
  perform pg_advisory_xact_lock(hashtextextended('report_user:' || v_user::text, 0));
  delete from private.report_attempts
   where user_id = v_user and attempted_at <= now() - interval '24 hours';
  if (select count(*) from private.report_attempts where user_id = v_user) >= 10 then
    raise exception 'rate limit exceeded' using errcode = 'P0004';
  end if;
  insert into private.report_attempts (user_id) values (v_user);

  perform private.purge_expired_reports();

  -- Visible to the reporter by sees_gathering (visibility, blocks, tenant),
  -- or the same silent answer as a stored report.
  select * into v_gathering
    from public.gatherings
   where id = p_gathering
     and private.sees_gathering(p_gathering);
  if not found then
    return;
  end if;

  -- After the lookup: a gathering of your own is one you can see.
  if v_gathering.host_id = v_user then
    raise exception 'cannot report yourself' using errcode = '22023';
  end if;

  select * into v_host from public.profiles where id = v_gathering.host_id;

  insert into public.reports (reporter_id, reported_id, gathering_id, reason, details, snapshot)
  values (
    v_user,
    v_host.id,
    v_gathering.id,
    p_reason,
    v_details,
    jsonb_build_object(
      'display_name', v_host.display_name,
      'bio', v_host.bio,
      'avatar_path', v_host.avatar_path,
      'gathering', jsonb_build_object(
        'id', v_gathering.id,
        'title', v_gathering.title,
        'starts_at', v_gathering.starts_at,
        'location', v_gathering.location
      )
    )
  );

  if p_block then
    insert into public.blocks (blocker_id, blocked_id, reveals_card)
    values (v_user, v_host.id, private.sees_card(v_user, v_host.id))
    on conflict (blocker_id, blocked_id) do nothing;
  end if;
end
$$;

revoke execute on function public.report_gathering(uuid, text, text, boolean) from public, anon;
grant execute on function public.report_gathering(uuid, text, text, boolean) to authenticated;
