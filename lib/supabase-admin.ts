import { createClient } from "@supabase/supabase-js";

// Only used server-side (API routes). Never import this in client components.
//
// The `global.fetch` override forces cache: "no-store" on every HTTP request
// the Supabase client makes internally. Without this, Next.js 14's Data Cache
// can serve stale Supabase responses even when the route is force-dynamic.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (input, init = {}) => fetch(input, { ...init, cache: "no-store" }),
    },
  }
);
