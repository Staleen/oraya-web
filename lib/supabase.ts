import { createClient } from "@supabase/supabase-js";

// Lazy-initialized via Proxy — see supabase-admin.ts for rationale.

function _make() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

let _instance: ReturnType<typeof _make> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof _make>, {
  get(_, prop) {
    if (!_instance) _instance = _make();
    return Reflect.get(_instance, prop, _instance);
  },
});
