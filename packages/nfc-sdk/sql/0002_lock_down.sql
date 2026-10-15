-- @withme/nfc: keep the tables server-only.
--
-- 0001 left row-level security off. On Supabase, tables in an exposed schema
-- are reachable through the Data API with the publishable key that every
-- client bundle carries, so anyone could rewrite a tag's destination_url
-- (every tap then redirects wherever they chose) or read the scan log.
--
-- RLS on with no policies, plus no grants to the client roles, leaves the
-- tables to the table owner and to Supabase's service role (both bypass RLS),
-- which is what the Supabase adapter must be constructed with: a server-side
-- client holding the secret key. Safe to run on plain Postgres too, where
-- the Supabase roles do not exist, and safe to re-run.

alter table tags enable row level security;
alter table scans enable row level security;

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on table tags, scans from %I', r);
    end if;
  end loop;
end
$$;
