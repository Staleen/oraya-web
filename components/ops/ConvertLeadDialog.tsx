"use client";
import { useEffect, useState } from "react";
import type { QueueLead } from "@/lib/ops-queue";
import { Banner, Button, Field, T } from "@/components/ops/ui";

/**
 * Turn a WhatsApp enquiry into a pending booking request.
 *
 * Creates the booking through the same locked POST /api/bookings pipeline every
 * booking uses (overlap protection, pricing snapshot, admin notification), then
 * links the lead.
 *
 * Audit L-1 guard: once /api/bookings has succeeded in this dialog session, the
 * booking id is remembered and every retry ONLY re-attempts the lead link — a
 * confused retry can never create a second real booking. The server side adds
 * the L-6 guard: a lead that was converted elsewhere returns 409 rather than
 * silently overwriting the other session's link.
 */

const ALLOWED_VILLAS = ["Villa Mechmech", "Villa Byblos"] as const;
const BEDROOM_OPTIONS = ["1", "2", "3"] as const;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeCanonicalVilla(value: string | null): string {
  const raw = (value ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/");
  const lookup: Record<string, (typeof ALLOWED_VILLAS)[number]> = {
    "villa mechmech": "Villa Mechmech", mechmech: "Villa Mechmech", mishmish: "Villa Mechmech",
    "villa byblos": "Villa Byblos", byblos: "Villa Byblos", jbeil: "Villa Byblos", "byblos/jbeil": "Villa Byblos",
  };
  return raw in lookup ? lookup[raw] : "";
}

function isValidDateOnly(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (y < 1970 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const round = new Date(Date.UTC(y, m - 1, d));
  return round.getUTCFullYear() === y && round.getUTCMonth() === m - 1 && round.getUTCDate() === d;
}

function strictDateOrBlank(value: string | null): string {
  const trimmed = value?.trim() ?? "";
  return isValidDateOnly(trimmed) ? trimmed : "";
}

function parseGuests(value: number | string | null): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) return value;
  if (typeof value === "string") {
    const match = value.match(/\d+/);
    if (match) {
      const n = Number(match[0]);
      if (Number.isInteger(n) && n >= 1) return n;
    }
  }
  return null;
}

function defaultBedrooms(guests: number | null): (typeof BEDROOM_OPTIONS)[number] {
  if (guests !== null && guests <= 2) return "1";
  if (guests !== null && guests <= 4) return "2";
  return "3";
}

interface Draft {
  villa: string;
  checkIn: string;
  checkOut: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  sleepingGuests: string;
  bedrooms: string;
}

function initialDraft(lead: QueueLead): Draft {
  const guests = parseGuests(lead.guest_count);
  return {
    villa: normalizeCanonicalVilla(lead.villa),
    checkIn: strictDateOrBlank(lead.normalized_check_in),
    checkOut: strictDateOrBlank(lead.normalized_check_out),
    guestName: lead.name?.trim() ?? "",
    guestPhone: lead.phone?.trim() ?? "",
    guestEmail: "",
    sleepingGuests: guests !== null ? String(guests) : "",
    bedrooms: defaultBedrooms(guests),
  };
}

function validate(draft: Draft): string | null {
  if (!ALLOWED_VILLAS.includes(draft.villa as (typeof ALLOWED_VILLAS)[number])) return "Choose the villa.";
  if (!isValidDateOnly(draft.checkIn.trim())) return "Confirm the exact check-in date.";
  if (!isValidDateOnly(draft.checkOut.trim())) return "Confirm the exact check-out date.";
  if (draft.checkOut.trim() <= draft.checkIn.trim()) return "Check-out must be after check-in.";
  if (!draft.guestName.trim()) return "The guest's name is required.";
  if (!draft.guestPhone.trim() && !draft.guestEmail.trim()) return "A phone or email is required.";
  if (draft.guestEmail.trim() && !EMAIL_RE.test(draft.guestEmail.trim())) return "That email doesn't look right.";
  const guests = Number(draft.sleepingGuests.trim());
  if (!Number.isInteger(guests) || guests < 1) return "Sleeping guests must be a positive number.";
  if (!BEDROOM_OPTIONS.includes(draft.bedrooms as (typeof BEDROOM_OPTIONS)[number])) return "Bedrooms must be 1, 2, or 3.";
  return null;
}

