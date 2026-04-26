import { createClient } from "@supabase/supabase-js";

// The `??` fallbacks prevent `createClient` from throwing during `next build`
// when local env vars are absent. At runtime the real NEXT_PUBLIC_* vars are used.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://build-placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "build-placeholder",
);
