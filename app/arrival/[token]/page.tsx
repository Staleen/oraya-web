import type { Metadata } from "next";
import { verifyViewToken } from "@/lib/booking-action-token";
import { formatBookingReference } from "@/lib/booking-reference";
import { supabaseAdmin } from "@/lib/supabase-admin";
import ArrivalGuide from "@/components/arrival/ArrivalGuide";
import { ARRIVAL_CONTENT, WHATSAPP_URL, type ArrivalVillaSlug } from "@/components/arrival/content";
import "@/components/arrival/arrival.css";

/**
 * PRIVATE guest Arrival Guide — /arrival/[token] (Phase 16C Stage 2).
 *
 * - Reuses the existing signed booking-view token (verifyViewToken import
 *   only — the locked token helper is NOT modified).
 * - Renders the full guide ONLY for confirmed bookings; pending shows a
 *   neutral "unlocks once confirmed" state; cancelled/invalid/expired/
 *   not-found collapse to safe neutral states with no booking data.
 * - ACCESS BOUNDARY: never renders gate/door PINs or access codes —
 *   access-code delivery is Phase 16D and is not implemented.
 * - Not a public SEO page: noindex/nofollow, no sitemap, no public links.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your Arrival Guide | Oraya",
  robots: { index: false, follow: false, nocache: true },
};

/** Resolve the canonical villa name on the booking row to a guide slug. */
function villaSlug(villa: string | null): ArrivalVillaSlug | null {
  const v = (villa ?? "").trim().toLowerCase();
  if (v === "villa mechmech") return "mechmech";
  if (v === "villa byblos") return "byblos";
  return null;
}

/**
 * Format the stay range from the date-only YYYY-MM-DD strings WITHOUT
 * JS Date parsing (locked date discipline — see AGENT_RULES §10).
 */
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parseDateOnly(value: string | null): { y: number; m: number; d: number } | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y: Number(match[1]), m, d };
}

function formatStayDates(checkIn: string | null, checkOut: string | null): string | null {
  const a = parseDateOnly(checkIn);
  const b = parseDateOnly(checkOut);
  if (!a || !b) return null;
  const monthA = MONTHS[a.m - 1];
  const monthB = MONTHS[b.m - 1];
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${monthA} ${a.y}`;
  if (a.y === b.y) return `${a.d} ${monthA} – ${b.d} ${monthB} ${a.y}`;
  return `${a.d} ${monthA} ${a.y} – ${b.d} ${monthB} ${b.y}`;
}

/** Neutral safe state — never includes booking data. */
function SafeState({ title, body, showWhatsApp = true }: { title: string; body: string; showWhatsApp?: boolean }) {
  return (
    <div className="oraya-ag">
      <div className="ag-state">
        <p className="m-eyebrow" style={{ margin: "0 0 12px" }}>Oraya · Arrival Guide</p>
        <h1 className="m-display" style={{ fontSize: "26px", margin: "0 0 14px" }}>{title}</h1>
        <p className="m-body" style={{ margin: "0 0 22px", color: "var(--oraya-muted)" }}>{body}</p>
        {showWhatsApp && (
          <a className="m-btn m-btn--ghost" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
            Message Oraya on WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}

type ArrivalBookingRow = {
  id: string;
  villa: string | null;
  guest_name: string | null;
  member_id: string | null;
  check_in: string | null;
  check_out: string | null;
  status: string;
};

/**
 * Display-name resolution — the same canonical fallback chain the admin
 * bookings UI (components/admin/BookingsTable.tsx) and the booking email
 * senders (app/api/bookings/route.ts) already use:
 *   1. bookings.guest_name (set on guest checkout; optional on member bookings)
 *   2. members.full_name via bookings.member_id (member bookings)
 *   3. neutral "Our guest" only when neither exists.
 * Best-effort: a members lookup failure never blocks the guide.
 */
async function resolveGuestDisplayName(booking: ArrivalBookingRow): Promise<string> {
  const direct = booking.guest_name?.trim();
  if (direct) return direct;
  if (booking.member_id) {
    try {
      const { data: memberRow } = await supabaseAdmin
        .from("members")
        .select("full_name")
        .eq("id", booking.member_id)
        .single<{ full_name: string | null }>();
      const memberName = memberRow?.full_name?.trim();
      if (memberName) return memberName;
    } catch (err) {
      console.warn("[arrival] member name lookup failed:", err instanceof Error ? err.message : err);
    }
  }
  return "Our guest";
}

export default async function ArrivalGuidePage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const verified = verifyViewToken(decodeURIComponent(params.token));

  if (!verified.ok) {
    if (verified.reason === "expired") {
      return (
        <SafeState
          title="This link has expired."
          body="For an up-to-date arrival guide link, please reach out to us and we'll send you a fresh one."
        />
      );
    }
    return (
      <SafeState
        title="This link isn't valid."
        body="The arrival guide link you used could not be verified. Please check the link in your booking email, or contact us if you need help."
      />
    );
  }

  // Minimal, display-safe field set only — no payment / admin / message fields.
  // Wrapped so an infra/env failure collapses to the safe state instead of a 500
  // on a guest-forwarded link.
  let booking: ArrivalBookingRow | null = null;
  try {
    const { data, error } = await supabaseAdmin
      .from("bookings")
      .select("id, villa, guest_name, member_id, check_in, check_out, status")
      .eq("id", verified.booking_id)
      .single<ArrivalBookingRow>();
    if (!error) booking = data;
  } catch (err) {
    console.warn("[arrival] booking fetch failed:", err instanceof Error ? err.message : err);
  }

  if (!booking) {
    return (
      <SafeState
        title="This guide isn't available."
        body="We couldn't find the booking for this link. Please contact us if you believe this is an error."
      />
    );
  }

  const status = (booking.status ?? "").toLowerCase();
  const slug = villaSlug(booking.villa);

  if (status === "cancelled") {
    return (
      <SafeState
        title="This guide is no longer available."
        body="This booking is not active. If you think something's off — or you'd like to plan a new stay — we're a message away."
      />
    );
  }

  if (status !== "confirmed") {
    // Pending (and any other non-confirmed state): neutral locked state, no guest data.
    return (
      <SafeState
        title="Your arrival guide unlocks once your stay is confirmed."
        body="We're reviewing your booking. As soon as Oraya confirms your stay, this link opens your full arrival guide — directions, arrival steps, and everything for the drive and the door."
      />
    );
  }

  if (!slug || !ARRIVAL_CONTENT[slug]) {
    return (
      <SafeState
        title="This guide isn't available yet."
        body="An arrival guide for this stay hasn't been published. Message us and we'll send you everything you need for the drive and the door."
      />
    );
  }

  const guestName = await resolveGuestDisplayName(booking);
  const stayDates = formatStayDates(booking.check_in, booking.check_out);
  const bookingReference = formatBookingReference(booking.id);

  return (
    <main className="oraya-ag">
      <ArrivalGuide
        villa={slug}
        guestName={guestName}
        stayDates={stayDates}
        bookingReference={bookingReference}
      />
    </main>
  );
}
