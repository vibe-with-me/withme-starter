-- Security fixes from the audit of everything merged since 9ce9bdd.
--
-- 1. report_user leaked the reported person's card. It checked the reason
--    and the text only through the reports table's CHECK constraints, after
--    looking the person up. For a real person a bad reason (or text that is
--    too long, or not plain) failed the insert with 23514, and PostgREST
--    returns the failing row in the error's `details`: the person's display
--    name, bio and photo path, from the snapshot. For an unknown id the same
--    call answered void. The error rolled back the attempt it had just
--    counted, so the rate limit never applied. Anyone signed in who held a
--    profile id (from a tap, a gathering, an old connection) could read that
--    card at will, including someone who had blocked them, and test whether
--    an id was an account. The arguments are now checked first, the same way
--    for every id, and refused with 22023 and no row.
--
-- 2. A profile could be deleted on its own. profiles_delete let the owner
--    DELETE their profile row over PostgREST while the login stayed. That
--    skipped delete_my_account (ledgers, the photo check) and cut every
--    report about the person loose (reported_id set null) before they made
--    a fresh profile on the same login: an abuser could wash their reports
--    away and carry on. Nothing in the starter used it; account deletion is
--    delete_my_account, which deletes the auth user and lets the profile
--    cascade. The policy and the privilege go.

-- ================================================================ report ==

-- The newest body (20261016190000_reports_and_terms) with the argument
-- checks moved ahead of the lookup. Keep them equal to the reports table's
-- CHECK constraints.
create or replace function public.report_user(
  p_reported uuid,
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
  v_target public.profiles%rowtype;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_user) then
    raise exception 'profile required before reporting' using errcode = 'P0001';
  end if;
  if p_reported is null or p_reported = v_user then
    raise exception 'cannot report yourself' using errcode = '22023';
  end if;

  -- Checked before anything about p_reported is read, so the answer is the
  -- same for every id, and never a constraint error carrying the row.
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

  -- Every attempt counts, before the id is looked up: 10 per rolling day.
  perform pg_advisory_xact_lock(hashtextextended('report_user:' || v_user::text, 0));
  delete from private.report_attempts
   where user_id = v_user and attempted_at <= now() - interval '24 hours';
  if (select count(*) from private.report_attempts where user_id = v_user) >= 10 then
    raise exception 'rate limit exceeded' using errcode = 'P0004';
  end if;
  insert into private.report_attempts (user_id) values (v_user);

  perform private.purge_expired_reports();

  select * into v_target
    from public.profiles
   where id = p_reported and tenant_id = private.current_tenant_id();

  -- Unknown and other-tenant ids are the same answer as a stored report:
  -- no exception (it would roll back the attempt just counted), no row.
  if not found then
    return;
  end if;

  insert into public.reports (reporter_id, reported_id, reason, details, snapshot)
  values (
    v_user,
    v_target.id,
    p_reason,
    v_details,
    jsonb_build_object(
      'display_name', v_target.display_name,
      'bio', v_target.bio,
      'avatar_path', v_target.avatar_path
    )
  );

  -- The same rule blocks_insert applies: the block row reveals the card
  -- only if the reporter could already see it. Checked before the insert,
  -- whose trigger drops the connection that made the card visible.
  if p_block then
    insert into public.blocks (blocker_id, blocked_id, reveals_card)
    values (v_user, v_target.id, private.sees_card(v_user, v_target.id))
    on conflict (blocker_id, blocked_id) do nothing;
  end if;
end
$$;

-- create or replace keeps the grants; restated so this file reads whole.
revoke execute on function public.report_user(uuid, text, text, boolean) from public, anon;
grant execute on function public.report_user(uuid, text, text, boolean) to authenticated;

-- ======================================================= profile delete ==

drop policy profiles_delete on public.profiles;
revoke delete on public.profiles from anon, authenticated;
