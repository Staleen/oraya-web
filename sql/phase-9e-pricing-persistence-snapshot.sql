alter table bookings
  add column if not exists pricing_subtotal numeric null,
  add column if not exists pricing_nights jsonb null,
  add column if not exists pricing_warnings jsonb null,
  add column if not exists pricing_snapshot jsonb null;
