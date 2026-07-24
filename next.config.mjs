/**
 * Remediation 2 (B.3) — next/image remote host for villa cover photos.
 *
 * Cover URLs are minted by app/api/admin/media POST via
 * `supabaseAdmin.storage.from("villa-images").getPublicUrl(...)`, i.e.
 * `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/villa-images/...` —
 * so the allowed host is derived from NEXT_PUBLIC_SUPABASE_URL at build time.
 * Safety valve: if the env var is absent at build (CI without secrets),
 * images run unoptimized (plain pass-through) instead of hard-failing at
 * runtime on an un-allowlisted host.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseHost = null;
try {
  supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : null;
} catch {
  supabaseHost = null;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    ...(supabaseHost
      ? {
          remotePatterns: [
            {
              protocol: "https",
              hostname: supabaseHost,
              pathname: "/storage/v1/object/public/**",
            },
          ],
        }
      : { unoptimized: true }),
  },
};

export default nextConfig;
