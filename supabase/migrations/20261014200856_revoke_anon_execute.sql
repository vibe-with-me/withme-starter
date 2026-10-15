-- Signed-in-only functions stop being executable by anon: the grant, not
-- the function body, becomes the first gate.
--
-- Postgres grants EXECUTE to PUBLIC on every new function, and Supabase's
-- default privileges grant it to anon (and authenticated, service_role)
-- directly on new functions in `public`. The earlier migrations revoked from
-- PUBLIC only, so anon kept a direct grant on every signed-in-only RPC, and
-- every `private` helper without its own revoke stayed open to anon through
-- PUBLIC. The RPCs' own `auth.uid() is null` checks held, but the grant
-- should be the first gate, not the definer body.
--
-- What anon keeps, on purpose: public.resolve_tag and public.log_scan (the
-- anonymous resolver), and private.current_tenant_id (a constant that every
-- policy and tenant_id default predicates on; the tenant seam stays callable
-- by any future anon-facing policy). No policy applies to anon today, so no
-- other helper needs anon. packages/db/test/grants.test.ts pins this list.

-- ----------------------------------------------------- signed-in-only RPCs --

revoke execute on function public.claim_tag(text, jsonb) from public, anon;
revoke execute on function public.send_connect_request(uuid) from public, anon;
revoke execute on function public.accept_connect_request(uuid) from public, anon;
revoke execute on function public.decline_connect_request(uuid) from public, anon;
revoke execute on function public.create_gathering(text, timestamptz, text) from public, anon;
revoke execute on function public.join_gathering(uuid) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;

grant execute on function public.claim_tag(text, jsonb) to authenticated, service_role;
grant execute on function public.send_connect_request(uuid) to authenticated, service_role;
grant execute on function public.accept_connect_request(uuid) to authenticated, service_role;
grant execute on function public.decline_connect_request(uuid) to authenticated, service_role;
grant execute on function public.create_gathering(text, timestamptz, text) to authenticated, service_role;
grant execute on function public.join_gathering(uuid) to authenticated, service_role;
grant execute on function public.delete_my_account() to authenticated, service_role;

-- ---------------------------------------------------------- policy helpers --
-- Called by policies that apply to authenticated only. is_blocked is a
-- definer that answers "did X block Y?", which anon has no business asking.

revoke execute on function private.is_blocked(uuid, uuid) from public, anon;
revoke execute on function private.is_gathering_member(uuid, uuid) from public, anon;
revoke execute on function private.shares_gathering(uuid, uuid) from public, anon;
revoke execute on function private.lock_pair(uuid, uuid) from public, anon;

grant execute on function private.is_blocked(uuid, uuid) to authenticated, service_role;
grant execute on function private.is_gathering_member(uuid, uuid) to authenticated, service_role;
grant execute on function private.shares_gathering(uuid, uuid) to authenticated, service_role;
grant execute on function private.lock_pair(uuid, uuid) to authenticated, service_role;

-- ------------------------------------------------------- trigger functions --
-- Only callable as triggers, and a trigger fires without checking EXECUTE
-- (that check happens at CREATE TRIGGER, run by the owner). Nobody needs it.

revoke execute on function private.set_updated_at() from public, anon;
revoke execute on function private.on_block_created() from public, anon;
revoke execute on function private.on_profile_deleted() from public, anon;
