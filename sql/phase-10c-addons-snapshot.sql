alter table bookings
  add column if not exists addons_snapshot jsonb null;
