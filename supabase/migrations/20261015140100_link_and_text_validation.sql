-- Tighter link shapes, and no invisible or direction-changing characters in
-- the text people show each other. The database mirror of
-- packages/contract/src/schemas/link.ts and text.ts (keep them in step).
--
-- Links (private.is_link_value, replaced in place, same signature):
--   email:   no ? & = # % / < > " , ; so a mailto: link cannot carry a hidden
--            bcc, body or second recipient (`a@b.co?bcc=x@evil.example`);
--   website: anchored at both ends; the host runs to the first / ? or # and
--            may not hold an @ (userinfo: `https://google.com@evil.example`
--            opens evil.example), a backslash, or a percent escape;
--   every value: is_plain_text, below.
--
-- Text (private.is_plain_text): profiles.display_name and bio, gatherings.title
-- and location refuse control characters, bidi embeddings, overrides and
-- isolates, direction marks (U+061C, U+200E, U+200F), and the invisible
-- U+200B, U+2060 and U+FEFF. They let one person's name read as another's.
-- U+200C and U+200D stay allowed: Persian and Indic scripts need the
-- non-joiner, emoji sequences the joiner.
-- A bio keeps its line feeds.
--
-- Existing rows. The constraints below are added VALID, so every row must pass
-- first, and this migration makes them pass rather than leaving `not valid`
-- constraints behind: a `not valid` CHECK still runs on every later UPDATE of
-- an old row, so someone editing only their bio would be refused for a name
-- they never touched, with no hint why. Instead:
--   * text: the refused characters are stripped. They are invisible or
--     formatting-only, so what the row says does not change. A value that
--     was nothing else becomes the column's empty form: a null bio or
--     location, 'Member' for a name, 'Gathering' for a title;
--   * links: a stored link that fails the new shape is deleted. It cannot be
--     repaired without guessing (which address did `a@b.co?bcc=…` mean?), and
--     an injected mailto or a userinfo URL is the attack itself. The owner
--     adds it again from Profile → Links.

-- ================================================================= helpers ==

create function private.is_plain_text(p_value text, p_multiline boolean default false)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is null
    or p_value !~ case
      when p_multiline
        then '[\u0001-\u0009\u000B-\u001F\u007F-\u009F\u061C\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]'
      else '[\u0001-\u001F\u007F-\u009F\u061C\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]'
    end
$$;

-- Called by the CHECKs below, so by whoever writes those tables. New functions
-- start closed (20261015140000_default_function_privileges.sql).
grant execute on function private.is_plain_text(text, boolean) to authenticated, service_role;

create or replace function private.is_link_value(p_platform text, p_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is not null
    and char_length(p_value) between 1 and 200
    and private.is_plain_text(p_value)
    and case
      when p_platform in (
        'instagram', 'tiktok', 'x', 'threads', 'snapchat', 'facebook', 'youtube',
        'linkedin', 'bluesky', 'telegram', 'discord'
      ) then p_value ~ '^[A-Za-z0-9._-]{1,64}$'
      when p_platform in ('whatsapp', 'signal', 'phone') then p_value ~ '^\+?[0-9]{7,15}$'
      when p_platform = 'email' then p_value ~
        '^[^[:space:]@?&=#%/<>",;]+@[^[:space:]@?&=#%/<>",;]+\.[^[:space:]@?&=#%/<>",;]+$'
      when p_platform = 'website' then p_value ~
        '^https?://[^[:space:]/?#@\\%]+\.[^[:space:]/?#@\\%]+([/?#][^[:space:]]*)?$'
      else false
    end
$$;

-- ========================================================== existing rows ==

delete from public.profile_links where not private.is_link_value(platform, value);

-- The same class as is_plain_text, as a replacement pattern.
update public.profiles
set
  display_name = coalesce(
    nullif(
      regexp_replace(
        display_name,
        '[\u0001-\u001F\u007F-\u009F\u061C\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]',
        '',
        'g'
      ),
      ''
    ),
    'Member'
  ),
  bio = nullif(
    regexp_replace(
      bio,
      '[\u0001-\u0009\u000B-\u001F\u007F-\u009F\u061C\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]',
      '',
      'g'
    ),
    ''
  )
where not private.is_plain_text(display_name) or not private.is_plain_text(bio, true);

update public.gatherings
set
  title = coalesce(
    nullif(
      regexp_replace(
        title,
        '[\u0001-\u001F\u007F-\u009F\u061C\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]',
        '',
        'g'
      ),
      ''
    ),
    'Gathering'
  ),
  location = nullif(
    regexp_replace(
      location,
      '[\u0001-\u001F\u007F-\u009F\u061C\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]',
      '',
      'g'
    ),
    ''
  )
where not private.is_plain_text(title) or not private.is_plain_text(location);

-- ============================================================ constraints ==

alter table public.profiles
  add constraint profiles_display_name_plain check (private.is_plain_text(display_name)),
  add constraint profiles_bio_plain check (private.is_plain_text(bio, true));

alter table public.gatherings
  add constraint gatherings_title_plain check (private.is_plain_text(title)),
  add constraint gatherings_location_plain check (private.is_plain_text(location));
