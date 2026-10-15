-- New functions are not executable by anon (or PUBLIC) unless a migration
-- grants it on purpose.
--
-- 20261014200856_revoke_anon_execute.sql revoked anon's execute on the
-- functions that existed then. A function added later was open again: Postgres
-- grants EXECUTE to PUBLIC on every new function, and Supabase's default
-- privileges grant it to anon directly on new functions in `public`. Default
-- privileges close that for every later migration.
--
-- Whose defaults: migrations run as `postgres` (locally and on hosted
-- projects), and every function in `public` and `private` is owned by it, so
-- the defaults below are for role postgres. Functions created by
-- supabase_admin (Supabase's own) and by trusted extensions are not affected.
--
-- PUBLIC's execute comes from the built-in global default, which a per-schema
-- `revoke` cannot remove, so that revoke is global for postgres. The anon
-- revokes are per-schema, matching where Supabase's grant lives.
--
-- What a new function gets from now on:
--   public:  authenticated and service_role (Supabase's schema default), not anon.
--   private: nobody but its owner. A policy helper needs an explicit
--            `grant execute ... to authenticated` (plus service_role if it calls it).
-- An anon-facing function needs an explicit `grant execute ... to anon`, and
-- joins the allowlist in packages/db/test/grants.test.ts.

alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema private revoke execute on functions from anon;
