-- Shared demo logins that one visitor can't break for everyone.
--
-- A public demo prints a login on its landing page (VITE_DEMO_CREDENTIALS)
-- so a visitor can try the signed-in app as Ada. Everyone holding that
-- login is the same account, so without this one visitor could delete it,
-- change its email or password, or sign every other visitor out. Off by
-- default: the 'demo_account_domain' row of private.settings is null, and
-- nothing below does anything until the operator sets it to the demo
-- logins' email domain (the seed's is demo.withme.local):
--
--   update private.settings set value = 'demo.withme.local'
--    where key = 'demo_account_domain';
--
-- With it set, for an account whose email is at that domain:
--   * (a) Deleting it fails, unless the delete comes from GoTrue (the
--     service-role admin API, which the seed uses) or straight SQL. The
--     only delete a signed-in user can reach is delete_my_account, through
--     PostgREST, which this refuses with P0008. The API sweeps the photo
--     first, which a card edit could do anyway.
--   * (b) Changing its email, phone or password through Auth fails: GoTrue
--     writes them as supabase_auth_admin, for a user's own PUT /user and
--     for the admin API alike, so both are refused. Straight SQL (the
--     postgres role) still can, and so can clearing the setting first.
--     A pending email change is refused when it is requested, so no
--     confirmation mail goes out.
--   * (c) Signing out never ends anyone else's session: GoTrue's sign-out
--     (whose default scope is every session of the account) deletes no
--     sessions of a demo account. The signing-out client still drops its
--     own tokens; the session it held expires with its refresh token.
--     Deleting the account still removes its sessions (the cascade).
--   * Card edits, links, tags, gatherings and requests stay open: the
--     scheduled restore (private.restore_demo) puts them back.
--
-- Re-stated by packages/db/test/demo-accounts.test.ts.

insert into private.settings (key, value) values ('demo_account_domain', null)
on conflict (key) do nothing;

-- The domain when the guard is on, else null. Lower case, no '@'.
create function private.demo_account_domain()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(lower(trim(both '@ ' from value)), '')
    from private.settings where key = 'demo_account_domain'
$$;

revoke execute on function private.demo_account_domain() from public, anon, authenticated;

create function private.is_demo_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    lower(p_email) like '%@' || replace(replace(private.demo_account_domain(), '_', '\_'), '%', '\%'),
    false
  )
$$;

revoke execute on function private.is_demo_email(text) from public, anon, authenticated;

-- ============================================================= auth.users ==

-- session_user, not current_user: delete_my_account is a definer (so
-- current_user is its owner), but the connection it runs on is PostgREST's
-- (authenticator); GoTrue connects as supabase_auth_admin; migrations, the
-- SQL Editor and pg_cron as postgres.
create function private.guard_demo_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_demo_email(old.email) then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if session_user not in ('postgres', 'supabase_admin', 'supabase_auth_admin') then
      raise exception 'demo account cannot be deleted' using errcode = 'P0008';
    end if;
    return old;
  end if;

  if session_user not in ('postgres', 'supabase_admin') and (
       new.email is distinct from old.email
    or new.encrypted_password is distinct from old.encrypted_password
    or new.phone is distinct from old.phone
    or coalesce(new.email_change, '') not in ('', coalesce(old.email_change, ''))
    or coalesce(new.phone_change, '') not in ('', coalesce(old.phone_change, ''))
  ) then
    raise exception 'demo account login cannot change' using errcode = 'P0008';
  end if;
  return new;
end
$$;

revoke execute on function private.guard_demo_account() from public, anon, authenticated;

create trigger users_guard_demo_account
  before update or delete on auth.users
  for each row execute function private.guard_demo_account();

-- ========================================================== auth.sessions ==

-- Skips GoTrue's own delete of a demo account's session (sign-out, any
-- scope). pg_trigger_depth() = 1 means the delete came straight from the
-- statement: a cascade from deleting the user runs inside the foreign key's
-- trigger (depth 2), and is left alone so the user delete completes.
create function private.keep_demo_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if session_user = 'supabase_auth_admin'
     and pg_trigger_depth() = 1
     and private.is_demo_email((select email from auth.users where id = old.user_id)) then
    return null;
  end if;
  return old;
end
$$;

revoke execute on function private.keep_demo_sessions() from public, anon, authenticated;

create trigger sessions_keep_demo_sessions
  before delete on auth.sessions
  for each row execute function private.keep_demo_sessions();
