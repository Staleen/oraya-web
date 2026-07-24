import type { Metadata } from "next";
import HomeClient from "@/components/HomeClient";
import {
  GUEST_TESTIMONIALS_SETTINGS_KEY,
  getApprovedPublicTestimonials,
  parseGuestTestimonialsJson,
  type GuestTestimonialRecord,
} from "@/lib/guest-testimonials";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Remediation 2 (B.2) — `/` is a server component: SEO metadata plus
 * server-fetched covers and testimonials (no more client fetch flash). All
 * interactive parts (auth nav, hover handlers, pricing/instant-booking
 * hooks) live in the HomeClient island.
 */
export const metadata: Metadata = {
  title: "Oraya — Luxury Boutique Villas in Lebanon",
  description:
    "Private luxury villas in Mechmech and Byblos, Lebanon. Heated pool, garden estates, private events, and boutique hospitality — book directly with Oraya.",
};

export const dynamic = "force-dynamic";

async function fetchCover(villa: string): Promise<string> {
  try {
    const { data, error } = await supabaseAdmin
      .from("villa_media")
      .select("file_url")
      .eq("villa", villa)
      .order("display_order", { ascending: true })
      .limit(1);
    if (error) throw error;
    return data?.[0]?.file_url ?? "";
  } catch (err) {
    console.error(`[home] cover fetch failed (${villa}):`, err);
    return "";
  }
}

async function fetchApprovedTestimonials(): Promise<GuestTestimonialRecord[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from("settings")
      .select("value")
      .eq("key", GUEST_TESTIMONIALS_SETTINGS_KEY)
      .maybeSingle();
    if (error) throw error;
    return getApprovedPublicTestimonials(parseGuestTestimonialsJson(data?.value ?? null));
  } catch (err) {
    console.error("[home] testimonials fetch failed:", err);
    return [];
  }
}

export default async function Home() {
  const [heroImg, mechmechImg, byblosImg, approvedTestimonials] = await Promise.all([
    fetchCover("general"),
    fetchCover("mechmech"),
    fetchCover("byblos"),
    fetchApprovedTestimonials(),
  ]);

  return (
    <HomeClient
      heroImg={heroImg}
      mechmechImg={mechmechImg}
      byblosImg={byblosImg}
      approvedTestimonials={approvedTestimonials}
    />
  );
}
