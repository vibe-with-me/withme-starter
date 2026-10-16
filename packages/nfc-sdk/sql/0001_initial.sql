-- @vibewithme/nfc initial schema.
-- Single-tenant by design: no tenant_id. 0002_lock_down.sql turns on
-- row-level security with no policies, so only a server-side client can
-- read or write; apply both files.

create table tags (
  id uuid primary key default gen_random_uuid(),
  nfc_uid text not null unique check (nfc_uid = upper(nfc_uid)),
  label text,
  destination_url text not null,
  destination_type text not null default 'redirect',
  is_active boolean not null default true,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table scans (
  id uuid primary key default gen_random_uuid(),
  tag_id uuid not null references tags (id) on delete cascade,
  scan_method text default 'unknown',
  user_agent text,
  ip_hash text,
  country text,
  city text,
  device_type text,
  scanned_at timestamptz not null default now()
);

-- tags(nfc_uid) is already indexed by its unique constraint above.
create index scans_tag_id_idx on scans (tag_id);
create index scans_scanned_at_idx on scans (scanned_at);
