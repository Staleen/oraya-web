import { createClient } from "@supabase/supabase-js";

// Only used server-side (API routes). Never import this in client components.
//
// Lazy-initialized via Proxy so that importing this module during `next build`
// (when Supabase env vars are absent locally) does not throw at module-load time.
// The real client is created on first property access, at which point env vars
// are present and strict validation still applies as normal.
//
// The `global.fetch` override forces cache: "no-store" on every HTTP request
// the Supabase client makes internally. Without this, Next.js 14's Data Cache
// can serve stale Supabase responses even when the route is force-dynamic.

function _make() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: (input, init = {}) => fetch(input, { ...init, cache: "no-store" }),
      },
    }
  );
}

let _instance: ReturnType<typeof _make> | undefined;

export const supabaseAdmin = new Proxy({} as ReturnType<typeof _make>, {
  get(_, prop) {
    if (!_instance) _instance = _make();
    return Reflect.get(_instance, prop, _instance);
  },
});
