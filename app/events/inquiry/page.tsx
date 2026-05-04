"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DayPicker } from "react-day-picker";
import type { DateRange, Matcher } from "react-day-picker";
import "react-day-picker/dist/style.css";
import OrayaEmblem from "@/components/OrayaEmblem";
import {
  ADDON_OPERATIONAL_SETTINGS_KEY,
  getAddonAppliesTo,
  mergeAddonsWithOperationalSettings,
  parseAddonOperationalSetting,
  type AddonOperationalFields,
} from "@/lib/addon-operations";
import { CANONICAL_EVENT_TYPES, normalizeEventType } from "@/lib/event-types";
import {
  EVENT_SERVICE_GROUP_ORDER,
  EVENT_SERVICE_SEED_DEFINITIONS,
  expandSeedApplicableEventTypes,
  findEventServiceSeedByLabel,
} from "@/lib/event-service-seed";
import { supabase } from "@/lib/supabase";
import { addDaysToDateOnly, rangesOverlap } from "@/lib/calendar/event-block";
import { takeBookToEventHandoffIfLock } from "@/lib/event-inquiry-handoff";
import { EVENT_SETUP_ESTIMATE_PREFIX, type EventSetupEstimatePayload } from "@/lib/event-inquiry-message";
import {
  clampEventAttendees,
  computeEventServiceLineSubtotal,
  isEventServiceQuantityTiedToAttendees,
  MAX_EVENT_ATTENDEES,
  type EventServicePricingRow,
} from "@/lib/event-inquiry-pricing";
import {
  buildRecommendedQuantities,
  catalogKeysForSeedIds,
  canonicalSeedIdForCatalogRow,
  getSeedIdsToClearWhenSelecting,
  resolveRecommendedPackSeedIds,
  type CatalogRow,
} from "@/lib/event-service-exclusivity";

// ─── Brand constants ──────────────────────────────────────────────────────────
const GOLD     = "#C5A46D";
const WHITE    = "#FFFFFF";
const MIDNIGHT = "#1F2B38";
const CHARCOAL = "#2E2E2E";
const MUTED    = "#8a8070";
const PLAYFAIR = "'Playfair Display', Georgia, serif";
const LATO     = "'Lato', system-ui, sans-serif";

const VILLAS   = ["Villa Mechmech", "Villa Byblos"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Guest-facing event type list — canonical taxonomy, sourced from lib/event-types.ts.
// Old stored values (e.g. "Baptism / Family Gathering", "Wedding", "Birthday Party") are
// handled by normalizeEventType() at the filtering and recommendation lookup sites.
const EVENT_TYPES = CANONICAL_EVENT_TYPES;

// Keyed by canonical event type values only. normalizeEventType() is applied before lookup
// so old stored values (e.g. "Baptism", "Wedding", "Birthday Party") resolve correctly.
const EVENT_RECOMMENDATIONS: Record<string, { guidance: string; recommended: string[] }> = {
  "Private Celebration": {
    guidance: "Private celebrations typically include dining setup, decoration, music, lighting, and guest hospitality.",
    recommended: [
      "Basic Seating Setup",
      "Standard Catering",
      "Basic Decoration",
      "Premium Lighting Atmosphere",
      "Event Coordination",
    ],
  },
  "Gender Reveal": {
    guidance: "Gender reveal setups typically include seating, decoration, catering, and light service coordination.",
    recommended: [
      "Basic Seating Setup",
      "Basic Decoration",
      "Light Catering",
      "Enhanced Decoration",
      "Event Coordination",
    ],
  },
  "Baptism / First Communion": {
    guidance: "These events typically include family seating, shaded comfort, catering flow, and light service coordination.",
    recommended: [
      "Basic Seating Setup",
      "Basic Decoration",
      "Catering Coordination",
      "Light Catering",
      "Event Coordination",
    ],
  },
  "Wedding / Engagement": {
    guidance: "These events typically include seating, decoration, lighting, AV support, and coordinated guest flow.",
    recommended: [
      "Full Seating Setup up to 30 guests",
      "Premium Decoration Experience",
      "Premium Lighting Atmosphere",
      "DJ Service",
      "Event Coordination",
    ],
  },
  "Graduation Celebration": {
    guidance: "Graduation setups typically include flexible seating, catering, decoration, music, and guest support.",
    recommended: [
      "Full Seating Setup up to 30 guests",
      "Standard Catering",
      "Enhanced Decoration",
      "Music Setup",
      "Event Coordination",
    ],
  },
  "Family Gathering / Reunion": {
    guidance: "Family gatherings typically include relaxed seating, shade, catering, and light hospitality.",
    recommended: [
      "Basic Seating Setup",
      "Standard Catering",
      "Basic Decoration",
      "Light Catering",
      "Event Coordination",
    ],
  },
  "Dinner Event": {
    guidance: "Dinner events typically include table service, lighting, catering coordination, and ambiance setup.",
    recommended: [
      "Full Seating Setup up to 30 guests",
      "Premium Lighting Atmosphere",
      "Standard Catering",
      "Basic Lighting",
      "Event Coordination",
    ],
  },
  "Wellness Retreat": {
    guidance: "Wellness retreats typically include shaded seating, catering, and a calm, coordinated hospitality setup.",
    recommended: [
      "Basic Seating Setup",
      "Light Catering",
      "Standard Catering",
      "Catering Coordination",
      "Event Coordination",
    ],
  },
  "Corporate Event": {
    guidance: "Corporate events typically include seating, AV support, lighting, service coordination, and a polished arrival flow.",
    recommended: [
      "Basic Seating Setup",
      "Premium Table Styling",
      "Basic Lighting",
      "Valet Service",
      "Event Coordination",
    ],
  },
};

const EVENT_ATTENDEE_CAP_ERROR = "Oraya private events are limited to 30 attendees.";

const DIAL_CODES = [
  { flag: "🇱🇧", label: "Lebanon",       code: "+961" },
  { flag: "🇸🇦", label: "Saudi Arabia",  code: "+966" },
  { flag: "🇦🇪", label: "UAE",           code: "+971" },
  { flag: "🇶🇦", label: "Qatar",         code: "+974" },
  { flag: "🇰🇼", label: "Kuwait",        code: "+965" },
  { flag: "🇧🇭", label: "Bahrain",       code: "+973" },
  { flag: "🇴🇲", label: "Oman",          code: "+968" },
  { flag: "🇫🇷", label: "France",        code: "+33"  },
  { flag: "🇬🇧", label: "United Kingdom",code: "+44"  },
  { flag: "🇺🇸", label: "United States", code: "+1"   },
];

const COUNTRIES = [
  "Lebanon", "Saudi Arabia", "UAE", "Qatar", "Kuwait", "Bahrain", "Oman",
  "France", "United Kingdom", "United States", "Canada", "Germany",
  "Other",
];

// ─── Shared styles ────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%",
  backgroundColor: "rgba(255,255,255,0.04)",
  border: "0.5px solid rgba(197,164,109,0.25)",
  padding: "14px 16px",
  fontFamily: LATO,
  fontSize: "14px",
  color: WHITE,
  outline: "none",
  boxSizing: "border-box",
  appearance: "none",
};

const labelStyle: React.CSSProperties = {
  fontFamily: LATO,
  fontSize: "10px",
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: MUTED,
  display: "block",
  marginBottom: "6px",
};

// ─── Types ────────────────────────────────────────────────────────────────────
type AuthStatus = "loading" | "member" | "none";
interface ConfirmedRange { check_in: string; check_out: string; }
interface PublicAddon {
  id: string;
  label: string;
  enabled: boolean;
  currency: string;
  price: number | null;
  pricing_model: "flat_fee" | "per_night" | "per_person_per_day" | "per_unit";
}

