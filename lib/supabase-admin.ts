import { createClient } from "@supabase/supabase-js";

// Only used server-side (API routes). Never import this in client components.
//
// The `??` fallbacks prevent `createClient` from throwing "supabaseUrl is required"
// during `next build` when local env vars are absent. The placeholders are never
// used for live requests — at runtime (Vercel / local dev) the real vars take over.
//
// The `global.fetch` override forces cache: "no-store" on every HTTP request
// the Supabase client makes internally. Without this, Next.js 14's Data Cache
// can serve stale Supabase responses even when the route is force-dynamic.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://build-placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "build-placeholder",
  {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (input, init = {}) => fetch(input, { ...init, cache: "no-store" }),
    },
  }
);
