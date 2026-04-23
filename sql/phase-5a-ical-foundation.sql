create table if not exists external_calendar_sources (
  id uuid primary key default gen_random_uuid(),
  villa text not null,
  source_name text not null,
  feed_url text not null,
  is_enabled boolean not null default true,
  last_synced_at timestamp with time zone null,
  last_sync_status text null,
  last_error text null,
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now()),
  unique (villa, feed_url)
);

create table if not exists external_blocks (
  id uuid primary key default gen_random_uuid(),
  villa text not null,
  source_id uuid not null references external_calendar_sources(id) on delete cascade,
  external_uid text not null,
  starts_on date not null,
  ends_on date not null,
  summary text null,
  is_active boolean not null default true,
  last_seen_at timestamp with time zone not null default timezone('utc', now()),
  created_at timestamp with time zone not null default timezone('utc', now()),
  updated_at timestamp with time zone not null default timezone('utc', now()),
  unique (source_id, external_uid),
  constraint external_blocks_date_order check (starts_on < ends_on)
);

create index if not exists external_calendar_sources_villa_enabled_idx
  on external_calendar_sources (villa, is_enabled);

create index if not exists external_blocks_villa_active_idx
  on external_blocks (villa, is_active);