interface EventServiceOption extends AddonOperationalFields {
  key: string;
  id: string;
  label: string;
  enabled: boolean;
  source: "managed" | "fallback";
  price: number | null;
  currency: string;
  pricing_model: "flat_fee" | "per_night" | "per_person_per_day" | "per_unit";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toISO(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dy}`;
}

function parseLocalISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

function nightCount(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  return Math.max(0, Math.round(
    (parseLocalISO(checkOut).getTime() - parseLocalISO(checkIn).getTime()) / 86_400_000
  ));
}

/** Mirrors `detectDeadDaySuggestion` in app/book/page.tsx (Phase 12E) — same gap detection on merged ranges. */
function detectDeadDaySuggestion(
  checkIn: string,
  checkOut: string,
  confirmedRanges: ConfirmedRange[],
): { suggestLateCheckout: boolean; suggestEarlyCheckin: boolean } {
  if (!checkIn && !checkOut) return { suggestLateCheckout: false, suggestEarlyCheckin: false };
  let suggestLateCheckout = false;
  let suggestEarlyCheckin = false;

  for (const rangeA of confirmedRanges) {
    const checkoutMs = parseLocalISO(rangeA.check_out).getTime();
    const nextBookingISO = toISO(new Date(checkoutMs + 2 * 86_400_000));
    const hasNextBooking = confirmedRanges.some((r) => r.check_in === nextBookingISO);
    if (!hasNextBooking) continue;

    const gapDayISO = toISO(new Date(checkoutMs + 86_400_000));

    if (checkOut && checkOut === rangeA.check_out) {
      suggestLateCheckout = true;
    }
    if (checkIn && checkIn === gapDayISO) {
      suggestEarlyCheckin = true;
      suggestLateCheckout = true;
    }
  }

  return { suggestLateCheckout, suggestEarlyCheckin };
}

/** Event inquiries: minimum one night between start and end (no pricing-driven min stay). Mirrors book default floor. */
const MIN_EVENT_NIGHTS = 1;

function friendlyError(msg: string): string {
  if (msg.includes("Oraya private events are limited to 30 attendees")) return msg;
  if (msg.includes("row-level security") || msg.includes("policy") || msg.includes("42501"))
    return "Unable to submit your inquiry. Please try again or contact us directly.";
  if (msg.includes("Invalid email address"))
    return "Please enter a valid email address so we can reach you about your event.";
  if (msg.includes("check_in") || msg.includes("check_out"))
    return "Please review your preferred dates before submitting.";
  if (msg.includes("JWT") || msg.includes("auth"))
    return "Session error. Please refresh the page and try again.";
  if (msg.includes("unavailable"))
    return "Those dates are no longer available. Please choose different dates and try again.";
  return msg;
}

function slugifyKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function getEventServiceMinQuantity(service: EventServiceOption): number {
  if (typeof service.min_quantity === "number" && Number.isFinite(service.min_quantity) && service.min_quantity > 0) {
    return Math.floor(service.min_quantity);
  }
  return 1;
}

function getEventServiceMaxQuantity(service: EventServiceOption): number {
  const min = getEventServiceMinQuantity(service);
  let cap = MAX_EVENT_ATTENDEES;
  if (typeof service.max_quantity === "number" && Number.isFinite(service.max_quantity) && service.max_quantity >= min) {
    cap = Math.min(Math.floor(service.max_quantity), MAX_EVENT_ATTENDEES);
  }
  return Math.max(min, cap);
}

function getInitialQuantityForEventService(service: EventServiceOption, attendeeCap: number): number {
  if (!service.quantity_enabled) return 1;
  const min = getEventServiceMinQuantity(service);
  const max = getEventServiceMaxQuantity(service);
  if (isEventServiceQuantityTiedToAttendees(service)) {
    return Math.min(Math.max(attendeeCap, min), max);
  }
  return min;
}

function getEventServiceUnitLabel(service: EventServiceOption): string | null {
  return service.unit_label?.trim() ? service.unit_label.trim() : null;
}

function getEventServiceGroupTitle(service: EventServiceOption): string {
  const seedMatch = findEventServiceSeedByLabel(service.label);
  if (seedMatch) return seedMatch.category;
  if (service.category?.trim()) {
    return service.category
      .trim()
      .split(/[\s_-]+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  return "Requested Services";
}

function formatSelectedEventService(service: EventServiceOption, quantity: number): string {
  if (service.quantity_enabled) {
    const unitLabel = getEventServiceUnitLabel(service) ?? "units";
    return `${service.label} - ${quantity} ${unitLabel}`;
  }
  return `${service.label} - requested`;
}

// ─── Calendar CSS (dark-theme overrides) ──────────────────────────────────────
const CALENDAR_CSS = `
  .oraya-cal { display: flex; justify-content: center; }
  .oraya-cal .rdp {
    --rdp-cell-size: 38px;
    --rdp-accent-color: ${GOLD};
    --rdp-background-color: rgba(197,164,109,0.15);
    margin: 0;
    font-family: 'Lato', system-ui, sans-serif;
    font-size: 13px;
    color: rgba(255,255,255,0.75);
  }
  .oraya-cal .rdp-caption_label {
    font-size: 11px; letter-spacing: 2.5px; text-transform: uppercase;
    font-weight: 400; color: ${GOLD};
  }
  .oraya-cal .rdp-head_cell {
    font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase;
    font-weight: 400; color: ${MUTED};
  }
  .oraya-cal .rdp-nav_button { color: ${GOLD}; }
  .oraya-cal .rdp-nav_button:hover { background-color: rgba(197,164,109,0.12); }
  .oraya-cal .rdp-day { color: rgba(255,255,255,0.75); border-radius: 2px; }
  .oraya-cal .rdp-day:hover:not([disabled]):not(.rdp-day_selected):not(.rdp-day_range_middle) {
    background-color: rgba(197,164,109,0.2); color: ${GOLD};
  }
  .oraya-cal .rdp-day_range_start, .oraya-cal .rdp-day_range_end {
    background-color: ${GOLD} !important; color: ${CHARCOAL} !important;
    font-weight: 700; border-radius: 2px !important;
  }
  .oraya-cal .rdp-day_range_middle {
    background-color: rgba(197,164,109,0.15);
    color: rgba(255,255,255,0.8); border-radius: 0;
  }
  .oraya-cal .rdp-day_disabled {
    color: rgba(255,255,255,0.2) !important;
    text-decoration: line-through; opacity: 0.5;
  }
  .oraya-cal .rdp-day_deadCheckIn:not(.rdp-day_selected):not(.rdp-day_range_middle):not(.rdp-day_range_start):not(.rdp-day_range_end) {
    color: rgba(255,255,255,0.28);
    text-decoration: line-through;
    cursor: not-allowed;
  }
  .oraya-cal .rdp-day_outside { color: rgba(255,255,255,0.15); }
  .oraya-cal .rdp-day_today:not(.rdp-day_selected):not(.rdp-day_range_middle):not(.rdp-day_range_start):not(.rdp-day_range_end) {
    border: 1px solid rgba(197,164,109,0.4); color: ${GOLD};
  }
  .oraya-cal .rdp-months { gap: 24px; }
  @media (max-width: 640px) {
    .oraya-cal .rdp-months { flex-direction: column; }
    .oraya-cal .rdp { --rdp-cell-size: 34px; }
  }
  @keyframes stepFadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0);   }
  }
  .step-content { animation: stepFadeIn 0.25s ease forwards; }