/** Same [Stay Setup] block the legacy conversion writes, so nothing downstream changes. */
function buildBookingMessage(draft: Draft, lead: QueueLead): string {
  const notes = lead.special_requests?.trim() ?? "";
  const addonsInterest = lead.addons_interest?.trim() ?? "";
  return [
    "[Stay Setup]",
    `Bedrooms to be used: ${draft.bedrooms} ${draft.bedrooms === "1" ? "Bedroom" : "Bedrooms"}`,
    `Estimated guests: ${draft.sleepingGuests.trim()}`,
    "Sleeping setup: To be reviewed by Oraya.",
    `Guest Notes: ${notes || "None"}`,
    `Add-ons interest: ${addonsInterest || "None"}`,
  ].join("\n");
}

function safeBookingError(status: number, raw: string | undefined): string {
  const lower = (raw ?? "").toLowerCase();
  if (status === 409 || lower.includes("unavailable") || lower.includes("already blocked")) {
    return "These dates are not available. Nothing was created.";
  }
  return "The booking request could not be created. Check the details and try again.";
}

export default function ConvertLeadDialog({
  lead, onClose, onOpen, onDone,
}: {
  lead: QueueLead;
  onClose: () => void;
  onOpen: () => void;
  onDone: (message: string, bookingId: string) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(lead));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Audit L-1: the booking created in THIS dialog session. Once set, retries
  // only re-link — they never POST /api/bookings again.
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);

  useEffect(() => {
    onOpen();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen, onClose]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function linkLead(bookingId: string) {
    const ref = bookingId.replace(/-/g, "").slice(0, 8).toUpperCase();
    try {
      const r = await fetch(`/api/ops/leads/${lead.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linked_booking_id: bookingId, follow_up_status: "converted" }),
      });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string };
      if (r.status === 409 && body.code === "already_linked") {
        setError(
          `This enquiry was already converted by someone else. The booking request created here (Ref ${ref}) still exists but is NOT linked to this enquiry — find it under Bookings.`,
        );
        return;
      }
      if (!r.ok || !body.ok) {
        setError(
          `The booking request was created (Ref ${ref}) but the enquiry could not be marked converted. Retry will ONLY re-link — it will not create another booking.`,
        );
        return;
      }
      await onDone(`Enquiry converted — booking request ${ref} created and awaiting approval.`, bookingId);
    } catch {
      setError(
        `The booking request was created (Ref ${ref}) but linking failed (connection). Retry will ONLY re-link — it will not create another booking.`,
      );
    }
  }

  async function submit() {
    if (createdBookingId) {
      setBusy(true); setError("");
      try { await linkLead(createdBookingId); } finally { setBusy(false); }
      return;
    }

    const invalid = validate(draft);
    if (invalid) { setError(invalid); return; }

    setBusy(true); setError("");
    try {
      const r = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          villa: draft.villa.trim(),
          check_in: draft.checkIn.trim(),
          check_out: draft.checkOut.trim(),
          sleeping_guests: draft.sleepingGuests.trim(),
          day_visitors: "0",
          message: buildBookingMessage(draft, lead),
          addons: [],
          guest_name: draft.guestName.trim(),
          guest_email: draft.guestEmail.trim() || null,
          guest_phone: draft.guestPhone.trim() || null,
          guest_country: null,
        }),
      });
      const body = (await r.json().catch(() => ({}))) as { booking?: { id?: unknown }; error?: string };
      if (!r.ok) { setError(safeBookingError(r.status, body.error)); return; }

      const bookingId = typeof body.booking?.id === "string" ? body.booking.id : "";
      if (!bookingId) {
        setError("The booking request was created but no reference came back. The enquiry was not linked.");
        return;
      }
      setCreatedBookingId(bookingId);
      await linkLead(bookingId);
    } catch {
      setError("Couldn't reach Oraya. Nothing was created — try again.");
    } finally {
      setBusy(false);
    }
  }

  const guestWords = [
    lead.check_in_text?.trim() ? `check-in “${lead.check_in_text.trim()}”` : null,
    lead.check_out_text?.trim() ? `check-out “${lead.check_out_text.trim()}”` : null,
  ].filter(Boolean).join(", ");

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(10,15,20,.72)", display: "grid", placeItems: "center", padding: "20px", zIndex: 80 }}
    >
      <div role="dialog" aria-modal="true" style={{
        background: T.navyLift, border: `1px solid ${T.border}`, borderRadius: T.rLg,
        width: "min(600px,100%)", maxHeight: "90vh", overflow: "auto",
      }}>
        <div style={{ padding: "22px 24px 0", display: "flex", justifyContent: "space-between", gap: "16px" }}>
          <div>
            <h2 style={{ fontFamily: T.serif, fontWeight: 400, fontSize: "22px", margin: 0 }}>Turn this into a booking request</h2>
            <p style={{ margin: "4px 0 0", fontSize: "13px", color: T.muted }}>
              Creates a pending request for your approval — it does not confirm the stay, take payment, or message the guest about approval.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: 0, color: T.muted, fontSize: "24px", lineHeight: 1, cursor: "pointer" }}>&times;</button>
        </div>

        <div style={{ padding: "20px 24px" }}>
          {error && <Banner tone="bad" title="Not converted">{error}</Banner>}
          {createdBookingId && (
            <Banner tone="warn" title="Booking already created">
              Pressing the button again will only re-link the enquiry — it will not create a second booking.
            </Banner>
          )}

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted, marginBottom: "6px" }}>
              Villa
            </label>
            <select
              value={draft.villa} onChange={(e) => set("villa", e.target.value)} disabled={busy}
              style={{
                width: "100%", background: "rgba(255,255,255,.05)", border: `1px solid ${T.borderStrong}`,
                borderRadius: T.rSm, padding: "12px 13px", color: T.ink, fontSize: "15px", fontFamily: T.sans, outline: "none",
              }}
            >
              <option value="">Choose…</option>
              {ALLOWED_VILLAS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "0 14px" }}>
            <Field label="Check-in" type="date" value={draft.checkIn} disabled={busy}
              onChange={(e) => set("checkIn", e.target.value)} style={{ colorScheme: "dark" }} />
            <Field label="Check-out" type="date" value={draft.checkOut} disabled={busy}
              onChange={(e) => set("checkOut", e.target.value)} style={{ colorScheme: "dark" }} />
          </div>
          {guestWords && (
            <p style={{ margin: "-8px 0 16px", fontSize: "12px", color: T.faint }}>
              The guest wrote: {guestWords}. Check the dates above against their own words.
            </p>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "0 14px" }}>
            <Field label="Guest name" value={draft.guestName} disabled={busy}
              onChange={(e) => set("guestName", e.target.value)} />
            <Field label="Sleeping guests" inputMode="numeric" value={draft.sleepingGuests} disabled={busy}
              onChange={(e) => set("sleepingGuests", e.target.value)} />
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted, marginBottom: "6px" }}>
              Bedrooms
            </label>
            <select
              value={draft.bedrooms} onChange={(e) => set("bedrooms", e.target.value)} disabled={busy}
              style={{
                width: "100%", background: "rgba(255,255,255,.05)", border: `1px solid ${T.borderStrong}`,
                borderRadius: T.rSm, padding: "12px 13px", color: T.ink, fontSize: "15px", fontFamily: T.sans, outline: "none",
              }}
            >
              {BEDROOM_OPTIONS.map((b) => <option key={b} value={b}>{b} {b === "1" ? "Bedroom" : "Bedrooms"}</option>)}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "0 14px" }}>
            <Field label="Phone" value={draft.guestPhone} disabled={busy}
              onChange={(e) => set("guestPhone", e.target.value)} />
            <Field label="Email (optional)" type="email" value={draft.guestEmail} disabled={busy}
              onChange={(e) => set("guestEmail", e.target.value)} hint="Booking emails go here if provided." />
          </div>
        </div>

        <div style={{ padding: "16px 24px 22px", display: "flex", gap: "10px", justifyContent: "flex-end", borderTop: `1px solid ${T.borderFaint}` }}>
          <Button onClick={onClose}>Not now</Button>
          <Button variant="primary" disabled={busy} onClick={() => void submit()}>
            {busy ? "Working…" : createdBookingId ? "Retry linking (no new booking)" : "Create pending request"}
          </Button>
        </div>
      </div>
    </div>
  );
}
