# Oraya Web

Next.js 14 (App Router) site and booking stack for Oraya. See `PROJECT_STATE.md` for architecture and phase history.

## Local development

1. **Install:** `npm install`
2. **Environment:** copy `.env.example` to `.env.local` and set values (see variable comments inside `.env.example`).
3. **Run:** `npm run dev`

### Server-side secrets and local parity

- **Never commit** `.env.local` (it is gitignored). **Do commit** `.env.example` (keys only, no values).
- **Vercel** project environment variables and your machine’s `.env.local` are **independent**. After changing Vercel env, update local `.env.local` if you need the same behavior.
- **`SUPABASE_SERVICE_ROLE_KEY`** is required for full local testing. Without it, routes that use `lib/supabase-admin.ts` will error (for example `supabaseKey is required` in logs) for **admin data**, **media**, **pricing**, parts of **bookings**, **calendar sync**, and similar server-only code paths.
- **`ADMIN_SECRET`** is required for admin API auth and the admin login flow; **`CRON_SECRET`** for `GET /api/cron/calendar-sync` with `Authorization: Bearer …`.
- **`RESEND_API_KEY`** and **`NEXT_PUBLIC_SITE_URL`** are needed to exercise outbound email and correct link URLs locally; email “from” addresses are currently hardcoded in the `lib/send-*-email.ts` files unless you later wire `RESEND_FROM_EMAIL`.

## Production build

```bash
npx tsc --noEmit
npm run build
```