`;

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepIndicator({ step }: { step: number }) {
  const labels = ["Event Basics", "Services", "Review & submit"];
  return (
    <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        {([1, 2, 3] as const).map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center" }}>
            <div style={{
              width: "26px", height: "26px", borderRadius: "50%", flexShrink: 0,
              border: `1px solid ${step >= s ? GOLD : "rgba(197,164,109,0.2)"}`,
              backgroundColor: step === s ? GOLD : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: LATO, fontSize: "10px",
              color: step === s ? CHARCOAL : step > s ? GOLD : "rgba(197,164,109,0.3)",
              transition: "background-color 0.2s, border-color 0.2s",
            }}>
              {step > s ? "✓" : s}
            </div>
            {i < 2 && (
              <div style={{
                width: "40px", height: "0.5px",
                backgroundColor: step > s ? GOLD : "rgba(197,164,109,0.15)",
                transition: "background-color 0.2s",
              }} />
            )}
          </div>
        ))}
      </div>
      <p style={{
        fontFamily: LATO, fontSize: "9px", letterSpacing: "2.5px",
        textTransform: "uppercase", color: GOLD, marginTop: "10px", marginBottom: 0,
      }}>
        {labels[step - 1]}
      </p>
    </div>
  );
}

function EventEstimatePanel({
  estimate,
  totalFontSize = "22px",
}: {
  estimate: EventSetupEstimatePayload;
  totalFontSize?: string;
}) {
  const cur = estimate.currency;
  const fmt = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pk = estimate.pack_keys ?? [];
  const rec = estimate.recommended_subtotal;
  const upg = estimate.upgrades_subtotal;
  const showBreakdown =
    pk.length > 0 && typeof rec === "number" && typeof upg === "number";

  return (
    <div
      style={{
        border: "0.5px solid rgba(197,164,109,0.22)",
        backgroundColor: "rgba(255,255,255,0.025)",
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2.5px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
        Estimated event setup
      </p>
      <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0 }}>Starting from</p>
      {showBreakdown ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <p style={{ fontFamily: LATO, fontSize: "12px", color: "rgba(255,255,255,0.88)", margin: 0 }}>
            Recommended setup: {cur} {fmt(rec)}
          </p>
          {upg > 0 ? (
            <p style={{ fontFamily: LATO, fontSize: "12px", color: "rgba(255,255,255,0.88)", margin: 0 }}>
              Optional upgrades selected: {cur} {fmt(upg)}
            </p>
          ) : null}
        </div>
      ) : null}
      <p
        style={{
          fontFamily: LATO,
          fontSize: "10px",
          letterSpacing: "1.5px",
          textTransform: "uppercase",
          color: MUTED,
          margin: "4px 0 0",
        }}
      >
        Estimated total
      </p>
      <p style={{ fontFamily: PLAYFAIR, fontSize: totalFontSize, fontWeight: 400, color: WHITE, margin: 0 }}>
        {cur} {fmt(estimate.total)}
      </p>
      <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.65 }}>
        Final proposal will be confirmed by Oraya after review. This is an estimate only, not a final quote.
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
function EventInquiryPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quantityManuallyAdjustedRef = useRef<Set<string>>(new Set());
  const prevVillaRef = useRef<string>("");

  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [memberName, setMemberName] = useState("");

  const [step, setStep] = useState(1);

  const [form, setForm] = useState({
    villa:          "",
    eventType:      "",
    sleepingGuests: "2",
    dayVisitors:    "20",
    message:        "",
  });

  const [managedEventServices, setManagedEventServices] = useState<EventServiceOption[]>([]);
  const [selectedServiceQuantities, setSelectedServiceQuantities] = useState<Record<string, number>>({});
  /** Catalog keys last applied via "Add recommended" (for estimate breakdown). */
  const [recommendedPackKeys, setRecommendedPackKeys] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  const [guest, setGuest] = useState({
    fullName:    "",
    email:       "",
    dialCode:    "+961",
    phoneNumber: "",
    country:     "Lebanon",
  });

  const [confirmedRanges, setConfirmedRanges] = useState<ConfirmedRange[]>([]);
  const [error,           setError]           = useState("");
  const [loading,         setLoading]         = useState(false);

  const effectiveAttendees = useMemo(
    () => clampEventAttendees(parseInt(form.dayVisitors, 10) || 1),
    [form.dayVisitors],
  );

  /** Stay → event handoff: `?prefill=book&hl=<lockId>` + sessionStorage (see `lib/event-inquiry-handoff.ts`). */
  useEffect(() => {
    if (searchParams.get("prefill") !== "book") return;
    const lockId = searchParams.get("hl");
    const payload = takeBookToEventHandoffIfLock(lockId);
    if (!payload) {
      router.replace("/events/inquiry", { scroll: false });
      return;
    }
    const dv = clampEventAttendees(parseInt(payload.day_visitors, 10) || 1);
    const villaOk = VILLAS.includes(payload.villa);
    setForm((f) => ({
      ...f,
      ...(villaOk ? { villa: payload.villa } : {}),
      sleepingGuests: payload.sleeping_guests,
      dayVisitors: String(dv),
    }));
    setDateRange({ from: parseLocalISO(payload.check_in), to: parseLocalISO(payload.check_out) });
    if (payload.guest) {
      setGuest({
        fullName: payload.guest.fullName ?? "",
        email: payload.guest.email ?? "",
        dialCode: payload.guest.dialCode || "+961",
        phoneNumber: payload.guest.phoneNumber ?? "",
        country: payload.guest.country || "Lebanon",
      });
    }
    router.replace("/events/inquiry", { scroll: false });
  }, [router, searchParams]);

  // Auth check on mount
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        setAuthStatus("member");
        const { data } = await supabase
          .from("members").select("full_name").eq("id", user.id).single();
        if (data?.full_name) setMemberName(data.full_name);
      } else {
        setAuthStatus("none");
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadEventServices() {
      try {
        const [addonsResponse, settingsResponse] = await Promise.all([
          fetch("/api/addons", { cache: "no-store" }),
          fetch(`/api/settings?key=${encodeURIComponent(ADDON_OPERATIONAL_SETTINGS_KEY)}`, { cache: "no-store" }),
        ]);

        const addonsJson = addonsResponse.ok ? await addonsResponse.json() : { addons: [] };
        const settingsJson = settingsResponse.ok ? await settingsResponse.json() : { value: null };

        const addons = Array.isArray(addonsJson.addons) ? (addonsJson.addons as PublicAddon[]) : [];
        const operationalSettings = parseAddonOperationalSetting(
          typeof settingsJson.value === "string" ? settingsJson.value : null
        );

        const merged = mergeAddonsWithOperationalSettings(addons, operationalSettings)
          .filter((addon) => addon.enabled && ["event", "both"].includes(getAddonAppliesTo(addon.applies_to)))
          .sort((left, right) => {
            const leftOrder = typeof left.display_order === "number" ? left.display_order : Number.MAX_SAFE_INTEGER;
            const rightOrder = typeof right.display_order === "number" ? right.display_order : Number.MAX_SAFE_INTEGER;
            if (leftOrder !== rightOrder) return leftOrder - rightOrder;
            return left.label.localeCompare(right.label);
          })
          .map((addon) => ({
            ...addon,
            key: addon.id,
            source: "managed" as const,
          }));

        if (!cancelled) {
          setManagedEventServices(merged as EventServiceOption[]);
        }
      } catch (loadError) {
        console.error("[events] event services load error:", loadError);
        if (!cancelled) {
          setManagedEventServices([]);
        }
      }
    }

    void loadEventServices();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reload availability whenever villa changes (clear dates only when switching villa, not on first select)
  useEffect(() => {
    if (!form.villa) {
      prevVillaRef.current = "";
      setConfirmedRanges([]);
      return;
    }
    if (prevVillaRef.current && prevVillaRef.current !== form.villa) {
      setDateRange(undefined);
    }
    prevVillaRef.current = form.villa;
    fetch(`/api/bookings/availability?villa=${encodeURIComponent(form.villa)}`)
      .then(r => r.json())
      .then(d => setConfirmedRanges(Array.isArray(d.ranges) ? d.ranges : []))
      .catch(() => setConfirmedRanges([]));
  }, [form.villa]);

  // ── Derived values ────────────────────────────────────────────────────────
  const today = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

  /**
   * Blocked day ranges for the calendar (same construction as app/book/page.tsx).
   * `confirmedRanges` from /api/bookings/availability are already operational per lib/calendar/availability.ts.
   */
  const bookedRangeList: Array<{ from: Date; to: Date }> = confirmedRanges.flatMap(r => {
    const from = parseLocalISO(r.check_in);
    const to   = parseLocalISO(r.check_out);
    to.setDate(to.getDate() - 1);
    if (to < from) return [];
    return [{ from, to }];
  });

  function isCalendarDateBlocked(d: Date): boolean {
    if (d < today) return true;
    return bookedRangeList.some(r => d >= r.from && d <= r.to);
  }

  function addLocalDays(day: Date, days: number): Date {
    const next = new Date(day.getTime());
    next.setDate(next.getDate() + days);
    return next;
  }

  /** Every calendar day in [check_in − 1, check_out) must be free — mirrors incoming event overlap in findAvailabilityConflict (event-block.ts). */
  function isEventOperationalSpanClear(eventStart: Date, eventCheckout: Date): boolean {
    if (eventCheckout <= eventStart) return false;
    const setupISO = addDaysToDateOnly(toISO(eventStart), -1);
    let d = parseLocalISO(setupISO);
    for (; d < eventCheckout; d = addLocalDays(d, 1)) {
      if (isCalendarDateBlocked(d)) return false;
    }
    return true;
  }

  function incomingOperationalOverlapsConfirmed(eventStart: Date, eventCheckout: Date): boolean {
    const incomingOp = {
      check_in: addDaysToDateOnly(toISO(eventStart), -1),
      check_out: toISO(eventCheckout),
    };
    return confirmedRanges.some((r) =>
      rangesOverlap(incomingOp, { check_in: r.check_in, check_out: r.check_out }),
    );
  }

  function isValidEventCheckoutFrom(eventStart: Date, eventCheckout: Date): boolean {
    if (eventCheckout <= eventStart) return false;
    if (isCalendarDateBlocked(eventCheckout)) return false;
    return isEventOperationalSpanClear(eventStart, eventCheckout);
  }

  function hasValidEventCheckoutFromCheckIn(checkInDay: Date): boolean {
    const setupISO = addDaysToDateOnly(toISO(checkInDay), -1);
    if (isCalendarDateBlocked(parseLocalISO(setupISO))) return false;

    for (let n = MIN_EVENT_NIGHTS; n <= 366; n++) {
      const candidateCheckout = addLocalDays(checkInDay, n);
      if (isValidEventCheckoutFrom(checkInDay, candidateCheckout)) return true;
    }
    return false;
  }

  function isDeadEventCheckInDate(day: Date): boolean {
    return !isCalendarDateBlocked(day) && !hasValidEventCheckoutFromCheckIn(day);
  }

  const isChoosingCheckout = Boolean(dateRange?.from && !dateRange.to);

  const disabledDays: Matcher[] = [
    { before: today },
    ...bookedRangeList,
    ...(isChoosingCheckout
      ? [(day: Date) => !isValidEventCheckoutFrom(dateRange!.from!, day)]
      : [isDeadEventCheckInDate]),
  ];

  const fallbackEventServices = useMemo<EventServiceOption[]>(
    () =>
      EVENT_SERVICE_SEED_DEFINITIONS.map((service) => ({
        key: `fallback-${slugifyKey(service.label)}`,
        id: `fallback-${slugifyKey(service.label)}`,
        label: service.label,
        enabled: true,
        source: "fallback" as const,
        applies_to: "event",
        applicable_event_types: expandSeedApplicableEventTypes(service.applicable_event_types),
        quantity_enabled: service.quantity_enabled,
        unit_label: service.unit_label,
        pricing_unit: service.pricing_unit,
        min_quantity: service.min_quantity,
        max_quantity: service.max_quantity,
        category: service.category,
        recommended: service.recommended,
        display_order: service.display_order,
        description: service.description,
        price: service.price,
        currency: service.currency,
        pricing_model: service.pricing_model,
      })),
    []
  );

  const hasManagedEventServices = managedEventServices.length > 0;
  const eventServiceCatalog = hasManagedEventServices ? managedEventServices : fallbackEventServices;

  // When attendee count changes, refresh attendee-linked service quantities (unless the guest edited that row).
  useEffect(() => {
    const cap = effectiveAttendees;
    setSelectedServiceQuantities((previous) => {
      let changed = false;
      const next: Record<string, number> = { ...previous };
      for (const key of Object.keys(previous)) {
        const svc = eventServiceCatalog.find((s) => s.key === key);
        if (!svc) continue;
        const maxQ = getEventServiceMaxQuantity(svc);
        if (isEventServiceQuantityTiedToAttendees(svc) && !quantityManuallyAdjustedRef.current.has(key)) {
          const desired = getInitialQuantityForEventService(svc, cap);
          if (next[key] !== desired) {
            next[key] = desired;
            changed = true;
          }
        } else if (next[key] > maxQ) {
          next[key] = maxQ;
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [effectiveAttendees, eventServiceCatalog]);

  const filteredEventServices = useMemo(() => {
    const normalizedFormType = form.eventType ? normalizeEventType(form.eventType) : null;
    return eventServiceCatalog.filter((service) => {
      if (!hasManagedEventServices) return true;
      const applicableEventTypes = service.applicable_event_types ?? [];
      if (applicableEventTypes.length === 0) return true;
      if (!normalizedFormType) return true;
      // Normalize stored applicable_event_types so old/intermediate values still match.
      return applicableEventTypes.some((t) => normalizeEventType(t) === normalizedFormType);
    });
  }, [eventServiceCatalog, form.eventType, hasManagedEventServices]);

  const groupedEventServices = useMemo(() => {
    const grouped = new Map<string, EventServiceOption[]>();
    for (const service of filteredEventServices) {
      const title = getEventServiceGroupTitle(service);
      const existing = grouped.get(title) ?? [];
      existing.push(service);
      grouped.set(title, existing);
    }

    return Array.from(grouped.entries())
      .sort(([leftTitle], [rightTitle]) => {
        const leftIndex = EVENT_SERVICE_GROUP_ORDER.indexOf(leftTitle as (typeof EVENT_SERVICE_GROUP_ORDER)[number]);
        const rightIndex = EVENT_SERVICE_GROUP_ORDER.indexOf(rightTitle as (typeof EVENT_SERVICE_GROUP_ORDER)[number]);
        const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
        const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
        if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight;
        return leftTitle.localeCompare(rightTitle);
      })
      .map(([title, services]) => ({ title, services }));
  }, [filteredEventServices]);

  const selectedEventServices = useMemo(() => {
    const serviceLookup = new Map(eventServiceCatalog.map((service) => [service.key, service]));
    return Object.entries(selectedServiceQuantities)
      .map(([key, quantity]) => {
        const service = serviceLookup.get(key);
        if (!service) return null;
        return { service, quantity };
      })
      .filter((entry): entry is { service: EventServiceOption; quantity: number } => entry !== null);
  }, [eventServiceCatalog, selectedServiceQuantities]);

  const catalogRowsForExclusivity: CatalogRow[] = useMemo(
    () => eventServiceCatalog.map((s) => ({ id: s.id, label: s.label, key: s.key })),
    [eventServiceCatalog],
  );

  useEffect(() => {
    setRecommendedPackKeys((prev) => prev.filter((k) => k in selectedServiceQuantities));
  }, [selectedServiceQuantities]);

  const checkIn = dateRange?.from ? toISO(dateRange.from) : "";
  const checkOut = dateRange?.to ? toISO(dateRange.to) : "";
  const nights = nightCount(checkIn, checkOut);

  const eventDeadDayHints = useMemo(() => {
    if (!checkIn || !checkOut) return null;
    return detectDeadDaySuggestion(checkIn, checkOut, confirmedRanges);
  }, [checkIn, checkOut, confirmedRanges]);

  const selectedEventRecommendation = useMemo(() => {
    if (!form.eventType) return null;
    // Normalize before lookup so any stored old value resolves to its canonical entry.
    const recommendation = EVENT_RECOMMENDATIONS[normalizeEventType(form.eventType)];
    if (!recommendation) return null;
    const recommendedServices = filteredEventServices.filter((service) => {
      // For managed services: honour the admin recommended flag first;
      // fall back to label-matching so existing services remain recommended
      // without requiring admin to re-flag them after this change.
      if (hasManagedEventServices && service.recommended === true) return true;
      return recommendation.recommended.some((label) => label.toLowerCase() === service.label.toLowerCase());
    });
    return { ...recommendation, recommendedServices };
  }, [filteredEventServices, form.eventType, hasManagedEventServices]);
  const serviceIntent = (() => {
    const count = selectedEventServices.length;
    if (count <= 2) return "Basic";
    if (count >= 7) return "Premium";
    return "Full setup";
  })();
  const selectedEventServiceSummaries = selectedEventServices.map(({ service, quantity }) =>
    formatSelectedEventService(service, quantity)
  );

  const eventSetupEstimate = useMemo((): EventSetupEstimatePayload | null => {
    if (selectedEventServices.length === 0) return null;
    const lines: EventSetupEstimatePayload["lines"] = [];
    let total = 0;
    let currency = "USD";
    const packKeySet = new Set(recommendedPackKeys.filter((k) => k in selectedServiceQuantities));
    let recommendedSubtotal = 0;
    let upgradesSubtotal = 0;
    for (const { service, quantity } of selectedEventServices) {
      if (service.currency) currency = service.currency;
      const row = service as unknown as EventServicePricingRow;
      const lineRaw = computeEventServiceLineSubtotal(row, quantity, nights);
      const line = Math.round(lineRaw * 100) / 100;
      total += line;
      if (packKeySet.size > 0 && packKeySet.has(service.key)) recommendedSubtotal += line;
      else upgradesSubtotal += line;
      const qtyDisplay = service.quantity_enabled ? quantity : 1;
      const unitPrice =
        service.quantity_enabled && qtyDisplay > 0
          ? Math.round((line / qtyDisplay) * 100) / 100
          : typeof service.price === "number" && Number.isFinite(service.price)
            ? Math.round(service.price * 100) / 100
            : 0;
      lines.push({
        label: service.label,
        quantity: qtyDisplay,
        unit_price: unitPrice,
        line_total: line,
        pricing_model: service.pricing_model,
      });
    }
    const roundedTotal = Math.round(total * 100) / 100;
    const packKeysPersist = Array.from(packKeySet);
    const base: EventSetupEstimatePayload = {
      version: 1,
      currency,
      total: roundedTotal,
      lines,
    };
    if (packKeysPersist.length > 0) {
      base.pack_keys = packKeysPersist;
      base.recommended_subtotal = Math.round(recommendedSubtotal * 100) / 100;
      base.upgrades_subtotal = Math.round(upgradesSubtotal * 100) / 100;
    }
    return base;
  }, [selectedEventServices, nights, recommendedPackKeys, selectedServiceQuantities]);

  const guestEmail = guest.email.trim();
  const guestEmailInvalid = authStatus !== "member" && guestEmail.length > 0 && !EMAIL_RE.test(guestEmail);

  useEffect(() => {
    const visibleKeys = new Set(filteredEventServices.map((service) => service.key));
    setSelectedServiceQuantities((previous) => {
      const nextEntries = Object.entries(previous).filter(([key]) => visibleKeys.has(key));
      if (nextEntries.length === Object.keys(previous).length) {
        return previous;
      }
      return Object.fromEntries(nextEntries);
    });
  }, [filteredEventServices]);

  // ── Event handlers ────────────────────────────────────────────────────────
  function handleFormChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    if (e.target.name === "dayVisitors") {
      const raw = e.target.value;
      const n = parseInt(raw, 10);
      if (raw !== "" && Number.isFinite(n) && n > MAX_EVENT_ATTENDEES) {
        setError(EVENT_ATTENDEE_CAP_ERROR);
        setForm((f) => ({ ...f, dayVisitors: String(MAX_EVENT_ATTENDEES) }));
        return;
      }
      setError("");
    }
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  function handleGuestChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setGuest(g => ({ ...g, [e.target.name]: e.target.value }));
  }

  function focusGold(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = GOLD;
  }
  function blurGold(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)";
  }

  function handleDateSelect(nextRange: DateRange | undefined, selectedDay: Date) {
    const startsNewRange =
      !dateRange?.from ||
      Boolean(dateRange.to) ||
      toISO(selectedDay) <= toISO(dateRange.from);

    if (startsNewRange && !hasValidEventCheckoutFromCheckIn(selectedDay)) {
      setDateRange(undefined);
      setError(
        "Please choose an event start where the setup day before it and at least one valid end date are available.",
      );
      return;
    }

    if (
      nextRange?.from &&
      nextRange.to &&
      (!isValidEventCheckoutFrom(nextRange.from, nextRange.to) ||
        incomingOperationalOverlapsConfirmed(nextRange.from, nextRange.to))
    ) {
      setDateRange(undefined);
      setError(
        "Those dates conflict with an existing reservation, block the setup window before your event, or cannot form a continuous event range. Please choose your dates again.",
      );
      return;
    }

    setError("");
    setDateRange(nextRange);
  }

  function toggleService(service: EventServiceOption) {
    setSelectedServiceQuantities((previous) => {
      if (service.key in previous) {
        quantityManuallyAdjustedRef.current.delete(service.key);
        const { [service.key]: _removed, ...rest } = previous;
        return rest;
      }
      const qty = getInitialQuantityForEventService(service, effectiveAttendees);
      let next: Record<string, number> = { ...previous, [service.key]: qty };
      const sid = canonicalSeedIdForCatalogRow(service);
      if (sid) {
        const removeSeedIds = getSeedIdsToClearWhenSelecting(sid);
        const clearKeys = new Set(catalogKeysForSeedIds(catalogRowsForExclusivity, removeSeedIds));
        for (const ck of Array.from(clearKeys)) {
          if (ck !== service.key) {
            delete next[ck];
            quantityManuallyAdjustedRef.current.delete(ck);
          }
        }
      }
      return next;
    });
  }

  function updateServiceQuantity(service: EventServiceOption, rawValue: string) {
    quantityManuallyAdjustedRef.current.add(service.key);
    const parsed = parseInt(rawValue, 10);
    const min = getEventServiceMinQuantity(service);
    const max = getEventServiceMaxQuantity(service);
    const safeQuantity = Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : min;

    setSelectedServiceQuantities((previous) => ({
      ...previous,
      [service.key]: safeQuantity,
    }));
  }

  function addRecommendedPack() {
    if (!form.eventType) {
      setError("Please choose an event type before adding a recommended setup.");
      return;
    }
    const normalized = normalizeEventType(form.eventType);
    const seedPack = resolveRecommendedPackSeedIds(normalized);
    const quantities = buildRecommendedQuantities(catalogRowsForExclusivity, seedPack, effectiveAttendees);
    const packKeyList = Object.keys(quantities);
    setRecommendedPackKeys(packKeyList);
    setSelectedServiceQuantities((prev) => {
      const toRemove = new Set<string>();
      for (const sid of Array.from(seedPack)) {
        for (const rid of Array.from(getSeedIdsToClearWhenSelecting(sid))) {
          for (const ck of catalogKeysForSeedIds(catalogRowsForExclusivity, new Set([rid]))) {
            toRemove.add(ck);
          }
        }
      }
      const next = { ...prev };
      for (const k of Array.from(toRemove)) {
        if (!(k in quantities)) delete next[k];
      }
      quantityManuallyAdjustedRef.current.clear();
      return { ...next, ...quantities };
    });
    setError("");
  }

  function goNext() {
    setError("");
    if (step === 1) {
      if (!form.villa)               { setError("Please select a villa preference before continuing."); return; }
      if (!form.eventType)           { setError("Please choose an event type before continuing."); return; }
      if (!checkIn)                  { setError("Please select your preferred date(s) to continue."); return; }
      if (!checkOut)                 { setError("Please select an end date for your event window."); return; }
      if (checkOut <= checkIn)       { setError("Your event end date must be after the start date."); return; }
      if (
        dateRange?.from &&
        dateRange.to &&
        (!isValidEventCheckoutFrom(dateRange.from, dateRange.to) ||
          incomingOperationalOverlapsConfirmed(dateRange.from, dateRange.to))
      ) {
        setError(
          "Those dates conflict with an existing reservation or the venue setup window. Please adjust your event dates.",
        );
        return;
      }
      const attendees = parseInt(form.dayVisitors, 10);
      if (!Number.isFinite(attendees) || attendees < 1) {
        setError("Please enter the expected number of attendees."); return;
      }
      if (attendees > MAX_EVENT_ATTENDEES) {
        setError(EVENT_ATTENDEE_CAP_ERROR);
        return;
      }
    }
    setStep(s => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    setError("");
    setStep((s) => (s <= 1 ? 1 : s - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit() {
    setError("");
    setLoading(true);
    try {
      if (!form.villa) throw new Error("Please select a villa preference.");
      if (!form.eventType) throw new Error("Please choose an event type.");
      if (!checkIn || !checkOut) throw new Error("Please select your preferred event dates.");
      if (checkOut <= checkIn) throw new Error("Your event end date must be after the start date.");
      const attendees = parseInt(form.dayVisitors, 10);
      if (!Number.isFinite(attendees) || attendees < 1) throw new Error("Please enter the expected number of attendees.");
      if (attendees > MAX_EVENT_ATTENDEES) throw new Error(EVENT_ATTENDEE_CAP_ERROR);
      const sleeping = parseInt(form.sleepingGuests, 10);
      if (!sleeping || sleeping < 1) throw new Error("Please enter the host overnight stay count (at least 1).");
      if (authStatus !== "member") {
        if (!guest.fullName.trim()) throw new Error("Please enter your full name so we know who to contact.");
        if (!guestEmail) throw new Error("Please enter your email address so we can reach you about your event.");
        if (!EMAIL_RE.test(guestEmail)) throw new Error("Please enter a valid email address.");
      }
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr) console.error("[events] auth.getUser error:", authErr);

      let accessToken: string | null = null;
      if (user) {
        const { data: { session } } = await supabase.auth.getSession();
        accessToken = session?.access_token ?? null;
      }

      // Compose structured [Event Inquiry] notes block in the existing message field.
      const userNotes = (form.message ?? "").replace(/\n*\[Event Inquiry][\s\S]*$/, "").trim();
      const block: string[] = ["[Event Inquiry]"];
      if (form.eventType)            block.push(`Event Type: ${form.eventType}`);
      block.push(`Preferred Date(s): ${checkIn} → ${checkOut} (${nights} ${nights === 1 ? "night" : "nights"})`);
      if (form.dayVisitors)          block.push(`Expected Attendees: ${form.dayVisitors}`);
      if (form.sleepingGuests)       block.push(`Overnight Hosts: ${form.sleepingGuests}`);
      if (selectedEventServiceSummaries.length > 0) {
        block.push("Requested Event Services:");
        for (const serviceSummary of selectedEventServiceSummaries) {
          block.push(`- ${serviceSummary}`);
        }
      }
      block.push(`Service Intent: ${serviceIntent}`);
      block.push(`Notes: ${userNotes || "None"}`);
      if (eventSetupEstimate) {
        block.push(`${EVENT_SETUP_ESTIMATE_PREFIX} ${JSON.stringify(eventSetupEstimate)}`);
      }
      const composedMessage = block.join("\n");

      const body: Record<string, unknown> = {
        villa:           form.villa,
        check_in:        checkIn,
        check_out:       checkOut,
        sleeping_guests: form.sleepingGuests,
        day_visitors:    form.dayVisitors,
        event_type:      form.eventType || null,
        message:         composedMessage,
        addons:          [],
      };
      if (user) {
        body.member_id = user.id;
      } else {
        body.guest_name    = guest.fullName.trim();
        body.guest_email   = guest.email.trim();
        body.guest_phone   = guest.phoneNumber ? `${guest.dialCode}${guest.phoneNumber}` : null;
        body.guest_country = guest.country || null;
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

      const res  = await fetch("/api/bookings", { method: "POST", headers, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to submit your event inquiry.");

      const booking     = json.booking;
      const displayName = user ? memberName : guest.fullName;
      const params      = new URLSearchParams({
        villa:          form.villa,
        checkIn,
        checkOut,
        sleepingGuests: form.sleepingGuests,
        dayVisitors:    form.dayVisitors,
        eventType:      form.eventType,
        id:             booking?.id ?? "",
        ...(displayName ? { name: displayName } : {}),
      });
      router.push(`/booking-confirmed?${params.toString()}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      console.error("[events] submission error:", err);
      setError(friendlyError(msg));
    } finally {
      setLoading(false);
    }
  }

  // ── Auth loading ──────────────────────────────────────────────────────────
  if (authStatus === "loading") {
    return (
      <main style={{ backgroundColor: MIDNIGHT, minHeight: "100vh", padding: "80px 24px" }}>
        <div style={{ width: "100%", maxWidth: "720px", margin: "0 auto" }} aria-hidden="true">
          <div style={{ width: "52px", margin: "0 auto 2.5rem", opacity: 0.45 }}><OrayaEmblem /></div>
          <p style={{ textAlign: "center", color: MUTED, fontFamily: LATO, fontSize: "12px" }}>Loading…</p>
        </div>
      </main>
    );
  }

  const containerWidth = step === 1 && form.villa ? "720px" : "560px";

  return (
    <main style={{ backgroundColor: MIDNIGHT, minHeight: "100vh", padding: "80px 24px" }}>
      <style>{CALENDAR_CSS}</style>

      <div style={{ width: "100%", maxWidth: containerWidth, margin: "0 auto", transition: "max-width 0.3s ease" }}>

        {/* Logo */}
        <a href="/" style={{ display: "block", width: "52px", margin: "0 auto 2.5rem", cursor: "pointer" }}>
          <OrayaEmblem />
        </a>

        {/* Page heading */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "12px" }}>
            Event Inquiry
          </p>
          <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2rem", fontWeight: 400, color: WHITE, margin: "0 0 10px" }}>
            Plan Your Event
          </h1>
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, lineHeight: 1.7, margin: "0 0 10px" }}>
            Tell us what you are planning. We will review availability, setup, and services, and respond with a tailored proposal (typically within one business day).
          </p>
          <p style={{ fontFamily: LATO, fontSize: "11px", color: "rgba(255,255,255,0.45)", lineHeight: 1.65, margin: 0 }}>
            Every event is reviewed and prepared by the Oraya team before confirmation. Coordinated support continues through your date. Questions:{" "}
            <a href="mailto:hello@stayoraya.com" style={{ color: GOLD, textDecoration: "none" }}>hello@stayoraya.com</a>
          </p>
        </div>

        {/* Standing inquiry banner */}
        <div style={{ border: "0.5px solid rgba(197,164,109,0.25)", backgroundColor: "rgba(197,164,109,0.06)", padding: "12px 16px", marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <p style={{ fontFamily: LATO, fontSize: "11px", color: "rgba(255,255,255,0.7)", margin: 0, lineHeight: 1.6, flex: 1, minWidth: "240px" }}>
            This is an inquiry, not an instant booking. Event inquiries are reviewed as a full venue request, including guest flow, setup areas, and operational requirements. Nothing is confirmed until Oraya responds and aligns details with you.
          </p>
          <a
            href="/book"
            style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, backgroundColor: "transparent", border: "0.5px solid rgba(197,164,109,0.3)", padding: "8px 14px", textDecoration: "none", whiteSpace: "nowrap" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = GOLD; (e.currentTarget as HTMLElement).style.color = GOLD; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(197,164,109,0.3)"; (e.currentTarget as HTMLElement).style.color = MUTED; }}
          >
            Book a stay instead
          </a>
        </div>

        {/* Auth identity banner */}
        {authStatus === "member" ? (
          <div style={{ border: "0.5px solid rgba(197,164,109,0.2)", backgroundColor: "rgba(197,164,109,0.04)", padding: "0.875rem 1.25rem", marginBottom: "2rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ fontFamily: LATO, fontSize: "12px", color: "rgba(255,255,255,0.6)", margin: 0 }}>
              Inquiring as <span style={{ color: GOLD }}>{memberName || "member"}</span>
            </p>
            <a href="/login" style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, textDecoration: "none" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = GOLD; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = MUTED; }}>
              Not you?
            </a>
          </div>
        ) : null}

        <StepIndicator step={step} />

        <div key={step} className="step-content">

          {/* ════════════════════════════════════════════════════════════════
              STEP 1 — Event Basics: villa + event type + dates + attendees
          ════════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

              {/* Villa preference */}
              <div>
                <p style={{ ...labelStyle, marginBottom: "10px" }}>Villa preference</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px" }}>
                  {VILLAS.map(villa => {
                    const selected = form.villa === villa;
                    return (
                      <button
                        key={villa}
                        type="button"
                        onClick={() => { setForm(f => ({ ...f, villa })); setError(""); }}
                        style={{
                          fontFamily: LATO, fontSize: "12px",
                          padding: "12px 14px", textAlign: "left",
                          border: `0.5px solid ${selected ? GOLD : "rgba(197,164,109,0.2)"}`,
                          backgroundColor: selected ? "rgba(197,164,109,0.1)" : "rgba(255,255,255,0.02)",
                          color: selected ? WHITE : "rgba(255,255,255,0.7)",
                          cursor: "pointer",
                          transition: "border-color 0.15s, background-color 0.15s",
                        }}
                      >
                        {villa}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Event type */}
              <div>
                <p style={{ ...labelStyle, marginBottom: "12px" }}>Event Type</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "8px" }}>
                  {EVENT_TYPES.map(et => {
                    const selected = form.eventType === et.value;
                    return (
                      <button
                        key={et.value}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, eventType: selected ? "" : et.value }))}
                        style={{
                          display: "flex", alignItems: "flex-start", gap: "12px",
                          padding: "14px 16px", textAlign: "left", width: "100%",
                          border: `0.5px solid ${selected ? GOLD : "rgba(197,164,109,0.18)"}`,
                          backgroundColor: selected ? "rgba(197,164,109,0.08)" : "rgba(255,255,255,0.02)",
                          cursor: "pointer",
                          transition: "border-color 0.15s, background-color 0.15s",
                        }}
                      >
                        <div style={{
                          width: "16px", height: "16px", flexShrink: 0, marginTop: "2px",
                          border: `1px solid ${selected ? GOLD : "rgba(197,164,109,0.3)"}`,
                          backgroundColor: selected ? GOLD : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {selected && <span style={{ color: CHARCOAL, fontSize: "10px", fontWeight: 700, lineHeight: 1 }}>✓</span>}
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontFamily: LATO, fontSize: "13px", color: selected ? WHITE : "rgba(255,255,255,0.7)", margin: "0 0 4px", fontWeight: selected ? 400 : 300 }}>
                            {et.label}
                          </p>
                          <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.55 }}>
                            {et.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {selectedEventRecommendation && (
                  <div style={{ marginTop: "14px", border: "0.5px solid rgba(197,164,109,0.22)", backgroundColor: "rgba(197,164,109,0.05)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div>
                      <p style={{ fontFamily: PLAYFAIR, fontSize: "18px", fontWeight: 400, color: WHITE, margin: "0 0 6px" }}>
                        {form.eventType}
                      </p>
                      <p style={{ fontFamily: LATO, fontSize: "12px", color: "rgba(255,255,255,0.72)", margin: 0, lineHeight: 1.65 }}>
                        {selectedEventRecommendation.guidance}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2.5px", textTransform: "uppercase", color: GOLD, margin: "0 0 8px" }}>
                        Recommended
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {selectedEventRecommendation.recommendedServices.map((service) => (
                          <span
                            key={service.key}
                            style={{
                              fontFamily: LATO,
                              fontSize: "11px",
                              color: service.key in selectedServiceQuantities ? WHITE : "rgba(255,255,255,0.72)",
                              border: `0.5px solid ${service.key in selectedServiceQuantities ? GOLD : "rgba(197,164,109,0.18)"}`,
                              backgroundColor: service.key in selectedServiceQuantities ? "rgba(197,164,109,0.08)" : "rgba(255,255,255,0.02)",
                              padding: "7px 10px",
                            }}
                          >
                            {service.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    {selectedEventRecommendation.recommendedServices.length > 0 && (
                      <button
                        type="button"
                        onClick={addRecommendedPack}
                        style={{ alignSelf: "flex-start", fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "11px 18px", cursor: "pointer" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}
                      >
                        Add recommended setup
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Calendar — only after villa selected */}
              {form.villa ? (
                <div>
                  <p style={{ ...labelStyle, marginBottom: "10px" }}>Preferred date(s)</p>
                  <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "0 0 12px", lineHeight: 1.6 }}>
                    Choose your event start and end. Dates already held—including the setup day before your start—are blocked the same way as stay booking. Oraya will confirm the final window with you.
                  </p>
                  <div style={{ border: "0.5px solid rgba(197,164,109,0.12)", backgroundColor: "rgba(255,255,255,0.01)", padding: "1.25rem" }}>
                    <div className="oraya-cal">
                      <DayPicker
                        mode="range"
                        selected={dateRange}
                        onSelect={handleDateSelect}
                        disabled={disabledDays}
                        modifiers={{ deadCheckIn: isChoosingCheckout ? () => false : isDeadEventCheckInDate }}
                        numberOfMonths={2}
                        fromDate={today}
                        showOutsideDays
                      />
                    </div>
                  </div>

                  {eventDeadDayHints && (eventDeadDayHints.suggestLateCheckout || eventDeadDayHints.suggestEarlyCheckin) && (
                    <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "12px 0 0", lineHeight: 1.65 }}>
                      {eventDeadDayHints.suggestEarlyCheckin
                        ? "Your window sits next to a tight one-day gap between other reservations. Access and load-in timing may need extra coordination—we will confirm with the proposal."
                        : "Your event end sits next to a short gap before the next hold. Wrap or load-out timing may need coordination—we will confirm with the proposal."}
                    </p>
                  )}

                  {checkIn && (
                    <div style={{ marginTop: "14px", padding: "14px 20px", border: "0.5px solid rgba(197,164,109,0.2)", backgroundColor: "rgba(197,164,109,0.04)", display: "flex", flexWrap: "wrap", gap: "28px" }}>
                      <div>
                        <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, margin: "0 0 4px" }}>Start</p>
                        <p style={{ fontFamily: LATO, fontSize: "14px", color: WHITE, margin: 0 }}>{fmtDate(checkIn)}</p>
                      </div>
                      {checkOut ? (
                        <>
                          <div>
                            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, margin: "0 0 4px" }}>End</p>
                            <p style={{ fontFamily: LATO, fontSize: "14px", color: WHITE, margin: 0 }}>{fmtDate(checkOut)}</p>
                          </div>
                          <div>
                            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, margin: "0 0 4px" }}>Window</p>
                            <p style={{ fontFamily: LATO, fontSize: "14px", color: GOLD, margin: 0 }}>
                              {nights} {nights === 1 ? "night" : "nights"}
                            </p>
                          </div>
                        </>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0 }}>Now select an end date</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ border: "0.5px dashed rgba(197,164,109,0.15)", padding: "2rem", textAlign: "center" }}>
                  <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0, letterSpacing: "0.5px" }}>
                    Select a villa preference to view dates
                  </p>
                </div>
              )}

              {/* Expected attendees */}
              <div>
                <label style={labelStyle}>Expected number of attendees</label>
                <input
                  name="dayVisitors"
                  type="number"
                  required
                  min={1}
                  max={MAX_EVENT_ATTENDEES}
                  value={form.dayVisitors}
                  onChange={handleFormChange}
                  onFocus={focusGold}
                  onBlur={blurGold}
                  style={inputStyle}
                  placeholder="e.g. 24"
                />
                <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, marginTop: "6px", lineHeight: 1.5 }}>
                  Private events at Oraya are limited to {MAX_EVENT_ATTENDEES} attendees. Final capacity is confirmed after review.
                </p>
              </div>

              {error && (
                <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", textAlign: "center", lineHeight: 1.6, margin: 0 }}>
                  {error}
                </p>
              )}

              <button
                onClick={goNext}
                style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px", textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "16px", cursor: "pointer" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}
              >
                Continue →
              </button>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 2 — Services & Setup Requirements
          ════════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

              <div>
                <p style={{ fontFamily: PLAYFAIR, fontSize: "20px", fontWeight: 400, color: WHITE, margin: "0 0 6px" }}>
                  Services &amp; Setup Requirements
                </p>
                <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: "0 0 16px", lineHeight: 1.6 }}>
                  Select the services you may need. Oraya will review and confirm the final setup.
                </p>
                {selectedEventRecommendation && (
                  <p style={{ fontFamily: LATO, fontSize: "11px", color: "rgba(255,255,255,0.6)", margin: "0 0 16px", lineHeight: 1.6 }}>
                    Recommended for {form.eventType}: {(selectedEventRecommendation.recommendedServices.length > 0
                      ? selectedEventRecommendation.recommendedServices.map((service) => service.label)
                      : selectedEventRecommendation.recommended
                    ).join(", ")}.
                  </p>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: "18px", marginBottom: "16px" }}>
                  {groupedEventServices.length > 0 ? groupedEventServices.map((group) => (
                    <div key={group.title}>
                      <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "2.5px", textTransform: "uppercase", color: GOLD, margin: "0 0 10px" }}>
                        {group.title}
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
                        {group.services.map((service) => {
                          const selected = service.key in selectedServiceQuantities;
                          const quantity = selectedServiceQuantities[service.key] ?? getInitialQuantityForEventService(service, effectiveAttendees);
                          const unitLabel = getEventServiceUnitLabel(service);
                          const minQuantity = getEventServiceMinQuantity(service);
                          const maxQuantity = getEventServiceMaxQuantity(service);

                          return (
                            <div
                              key={service.key}
                              style={{
                                border: `0.5px solid ${selected ? GOLD : "rgba(197,164,109,0.18)"}`,
                                backgroundColor: selected ? "rgba(197,164,109,0.08)" : "rgba(255,255,255,0.02)",
                                padding: "12px 14px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "12px",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => toggleService(service)}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "10px",
                                  textAlign: "left",
                                  backgroundColor: "transparent",
                                  border: "none",
                                  padding: 0,
                                  cursor: "pointer",
                                }}
                              >
                                <div style={{
                                  width: "14px", height: "14px", flexShrink: 0,
                                  border: `1px solid ${selected ? GOLD : "rgba(197,164,109,0.3)"}`,
                                  backgroundColor: selected ? GOLD : "transparent",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                }}>
                                  {selected && <span style={{ color: CHARCOAL, fontSize: "9px", fontWeight: 700, lineHeight: 1 }}>✓</span>}
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                  <span style={{ fontFamily: LATO, fontSize: "12px", color: selected ? WHITE : "rgba(255,255,255,0.75)" }}>
                                    {service.label}
                                  </span>
                                  {service.description?.trim() ? (
                                    <span style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, lineHeight: 1.55, fontWeight: 300 }}>
                                      {service.description.trim()}
                                    </span>
                                  ) : null}
                                  {service.quantity_enabled && (
                                    <span style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, lineHeight: 1.5 }}>
                                      Quantity supported{unitLabel ? ` - ${unitLabel}` : ""}
                                    </span>
                                  )}
                                </div>
                              </button>

                              {selected && service.quantity_enabled && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                  <label style={{ ...labelStyle, marginBottom: 0 }}>
                                    Quantity{unitLabel ? ` (${unitLabel})` : ""}
                                  </label>
                                  <input
                                    type="number"
                                    min={minQuantity}
                                    max={maxQuantity}
                                    value={quantity}
                                    onChange={(event) => updateServiceQuantity(service, event.target.value)}
                                    onFocus={focusGold}
                                    onBlur={blurGold}
                                    style={{ ...inputStyle, padding: "12px 14px" }}
                                  />
                                  <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                                    Requested quantity: {quantity} {unitLabel ?? "units"}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )) : (
                    <div style={{ border: "0.5px solid rgba(197,164,109,0.18)", backgroundColor: "rgba(255,255,255,0.02)", padding: "16px 18px" }}>
                      <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0, lineHeight: 1.6 }}>
                        No event services are configured for this event type yet. Oraya will still review your requirements manually.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Inquiry-only copy */}
              <div style={{ border: "0.5px solid rgba(197,164,109,0.18)", backgroundColor: "rgba(197,164,109,0.04)", padding: "12px 16px" }}>
                <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "0 0 8px", lineHeight: 1.6 }}>
                  Oraya will review your event requirements and respond with availability, setup options, and a tailored proposal — typically within one business day.
                </p>
                <p style={{ fontFamily: LATO, fontSize: "11px", color: "rgba(255,255,255,0.7)", margin: 0, lineHeight: 1.6 }}>
                  Final event pricing is reviewed and quoted by Oraya.
                </p>
              </div>

              {eventSetupEstimate && <EventEstimatePanel estimate={eventSetupEstimate} />}

              {error && (
                <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", textAlign: "center", lineHeight: 1.6, margin: 0 }}>
                  {error}
                </p>
              )}

              <div style={{ display: "flex", gap: "12px" }}>
                <button onClick={goBack}
                  style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, backgroundColor: "transparent", border: "0.5px solid rgba(197,164,109,0.25)", padding: "16px 24px", cursor: "pointer" }}>
                  ← Back
                </button>
                <button onClick={goNext}
                  style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px", textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "16px", flex: 1, cursor: "pointer" }}>
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 3 — Host details, summary, and submit
          ════════════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

              <div>
                <p style={{ fontFamily: PLAYFAIR, fontSize: "20px", fontWeight: 400, color: WHITE, margin: "0 0 6px" }}>
                  Host Details
                </p>
                <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: "0 0 6px", lineHeight: 1.6 }}>
                  Event packages include overnight stay for the hosts. Review the summary below, then submit your inquiry in one step.
                </p>
              </div>

              {/* Overnight hosts */}
              <div>
                <label style={labelStyle}>Host overnight stay</label>
                <input
                  name="sleepingGuests"
                  type="number"
                  required
                  min={1}
                  max={8}
                  value={form.sleepingGuests}
                  onChange={handleFormChange}
                  onFocus={focusGold}
                  onBlur={blurGold}
                  style={inputStyle}
                />
                <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, marginTop: "6px", lineHeight: 1.5 }}>
                  Event packages include overnight stay for the hosts. Oraya will review the full package before confirmation.
                </p>
              </div>

              {/* Guest contact (when not member) */}
              {authStatus !== "member" && (
                <div style={{ border: "0.5px solid rgba(197,164,109,0.2)", backgroundColor: "rgba(255,255,255,0.02)", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "16px" }}>
                  <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
                    Your contact details
                  </p>

                  <div>
                    <label style={labelStyle}>Full name</label>
                    <input name="fullName" type="text" required value={guest.fullName} onChange={handleGuestChange}
                      placeholder="Your full name" style={inputStyle} onFocus={focusGold} onBlur={blurGold} />
                  </div>

                  <div>
                    <label style={labelStyle}>Email address</label>
                    <input name="email" type="email" required value={guest.email} onChange={handleGuestChange}
                      placeholder="you@example.com"
                      style={{ ...inputStyle, borderColor: guestEmailInvalid ? "#e07070" : "rgba(197,164,109,0.25)" }}
                      onFocus={focusGold} onBlur={blurGold} />
                    {guestEmailInvalid && (
                      <p style={{ fontFamily: LATO, fontSize: "11px", color: "#e07070", marginTop: "6px", lineHeight: 1.5 }}>
                        Please enter a valid email address.
                      </p>
                    )}
                  </div>

                  <div>
                    <label style={labelStyle}>
                      Phone number{" "}
                      <span style={{ color: "rgba(138,128,112,0.5)", letterSpacing: 0 }}>(optional)</span>
                    </label>
                    <div style={{ display: "flex" }}>
                      <select name="dialCode" value={guest.dialCode} onChange={handleGuestChange}
                        onFocus={focusGold} onBlur={blurGold}
                        style={{ ...inputStyle, width: "auto", flexShrink: 0, paddingRight: "10px", borderRight: "none", cursor: "pointer", minWidth: "120px" }}>
                        {DIAL_CODES.map(d => (
                          <option key={`${d.code}-${d.label}`} value={d.code} style={{ backgroundColor: MIDNIGHT }}>{d.flag} {d.code}</option>
                        ))}
                      </select>
                      <input name="phoneNumber" type="tel" value={guest.phoneNumber} onChange={handleGuestChange}
                        placeholder="70 000 000" style={{ ...inputStyle, flex: 1 }} onFocus={focusGold} onBlur={blurGold} />
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Country</label>
                    <select name="country" value={guest.country} onChange={handleGuestChange}
                      onFocus={focusGold} onBlur={blurGold} style={{ ...inputStyle, cursor: "pointer" }}>
                      {COUNTRIES.map(c => (
                        <option key={c} value={c} style={{ backgroundColor: MIDNIGHT }}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label style={labelStyle}>
                  Notes / special requests{" "}
                  <span style={{ color: "rgba(138,128,112,0.5)", letterSpacing: 0 }}>(optional)</span>
                </label>
                <textarea name="message" value={form.message} onChange={handleFormChange}
                  onFocus={focusGold} onBlur={blurGold}
                  rows={4}
                  placeholder="Tell us more about your event — theme, timing, dietary needs, or anything else we should know…"
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
              </div>

              <div>
                <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 14px" }}>
                  Event inquiry summary
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "16px" }}>
                  <div style={{ border: "0.5px solid rgba(197,164,109,0.18)", padding: "1.25rem", backgroundColor: "rgba(255,255,255,0.015)" }}>
                    <p style={{ fontFamily: PLAYFAIR, fontSize: "18px", fontWeight: 400, color: WHITE, margin: "0 0 12px" }}>
                      Event overview
                    </p>
                    {(
                      [
                        ["Villa preference", form.villa],
                        ["Preferred dates", `${fmtDate(checkIn)} to ${fmtDate(checkOut)}`],
                        ["Window", `${nights} ${nights === 1 ? "night" : "nights"}`],
                        ["Event type", form.eventType],
                        ["Attendees", form.dayVisitors],
                        ["Hosts overnight stay", form.sleepingGuests],
                      ] as [string, string][]
                    ).map(([label, value]) => {
                      const isHighlight = label === "Event type" || label === "Attendees" || label === "Hosts overnight stay";
                      return (
                        <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: isHighlight ? "12px 0" : "9px 0", borderBottom: "0.5px solid rgba(255,255,255,0.05)", gap: "16px" }}>
                          <span style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, flexShrink: 0, paddingRight: "16px" }}>
                            {label}
                          </span>
                          <span style={{ fontFamily: LATO, fontSize: isHighlight ? "14px" : "13px", color: isHighlight ? GOLD : WHITE, fontWeight: isHighlight ? 400 : 300, textAlign: "right", lineHeight: 1.5, maxWidth: "60%" }}>
                            {value}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ border: "0.5px solid rgba(197,164,109,0.18)", padding: "1.25rem", backgroundColor: "rgba(255,255,255,0.015)" }}>
                    <p style={{ fontFamily: PLAYFAIR, fontSize: "18px", fontWeight: 400, color: WHITE, margin: "0 0 12px" }}>
                      Selected services
                    </p>
                    {selectedEventServiceSummaries.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {selectedEventServiceSummaries.map((serviceSummary) => (
                          <span key={serviceSummary} style={{ fontFamily: LATO, fontSize: "11px", color: WHITE, border: "0.5px solid rgba(197,164,109,0.22)", backgroundColor: "rgba(197,164,109,0.05)", padding: "7px 10px" }}>
                            {serviceSummary}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0, lineHeight: 1.6 }}>
                        No services selected yet. Oraya can still recommend options after review.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {eventSetupEstimate && <EventEstimatePanel estimate={eventSetupEstimate} totalFontSize="24px" />}

              <div style={{ border: "0.5px solid rgba(197,164,109,0.22)", backgroundColor: "rgba(197,164,109,0.04)", padding: "16px 20px" }}>
                <p style={{ fontFamily: LATO, fontSize: "12px", color: "rgba(255,255,255,0.75)", margin: 0, lineHeight: 1.6 }}>
                  This request will be reviewed as a full event setup and you will receive a tailored proposal.
                </p>
              </div>

              {error && (
                <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", textAlign: "center", lineHeight: 1.6, margin: 0 }}>
                  {error}
                </p>
              )}

              <p style={{ fontFamily: LATO, fontSize: "9px", color: "rgba(255,255,255,0.38)", margin: "0 0 10px", lineHeight: 1.5, textAlign: "center", letterSpacing: "0.02em" }}>
                Each inquiry is manually reviewed to ensure availability and preparation quality.
              </p>

              <div style={{ display: "flex", gap: "12px" }}>
                <button onClick={goBack} disabled={loading}
                  style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, backgroundColor: "transparent", border: "0.5px solid rgba(197,164,109,0.25)", padding: "16px 24px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}>
                  ← Back
                </button>
                <button onClick={handleSubmit} disabled={loading}
                  style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px", textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "16px", flex: 1, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
                  {loading ? "Submitting…" : "Submit Event Inquiry"}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </main>
  );
}

export default function EventInquiryPage() {
  return (
    <Suspense fallback={null}>
      <EventInquiryPageInner />
    </Suspense>
  );
}
