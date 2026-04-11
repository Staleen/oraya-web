# Oraya Web — Claude Instructions

## Auto-backup rule (MANDATORY)
After completing any task or set of changes, always run these three commands to back up to GitHub:

```bash
git add -A && git commit -m "describe what changed" && git push origin master
```

Do this automatically at the end of every response without being asked.

---

## Supabase — bookings table (run once in SQL editor)
```sql
create table bookings (
  id uuid default gen_random_uuid() primary key,
  member_id uuid references auth.users,
  villa text not null,
  check_in date not null,
  check_out date not null,
  guests integer not null,
  event_type text,
  message text,
  status text default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now())
);
alter table bookings enable row level security;
create policy "Members can view own bookings" on bookings for select using (auth.uid() = member_id);
create policy "Members can insert bookings" on bookings for insert with check (auth.uid() = member_id);
```

---

## Project
Oraya — luxury boutique villa brand website in Lebanon.
Stack: Next.js 14 App Router · TypeScript · Tailwind CSS v3 · Google Fonts (Playfair Display + Lato).

## Dev server
```bash
export PATH="/c/Program Files/nodejs:$PATH"
npm run dev
```

## Key conventions
- All colors and font families use hardcoded inline styles (no Tailwind color/font classes) — Tailwind custom utilities were unreliable.
- Color constants: `GOLD=#C5A46D`, `WHITE=#FFFFFF`, `BEIGE=#EAE3D9`, `BEIGELIGHT=#F5F1EB`, `CHARCOAL=#2E2E2E`, `MIDNIGHT=#1F2B38`, `MUTED=#8a8070`.
- Font constants: `PLAYFAIR="'Playfair Display', Georgia, serif"`, `LATO="'Lato', system-ui, sans-serif"`.
- SVG logos are inlined as React components (`OrayaEmblem.tsx`, `OrayaLogoFull.tsx`) — do not use `<img>` or `next/image` for SVGs.
- `page.tsx` must stay `"use client"` (uses mouse event handlers).
- Config file is `next.config.mjs` (not `.ts` — unsupported in Next.js 14).
