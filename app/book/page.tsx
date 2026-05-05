"use client";
import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DayPicker } from "react-day-picker";
import type { DateRange, Matcher } from "react-day-picker";
import "react-day-picker/dist/style.css";
import OrayaLogoFull from "@/components/OrayaLogoFull";
import { getVillaBasePrice, getVillaPricing } from "@/lib/admin-pricing";
import { ADDON_OPERATIONAL_SETTINGS_KEY, formatPreparationTime, getAddonAppliesTo, getAddonEnforcementMode, getAddonTimingType, mergeAddonsWithOperationalSettings, parseAddonOperationalSetting, type AddonCategory, type AddonCutoffType, type AddonEnforcementMode, type AddonPricingType } from "@/lib/addon-operations";
import { usePublicPricing } from "@/lib/public-pricing";
import { calculateStayPricing } from "@/lib/pricing/engine";
import { applyBedroomFactorToNightlyRates, computeBedroomFactor } from "@/lib/pricing/intelligence";
import type { NightSource } from "@/lib/pricing/types";
import { formatBeirutMonthDay, getBeirutDay } from "@/lib/utils/date-beirut";
import { supabase } from "@/lib/supabase";
import { writeBookToEventHandoff } from "@/lib/event-inquiry-handoff";
import { AddonIcon } from "@/components/addon-icon";
import { SkeletonBlock, SkeletonText } from "@/components/LoadingSkeleton";

// ─── Brand constants ──────────────────────────────────────────────────────────
const GOLD     = "#C5A46D";
const WHITE    = "#FFFFFF";
const MIDNIGHT = "#1F2B38";
const CHARCOAL = "#2E2E2E";
const MUTED    = "#8a8070";
const SUCCESS  = "#6fcf8a";
const PLAYFAIR = "'Playfair Display', Georgia, serif";
const LATO     = "'Lato', system-ui, sans-serif";
/** Phase 12E Batch 5: discount applied to dead-gap extension offers (UI display only, not persisted). */
const DEAD_DAY_DISCOUNT_PCT = 0.30;

// ─── Static data ──────────────────────────────────────────────────────────────
const VILLAS   = ["Villa Mechmech", "Villa Byblos"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VILLA_CARD_META: Record<string, { image: string; imagePosition: string; note: string }> = {
  "Villa Mechmech": {
    image: "/logos/ORAYA_logo_full.png",
    imagePosition: "left center",
    note: "A quiet mountain retreat with generous outdoor living.",
  },
  "Villa Byblos": {
    image: "/logos/ORAYA_logo_full.png",
    imagePosition: "right center",
    note: "An elegant private villa designed for relaxed gatherings.",
  },
};

const COUNTRIES = [
  { label: "Saudi Arabia",   value: "Saudi Arabia" },
  { label: "UAE",            value: "UAE" },
  { label: "Qatar",          value: "Qatar" },
  { label: "Kuwait",         value: "Kuwait" },
  { label: "Bahrain",        value: "Bahrain" },
  { label: "Oman",           value: "Oman" },
  { label: "Lebanon",        value: "Lebanon" },
  { label: "France",         value: "France" },
  { label: "Australia",      value: "Australia" },
  { label: "United States",  value: "United States" },
  { label: "Canada",         value: "Canada" },
  { label: "United Kingdom", value: "United Kingdom" },
  { label: "Germany",        value: "Germany" },
  { label: "──────────────", value: "" },
  { label: "Algeria",        value: "Algeria" },
  { label: "Argentina",      value: "Argentina" },
  { label: "Austria",        value: "Austria" },
  { label: "Belgium",        value: "Belgium" },
  { label: "Brazil",         value: "Brazil" },
  { label: "China",          value: "China" },
  { label: "Cyprus",         value: "Cyprus" },
  { label: "Denmark",        value: "Denmark" },
  { label: "Egypt",          value: "Egypt" },
  { label: "Finland",        value: "Finland" },
  { label: "Greece",         value: "Greece" },
  { label: "India",          value: "India" },
  { label: "Indonesia",      value: "Indonesia" },
  { label: "Iraq",           value: "Iraq" },
  { label: "Ireland",        value: "Ireland" },
  { label: "Italy",          value: "Italy" },
  { label: "Japan",          value: "Japan" },
  { label: "Jordan",         value: "Jordan" },
  { label: "Malaysia",       value: "Malaysia" },
  { label: "Mexico",         value: "Mexico" },
  { label: "Morocco",        value: "Morocco" },
  { label: "Netherlands",    value: "Netherlands" },
  { label: "New Zealand",    value: "New Zealand" },
  { label: "Nigeria",        value: "Nigeria" },
  { label: "Norway",         value: "Norway" },
  { label: "Pakistan",       value: "Pakistan" },
  { label: "Palestine",      value: "Palestine" },
  { label: "Poland",         value: "Poland" },
  { label: "Portugal",       value: "Portugal" },
  { label: "Russia",         value: "Russia" },
  { label: "Senegal",        value: "Senegal" },
  { label: "South Africa",   value: "South Africa" },
  { label: "South Korea",    value: "South Korea" },
  { label: "Spain",          value: "Spain" },
  { label: "Sudan",          value: "Sudan" },
  { label: "Sweden",         value: "Sweden" },
  { label: "Switzerland",    value: "Switzerland" },
  { label: "Syria",          value: "Syria" },
  { label: "Tunisia",        value: "Tunisia" },
  { label: "Turkey",         value: "Turkey" },
  { label: "Ukraine",        value: "Ukraine" },
  { label: "Yemen",          value: "Yemen" },
];

const DIAL_CODES = [
  { flag: "🇱🇧", label: "Lebanon",        code: "+961" },
  { flag: "🇸🇦", label: "Saudi Arabia",   code: "+966" },
  { flag: "🇦🇪", label: "UAE",            code: "+971" },
  { flag: "🇫🇷", label: "France",         code: "+33"  },
  { flag: "🇺🇸", label: "United States",  code: "+1"   },
  { flag: "──",  label: "──────────────", code: ""     },
  { flag: "🇩🇿", label: "Algeria",        code: "+213" },
  { flag: "🇦🇷", label: "Argentina",      code: "+54"  },
  { flag: "🇦🇺", label: "Australia",      code: "+61"  },
  { flag: "🇦🇹", label: "Austria",        code: "+43"  },
  { flag: "🇧🇪", label: "Belgium",        code: "+32"  },
  { flag: "🇧🇷", label: "Brazil",         code: "+55"  },
  { flag: "🇨🇦", label: "Canada",         code: "+1"   },
  { flag: "🇨🇳", label: "China",          code: "+86"  },
  { flag: "🇨🇾", label: "Cyprus",         code: "+357" },
  { flag: "🇩🇰", label: "Denmark",        code: "+45"  },
  { flag: "🇪🇬", label: "Egypt",          code: "+20"  },
  { flag: "🇩🇪", label: "Germany",        code: "+49"  },
  { flag: "🇬🇷", label: "Greece",         code: "+30"  },
  { flag: "🇮🇳", label: "India",          code: "+91"  },
  { flag: "🇮🇶", label: "Iraq",           code: "+964" },
  { flag: "🇮🇪", label: "Ireland",        code: "+353" },
  { flag: "🇮🇹", label: "Italy",          code: "+39"  },
  { flag: "🇯🇴", label: "Jordan",         code: "+962" },
  { flag: "🇰🇼", label: "Kuwait",         code: "+965" },
  { flag: "🇲🇽", label: "Mexico",         code: "+52"  },
  { flag: "🇲🇦", label: "Morocco",        code: "+212" },
  { flag: "🇳🇱", label: "Netherlands",    code: "+31"  },
  { flag: "🇳🇿", label: "New Zealand",    code: "+64"  },
  { flag: "🇳🇬", label: "Nigeria",        code: "+234" },
  { flag: "🇳🇴", label: "Norway",         code: "+47"  },
  { flag: "🇴🇲", label: "Oman",           code: "+968" },
  { flag: "🇵🇰", label: "Pakistan",       code: "+92"  },
  { flag: "🇵🇸", label: "Palestine",      code: "+970" },
  { flag: "🇵🇱", label: "Poland",         code: "+48"  },
  { flag: "🇵🇹", label: "Portugal",       code: "+351" },
  { flag: "🇶🇦", label: "Qatar",          code: "+974" },
  { flag: "🇷🇺", label: "Russia",         code: "+7"   },
  { flag: "🇸🇳", label: "Senegal",        code: "+221" },
  { flag: "🇿🇦", label: "South Africa",   code: "+27"  },
  { flag: "🇪🇸", label: "Spain",          code: "+34"  },
  { flag: "🇸🇩", label: "Sudan",          code: "+249" },
  { flag: "🇸🇪", label: "Sweden",         code: "+46"  },
  { flag: "🇨🇭", label: "Switzerland",    code: "+41"  },
  { flag: "🇸🇾", label: "Syria",          code: "+963" },
  { flag: "🇹🇳", label: "Tunisia",        code: "+216" },
  { flag: "🇹🇷", label: "Turkey",         code: "+90"  },
  { flag: "🇬🇧", label: "United Kingdom", code: "+44"  },
  { flag: "🇾🇪", label: "Yemen",          code: "+967" },
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
  fontSize: "14px",
  letterSpacing: "0.4px",
  color: "rgba(255,255,255,0.82)",
  display: "block",
  marginBottom: "8px",
};

// ─── Types ────────────────────────────────────────────────────────────────────
type AuthStatus = "loading" | "member" | "none";
interface ConfirmedRange { check_in: string; check_out: string; }

interface Addon {
  id:            string;
  label:         string;
  enabled:       boolean;
  applies_to?:   "stay" | "event" | "both";
  currency:      string;
  price:         number | null;
  pricing_model: "flat_fee" | "per_night" | "per_person_per_day" | "per_unit";
  preparation_time_hours?: number | null;
  cutoff_type?: AddonCutoffType | null;
  requires_approval?: boolean;
  category?: AddonCategory | null;
  enforcement_mode?: AddonEnforcementMode | null;
  applicable_villas?: string[];
  description?: string;
  display_order?: number | null;
  recommended?: boolean;
  /** Phase 12E: "fixed" uses price field; "percentage" uses percentage_value × stay total. */
  pricing_type?: AddonPricingType;
  percentage_value?: number | null;
}

const PRICING_MODEL_LABELS: Record<string, string> = {
  flat_fee:            "Flat fee",
  per_night:           "Per night",
  per_person_per_day:  "Per person / day",
  per_unit:            "Per unit",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Local-date-aware ISO formatter — avoids UTC timezone shifts. */
function toISO(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dy}`;
}

/** Parse an ISO date string into a local Date (no UTC conversion). */
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

function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}

const NIGHT_DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

/** Engine emits YYYY-MM-DD and pricing now classifies weekends in Asia/Beirut. */
function fmtNightLabel(iso: string, includeDay: boolean): string {
  const base = formatBeirutMonthDay(iso);
  const dayIndex = getBeirutDay(iso);
  return includeDay && dayIndex >= 0 ? `${base} (${NIGHT_DAYS[dayIndex]})` : base;
}

function nightSourceLabel(source: NightSource): string {
  switch (source) {
    case "seasonal": return "Seasonal";
    case "weekend":  return "Weekend";
    case "weekday":  return "Weekday";
    case "base":     return "Base";
    case "unpriced": return "Not priced";
  }
}

function friendlyError(msg: string): string {
  if (msg.includes("row-level security") || msg.includes("policy") || msg.includes("42501"))
    return "Unable to submit booking. Please try again or contact us directly.";
  if (msg.includes("Invalid email address"))
    return "Please enter a valid email address so we can contact you about your booking.";
  if (msg.includes("check_in") || msg.includes("check_out"))
    return "Please review your check-in and check-out dates before submitting.";
  if (msg.includes("JWT") || msg.includes("auth"))
    return "Session error. Please refresh the page and try again.";
  if (msg.includes("unavailable"))
    return "Those dates are no longer available. Please choose different dates and try again.";
  return msg;
}

function isAddonApplicableToVilla(addon: Addon, villa: string): boolean {
  const applicableVillas = addon.applicable_villas ?? [];
  if (!villa) return true;
  if (applicableVillas.length === 0) return true;
  return applicableVillas.includes(villa);
}

/** Phase 13C Hotfix: identify the Extra Bedding add-on by case-insensitive label match. */
function isExtraBeddingAddon(addon: Pick<Addon, "label">): boolean {
  return addon.label?.trim().toLowerCase() === "extra bedding";
}

/** Phase 13C.4 correction: 7-8 sleeping guests force Extra Bedding (operationally required). */
const EXTRA_BEDDING_REQUIRED_GUESTS = 7;
const BEDROOM_DEFAULT_GUESTS = {
  "1": "2",
  "2": "4",
  "3": "6",
} as const;
const BEDROOM_CAPACITY = {
  "1": 2,
  "2": 4,
  "3": 6,
} as const;
const BEDROOM_CAPACITY_COPY = {
  "1": "Ideal for 1–2 guests",
  "2": "Ideal for 2–4 guests",
  "3": "Ideal for 3–6 guests",
} as const;

type BedroomCount = keyof typeof BEDROOM_DEFAULT_GUESTS;

function formatBedroomLabel(count: string) {
  return `${count} Bedroom${count === "1" ? "" : "s"}`;
}

function getSleepingSetupLabel(guestCount: number) {
  return guestCount > 6
    ? "Extra bedding / sofa setup required"
    : "Standard bedroom setup";
}

function normalizeAddonCategory(category: string | null | undefined): string {
  const value = category?.trim();
  if (!value) return "Other";

  const lower = value.toLowerCase();
  if (lower === "comfort") return "Comfort";
  if (lower === "experience") return "Experience";
  if (lower === "services" || lower === "service") return "Services";
  if (lower === "essentials") return "Essentials";
  if (lower === "logistics") return "Services";
  return value;
}

function sortAddonsForDisplay(addons: Addon[]): Addon[] {
  return addons
    .map((addon, index) => ({ addon, index }))
    .sort((a, b) => {
      const aOrder = typeof a.addon.display_order === "number" && Number.isFinite(a.addon.display_order)
        ? a.addon.display_order
        : null;
      const bOrder = typeof b.addon.display_order === "number" && Number.isFinite(b.addon.display_order)
        ? b.addon.display_order
        : null;

      if (aOrder !== null && bOrder !== null) {
        return aOrder - bOrder || a.index - b.index;
      }
      if (aOrder !== null) return -1;
      if (bOrder !== null) return 1;
      return a.index - b.index;
    })
    .map(({ addon }) => addon);
}

function getSameDayAddonWarning(
  addon: Addon,
  checkIn: string,
  checkOut: string,
  confirmedRanges: ConfirmedRange[],
): string {
  const timingType = getAddonTimingType(addon);
  if (!timingType) return "";

  if (timingType === "early_checkin" && checkIn && confirmedRanges.some((range) => range.check_out === checkIn)) {
    return "May not be available due to a same-day checkout.";
  }

  if (timingType === "late_checkout" && checkOut && confirmedRanges.some((range) => range.check_in === checkOut)) {
    return "May not be available due to a same-day check-in.";
  }

  return "";
}

/** Phase 12E Batch 4: detect dead-day monetization windows adjacent to the user's dates.
 *
 * A "dead day" is the 1-night gap between two confirmed bookings:
 *   · booking A ends Day X   (check_out = Day X)
 *   · booking B starts Day X+2  (check_in = Day X+2)
 *   · Day X+1 is free but cannot form a normal minimum-stay booking
 *
 * Two triggers:
 *   1. User's checkout = Day X  → dead day follows their stay → suggestLateCheckout
 *   2. User's check-in = Day X+1 → they're inside the gap     → both suggestions
 */
function detectDeadDaySuggestion(
  checkIn: string,
  checkOut: string,
  confirmedRanges: ConfirmedRange[],
): { suggestLateCheckout: boolean; suggestEarlyCheckin: boolean } {
  if (!checkIn && !checkOut) return { suggestLateCheckout: false, suggestEarlyCheckin: false };
  let suggestLateCheckout = false;
  let suggestEarlyCheckin  = false;

  for (const rangeA of confirmedRanges) {
    const checkoutMs     = parseLocalISO(rangeA.check_out).getTime();
    const nextBookingISO = toISO(new Date(checkoutMs + 2 * 86_400_000));
    // Is there any confirmed booking starting exactly 2 days after rangeA ends?
    const hasNextBooking = confirmedRanges.some((r) => r.check_in === nextBookingISO);
    if (!hasNextBooking) continue;

    // Dead gap confirmed: the day between checkout and the next booking is a dead day.
    const gapDayISO = toISO(new Date(checkoutMs + 86_400_000));

    // Trigger 1: user's checkout coincides with rangeA's checkout → dead day follows their stay.
    if (checkOut && checkOut === rangeA.check_out) {
      suggestLateCheckout = true;
    }
    // Trigger 2: user's check-in is the dead day itself → they're inside the gap.
    if (checkIn && checkIn === gapDayISO) {
      suggestEarlyCheckin  = true;
      suggestLateCheckout = true;
    }
  }

  return { suggestLateCheckout, suggestEarlyCheckin };
}

// ─── Calendar CSS (dark-theme overrides for react-day-picker) ─────────────────
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

  /* Caption (month/year) */
  .oraya-cal .rdp-caption_label {
    font-size: 11px;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    font-weight: 400;
    color: ${GOLD};
  }

  /* Day-of-week header row */
  .oraya-cal .rdp-head_cell {
    font-size: 9px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    font-weight: 400;
    color: ${MUTED};
  }

  /* Nav arrows */
  .oraya-cal .rdp-nav_button { color: ${GOLD}; }
  .oraya-cal .rdp-nav_button:hover { background-color: rgba(197,164,109,0.12); }

  /* Regular day */
  .oraya-cal .rdp-day { color: rgba(255,255,255,0.75); border-radius: 2px; }
  .oraya-cal .rdp-day:hover:not([disabled]):not(.rdp-day_selected):not(.rdp-day_range_middle) {
    background-color: rgba(197,164,109,0.2);
    color: ${GOLD};
  }

  /* Range endpoints */
  .oraya-cal .rdp-day_range_start,
  .oraya-cal .rdp-day_range_end {
    background-color: ${GOLD} !important;
    color: ${CHARCOAL} !important;
    font-weight: 700;
    border-radius: 2px !important;
  }

  /* Range middle */
  .oraya-cal .rdp-day_range_middle {
    background-color: rgba(197,164,109,0.15);
    color: rgba(255,255,255,0.8);
    border-radius: 0;
  }

  /* Disabled (past + booked) */
  .oraya-cal .rdp-day_disabled {
    color: rgba(255,255,255,0.2) !important;
    text-decoration: line-through;
    opacity: 0.5;
  }

  .oraya-cal .rdp-day_deadCheckIn:not(.rdp-day_selected):not(.rdp-day_range_middle):not(.rdp-day_range_start):not(.rdp-day_range_end) {
    color: rgba(255,255,255,0.28);
    text-decoration: line-through;
    cursor: not-allowed;
  }

  /* Outside (adjacent-month days) */
  .oraya-cal .rdp-day_outside { color: rgba(255,255,255,0.15); }

  /* Today highlight */
  .oraya-cal .rdp-day_today:not(.rdp-day_selected):not(.rdp-day_range_middle):not(.rdp-day_range_start):not(.rdp-day_range_end) {
    border: 1px solid rgba(197,164,109,0.4);
    color: ${GOLD};
  }

  /* Multi-month gap */
  .oraya-cal .rdp-months { gap: 24px; }

  /* Mobile: stack months */
  @media (max-width: 640px) {
    .oraya-cal .rdp-months { flex-direction: column; }
    .oraya-cal .rdp { --rdp-cell-size: 34px; }
  }

  /* Step transition */
  @keyframes stepFadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0);   }
  }
  .step-content { animation: stepFadeIn 0.25s ease forwards; }
`;

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepIndicator({ step }: { step: number }) {
  const labels = ["Villa & Dates", "Stay Setup", "Add-ons", "Review & Submit"];
  return (
    <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        {([1, 2, 3, 4] as const).map((s, i) => (
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
            {i < 3 && (
              <div style={{
                width: "52px", height: "0.5px",
                backgroundColor: step > s ? GOLD : "rgba(197,164,109,0.15)",
                transition: "background-color 0.2s",
              }} />
            )}
          </div>
        ))}
      </div>
      <p style={{ fontFamily: LATO, fontSize: "14px", letterSpacing: "0.7px", color: GOLD, marginTop: "10px", marginBottom: 0 }}>
        {labels[step - 1]}
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
function BookPageInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const pricing = usePublicPricing();

  // Auth
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [memberName, setMemberName] = useState("");
  const [guestMode, setGuestMode]   = useState(false);

  // Step
  const [step, setStep] = useState(1);

  // Form (persisted across steps)
  const [form, setForm] = useState({
    villa:          "",
    bedroomCount:   "1",
    sleepingGuests: "2",
    dayVisitors:    "0",
    message:        "",
  });
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  // Guest contact (shown on step 2 when guestMode)
  const [guest, setGuest] = useState({
    fullName:    "",
    email:       "",
    dialCode:    "+961",
    phoneNumber: "",
    country:     "Lebanon",
  });

  // Availability
  const [confirmedRanges, setConfirmedRanges] = useState<ConfirmedRange[]>([]);

  // Add-ons
  const [addons,         setAddons]         = useState<Addon[]>([]);
  const [addonsLoading,  setAddonsLoading]  = useState(false);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);

  // UI
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  // Phase 12E Batch 5: addon IDs that have had the dead-day discount applied (client-only, display only).
  const [appliedDiscounts, setAppliedDiscounts] = useState<string[]>([]);
  const [guestEstimateManuallyChanged, setGuestEstimateManuallyChanged] = useState(false);
  const [mechmechCover, setMechmechCover] = useState("");
  const [byblosCover, setByblosCover] = useState("");
  const [submissionFallbackComplete, setSubmissionFallbackComplete] = useState(false);

  // Pre-select villa from ?villa= query param
  useEffect(() => {
    const v = searchParams.get("villa");
    if (v && VILLAS.includes(v)) setForm(f => ({ ...f, villa: v }));
  }, [searchParams]);

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
    Promise.all([
      fetch("/api/media?villa=mechmech&limit=1").then((r) => r.json()),
      fetch("/api/media?villa=byblos&limit=1").then((r) => r.json()),
      fetch("/api/media?villa=general&limit=1").then((r) => r.json()),
    ])
      .then(([mechmech, byblos, general]) => {
        const firstUrl = (media: unknown): string => {
          if (!Array.isArray(media)) return "";
          const row = media.find((item) => {
            if (!item || typeof item !== "object") return false;
            const fileUrl = (item as { file_url?: unknown }).file_url;
            return typeof fileUrl === "string" && fileUrl.trim().length > 0;
          }) as { file_url?: string } | undefined;
          return typeof row?.file_url === "string" ? row.file_url : "";
        };

        const generalCover = firstUrl(general?.media);
        setMechmechCover(firstUrl(mechmech?.media) || generalCover);
        setByblosCover(firstUrl(byblos?.media) || generalCover);
      })
      .catch(() => {
        setMechmechCover("");
        setByblosCover("");
      });
  }, []);

  // Fetch enabled add-ons the first time the user reaches step 3
  useEffect(() => {
    if (step !== 3 || addons.length > 0) return;
    setAddonsLoading(true);
    Promise.all([
      fetch("/api/addons").then(r => r.json()),
      fetch(`/api/settings?key=${encodeURIComponent(ADDON_OPERATIONAL_SETTINGS_KEY)}`).then(r => r.json()),
    ])
      .then(([addonsData, addonSettingsData]) => {
        const addonRows = Array.isArray(addonsData.addons) ? addonsData.addons as Addon[] : [];
        const operationalSettings = parseAddonOperationalSetting(addonSettingsData.value);
        setAddons(
          mergeAddonsWithOperationalSettings(addonRows, operationalSettings).filter(
            (addon) =>
              addon.enabled &&
              ["stay", "both"].includes(getAddonAppliesTo(addon.applies_to)),
          ),
        );
      })
      .catch(() => setAddons([]))
      .finally(() => setAddonsLoading(false));
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload availability whenever villa changes; also clear the date selection
  useEffect(() => {
    setDateRange(undefined);
    if (!form.villa) { setConfirmedRanges([]); return; }
    fetch(`/api/bookings/availability?villa=${encodeURIComponent(form.villa)}`)
      .then(r => r.json())
      .then(d => setConfirmedRanges(Array.isArray(d.ranges) ? d.ranges : []))
      .catch(() => setConfirmedRanges([]));
  }, [form.villa]);

  // ── Derived values ────────────────────────────────────────────────────────
  const today = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

  /**
   * Blocked day ranges for the calendar.
   * We disable from check_in through (check_out - 1 day) inclusive so that
   * the check_out date itself remains selectable as a new check-in.
   */
  const bookedRangeList: Array<{ from: Date; to: Date }> = confirmedRanges.flatMap(r => {
    const from = parseLocalISO(r.check_in);
    const to   = parseLocalISO(r.check_out);
    to.setDate(to.getDate() - 1); // last occupied night, not checkout day
    if (to < from) return []; // single-night stay edge case handled
    return [{ from, to }];
  });

  /**
   * Dead check-in guard.
   * The -1 day logic above intentionally leaves each booking's check_out day
   * open so a new guest can check in on the same day a prior guest checks out.
   * However, if the very next night (or the first reachable checkout date given
   * the minimum stay) is already inside another blocked range, that boundary day
   * becomes a dead check-in — visually selectable but impossible to complete.
   * We detect these and add them to the disabled set.
   */
  function isCalendarDateBlocked(d: Date): boolean {
    if (d < today) return true;
    return bookedRangeList.some(r => d >= r.from && d <= r.to);
  }

  const minStayNights =
    (form.villa ? getVillaPricing(pricing, form.villa)?.minimum_stay : null) ?? 1;
  const effectiveMinStayNights = Math.max(1, minStayNights);

  function addLocalDays(day: Date, days: number): Date {
    const next = new Date(day.getTime());
    next.setDate(next.getDate() + days);
    return next;
  }

  function isStayRangeAvailable(checkInDay: Date, checkOutDay: Date): boolean {
    if (checkOutDay <= checkInDay) return false;

    for (let night = new Date(checkInDay.getTime()); night < checkOutDay; night.setDate(night.getDate() + 1)) {
      if (isCalendarDateBlocked(night)) return false;
    }

    return true;
  }

  function hasValidCheckoutFromCheckIn(checkInDay: Date): boolean {
    if (isCalendarDateBlocked(checkInDay)) return false;

    // Search up to one year for a checkout where every occupied night is open.
    for (let n = effectiveMinStayNights; n <= 366; n++) {
      const candidateCheckout = addLocalDays(checkInDay, n);
      if (!isCalendarDateBlocked(candidateCheckout) && isStayRangeAvailable(checkInDay, candidateCheckout)) {
        return true;
      }
    }

    return false;
  }

  function isDeadCheckInDate(day: Date): boolean {
    return !isCalendarDateBlocked(day) && !hasValidCheckoutFromCheckIn(day);
  }

  const isChoosingCheckout = Boolean(dateRange?.from && !dateRange.to);

  // A checkout date is valid only if every condition holds:
  // 1. checkout is strictly after check-in (minimum 1 night)
  // 2. checkout day itself is not in the middle of a blocked stay
  // 3. every night from check-in up to checkout-1 is free (continuous stay)
  function isValidCheckoutFrom(checkIn: Date, checkout: Date): boolean {
    if (checkout <= checkIn) return false;
    if (isCalendarDateBlocked(checkout)) return false;
    for (
      let night = new Date(checkIn.getTime());
      night < checkout;
      night.setDate(night.getDate() + 1)
    ) {
      if (isCalendarDateBlocked(night)) return false;
    }
    return true;
  }

  const disabledDays: Matcher[] = [
    { before: today },
    ...bookedRangeList,
    ...(isChoosingCheckout
      ? [(day: Date) => !isValidCheckoutFrom(dateRange!.from!, day)]
      : [isDeadCheckInDate]),
  ];

  const checkIn  = dateRange?.from ? toISO(dateRange.from) : "";
  const checkOut = dateRange?.to   ? toISO(dateRange.to)   : "";
  const nights   = nightCount(checkIn, checkOut);
  const sleepingGuestsCount = parseInt(form.sleepingGuests, 10) || 0;
  const selectedBedroomsCount = parseInt(form.bedroomCount, 10) || 3;
  const sleepingSetupLabel = getSleepingSetupLabel(sleepingGuestsCount);
  const bedroomCapacityWarning = (() => {
    if (form.bedroomCount === "1" && sleepingGuestsCount > 2) {
      return "This exceeds the standard 1-bedroom setup. Consider selecting more bedrooms.";
    }
    if (form.bedroomCount === "2" && sleepingGuestsCount > 4) {
      return "This exceeds the standard 2-bedroom setup. Consider selecting 3 bedrooms.";
    }
    if (form.bedroomCount === "3" && sleepingGuestsCount > 6) {
      return "Guests above 6 require extra bedding / sofa sleeping setup.";
    }
    return "";
  })();
  const nightlyBasePrice = form.villa ? getVillaBasePrice(form.villa, pricing) : null;
  const villaPricingConfig = form.villa ? getVillaPricing(pricing, form.villa) : null;
  const pricingResult = villaPricingConfig && checkIn && checkOut
    ? calculateStayPricing(
        {
          base_price:         villaPricingConfig.base_price,
          weekday_price:      villaPricingConfig.weekday_price,
          weekend_price:      villaPricingConfig.weekend_price,
          minimum_stay:       villaPricingConfig.minimum_stay,
          seasonal_overrides: villaPricingConfig.seasonal_overrides,
        },
        { check_in: checkIn, check_out: checkOut },
      )
    : null;
  const bedroomPricing = pricingResult
    ? applyBedroomFactorToNightlyRates(pricingResult.nightly, selectedBedroomsCount)
    : null;
  const fallbackBedroomFactor = computeBedroomFactor(selectedBedroomsCount);
  const staySubtotal = bedroomPricing?.adjustedSubtotal
    ?? (nightlyBasePrice !== null && nights > 0
      ? Math.round(nightlyBasePrice * fallbackBedroomFactor * nights)
      : null);

  /**
   * Phase 12E: resolve the effective price for a single add-on.
   * Percentage add-ons derive their price from the stay subtotal.
   * All other add-ons use the existing fixed-price logic.
   * Returns null when price cannot be determined (no base, no static price).
   */
  function computeAddonPrice(addon: Addon): number | null {
    if (
      addon.pricing_type === "percentage" &&
      typeof addon.percentage_value === "number" &&
      addon.percentage_value > 0
    ) {
      // Percentage: requires a computed stay subtotal
      if (staySubtotal === null) return null;
      return (addon.percentage_value / 100) * staySubtotal;
    }
    // Fixed (existing logic — unchanged)
    if (addon.price === null) return null;
    if (addon.pricing_model === "per_night") return addon.price * nights;
    if (addon.pricing_model === "per_person_per_day") return addon.price * sleepingGuestsCount * nights;
    return addon.price;
  }

  const stayApplicableAddons = addons.filter((addon) =>
    ["stay", "both"].includes(getAddonAppliesTo(addon.applies_to)),
  );
  const availableAddons = sortAddonsForDisplay(
    stayApplicableAddons.filter((addon) => isAddonApplicableToVilla(addon, form.villa))
  );
  const selectedAddonDetails = availableAddons.filter((addon) => selectedAddons.includes(addon.id));
  const selectedAddonSubtotal = selectedAddonDetails.reduce((sum, addon) => {
    const price = computeAddonPrice(addon);
    return price !== null ? sum + price : sum;
  }, 0);
  // Percentage add-ons without a base price (no dates yet) are excluded from the
  // "price on request" note — they are deterministic, just awaiting date selection.
  const selectedAddonQuoteCount = selectedAddonDetails.filter((addon) => {
    if (addon.pricing_type === "percentage") return false;
    return addon.price === null;
  }).length;
  const estimatedTotal = (staySubtotal ?? 0) + selectedAddonSubtotal;
  const guestEmail = guest.email.trim();
  const guestEmailInvalid = guestMode && guestEmail.length > 0 && !EMAIL_RE.test(guestEmail);
  const addonGroupMap = new Map<string, Addon[]>();
  for (const addon of availableAddons) {
    const category = normalizeAddonCategory(addon.category);
    const existing = addonGroupMap.get(category);
    if (existing) {
      existing.push(addon);
    } else {
      addonGroupMap.set(category, [addon]);
    }
  }
  const addonGroups = Array.from(addonGroupMap.entries()).map(([category, items]) => ({
    category,
    label: category,
    items,
  }));
  const showCategoryHeaders = addonGroups.length > 1 || addonGroups[0]?.category !== "Other";

  const dateConflict: string = (() => {
    if (!checkIn || !checkOut) return "";
    for (const r of confirmedRanges) {
      if (checkIn < r.check_out && checkOut > r.check_in)
        return `${form.villa} is already booked ${fmtDate(r.check_in)} – ${fmtDate(r.check_out)}. Please choose different dates.`;
    }
    return "";
  })();

  // Phase 12E Batch 4: dead-day suggestion (non-blocking, display only).
  const deadDaySuggestion = detectDeadDaySuggestion(checkIn, checkOut, confirmedRanges);

  function getAddonAvailability(addon: Addon) {
    const enforcementMode = getAddonEnforcementMode(addon.enforcement_mode);
    const preparationHours = addon.preparation_time_hours ?? null;
    if (enforcementMode === "none" || !preparationHours || preparationHours <= 0) {
      return {
        available: true,
        selectable: true,
        warning: "",
        mode: enforcementMode,
      };
    }

    if (!checkIn) {
      return {
        available: true,
        selectable: true,
        warning: "",
        mode: enforcementMode,
      };
    }

    const hoursUntilCheckIn = (parseLocalISO(checkIn).getTime() - Date.now()) / 3_600_000;
    const available = hoursUntilCheckIn >= preparationHours;
    if (available) {
      return {
        available: true,
        selectable: true,
        warning: "",
        mode: enforcementMode,
      };
    }

    if (enforcementMode === "strict") {
      return {
        available: false,
        selectable: false,
        warning: `Needs ${formatPreparationTime(preparationHours)} advance notice and is not available for your selected check-in.`,
        mode: enforcementMode,
      };
    }

    return {
      available: false,
      selectable: true,
      warning: `Short notice: subject to confirmation for your selected check-in.`,
      mode: enforcementMode,
    };
  }

  function getAddonOperationalFeedback(addon: Addon) {
    const messages: Array<{ tone: "neutral" | "warning"; text: string }> = [];
    const preparationHours = addon.preparation_time_hours ?? null;
    const enforcementMode = getAddonEnforcementMode(addon.enforcement_mode);
    const availability = getAddonAvailability(addon);
    const hasTimingRisk = preparationHours !== null && preparationHours > 0 && !availability.available;

    if (hasTimingRisk) {
      messages.push({
        tone: "warning",
        text: `${formatPreparationTime(preparationHours)} advance notice is preferred for this service.`,
      });
    }

    if (addon.requires_approval && hasTimingRisk) {
      messages.push({
        tone: "warning",
        text: "Subject to confirmation",
      });
    }

    if (enforcementMode === "strict" && hasTimingRisk) {
      messages.push({
        tone: "warning",
        text: "This add-on is only available when advance notice is satisfied",
      });
    } else if (enforcementMode === "soft" && hasTimingRisk) {
      messages.push({
        tone: "warning",
        text: "Booking request can continue, and our team will review availability",
      });
    }

    return messages;
  }

  /**
   * Phase 12E Batch 5: timing add-ons eligible for the dead-day discount offer.
   * Only populated when a dead-day gap is detected adjacent to the user's dates,
   * the add-on is available for the selected villa, is selectable, and has a
   * computable price. The discount is display-only — never sent to the server.
   */
  const deadDayOfferAddons = availableAddons.flatMap((addon) => {
    const tType = getAddonTimingType(addon);
    const isRelevant =
      (tType === "early_checkin" && deadDaySuggestion.suggestEarlyCheckin) ||
      (tType === "late_checkout"  && deadDaySuggestion.suggestLateCheckout);
    if (!isRelevant) return [];
    const avail = getAddonAvailability(addon);
    if (!avail.selectable) return [];
    const baseRaw = computeAddonPrice(addon);
    if (baseRaw === null) return [];
    const basePrice      = Math.round(baseRaw);
    const discountedPrice = Math.round(baseRaw * (1 - DEAD_DAY_DISCOUNT_PCT));
    const savings        = basePrice - discountedPrice;
    return [{ addon, basePrice, discountedPrice, savings }];
  });

  useEffect(() => {
    setSelectedAddons((prev) => prev.filter((id) => {
      const addon = stayApplicableAddons.find((item) => item.id === id);
      if (!addon) return false;
      if (!isAddonApplicableToVilla(addon, form.villa)) return false;
      const enforcementMode = getAddonEnforcementMode(addon.enforcement_mode);
      const preparationHours = addon.preparation_time_hours ?? null;
      if (
        enforcementMode !== "strict" ||
        !preparationHours ||
        preparationHours <= 0 ||
        !checkIn
      ) {
        return true;
      }

      const hoursUntilCheckIn = (parseLocalISO(checkIn).getTime() - Date.now()) / 3_600_000;
      return hoursUntilCheckIn >= preparationHours;
    }));
  }, [checkIn, form.villa, stayApplicableAddons]);

  // Clear applied discounts whenever dates change — the discount amount is date-dependent.
  useEffect(() => { setAppliedDiscounts([]); }, [dateRange]);


  // Phase 13C.4 correction: auto-select Extra Bedding when sleeping guests exceeds 6.
  // Idempotent — prev.includes guard prevents re-renders. Respects existing strict/availability blocks.
  useEffect(() => {
    if (sleepingGuestsCount < EXTRA_BEDDING_REQUIRED_GUESTS) return;
    const ebAddon = availableAddons.find(isExtraBeddingAddon);
    if (!ebAddon) return;
    const ebAvailability = getAddonAvailability(ebAddon);
    if (!ebAvailability.selectable) return;
    setSelectedAddons(prev => prev.includes(ebAddon.id) ? prev : [...prev, ebAddon.id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleepingGuestsCount, availableAddons, form.villa, checkIn]);

  // ── Event handlers ────────────────────────────────────────────────────────
  function handleFormChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (name === "sleepingGuests") setGuestEstimateManuallyChanged(true);
  }

  function handleGuestChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) { setGuest(g => ({ ...g, [e.target.name]: e.target.value })); }

  function handleVillaSelect(villa: string) {
    setForm(f => ({ ...f, villa }));
    setError("");
  }

  function handleBedroomSelect(bedroomCount: BedroomCount) {
    setForm((current) => ({
      ...current,
      bedroomCount,
      sleepingGuests: guestEstimateManuallyChanged ? current.sleepingGuests : BEDROOM_DEFAULT_GUESTS[bedroomCount],
    }));
    setError("");
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

    if (startsNewRange && !hasValidCheckoutFromCheckIn(selectedDay)) {
      setDateRange(undefined);
      setError("Please choose a check-in date with at least one available check-out.");
      return;
    }

    if (nextRange?.from && nextRange.to && !isValidCheckoutFrom(nextRange.from, nextRange.to)) {
      setDateRange(undefined);
      setError("Those dates are not available as a continuous stay. Please choose your dates again.");
      return;
    }

    setError("");
    setDateRange(nextRange);
  }

  function goNext() {
    setError("");
    if (step === 1) {
      if (!form.villa)         { setError("Please select a villa before continuing.");                          return; }
      if (!checkIn)            { setError("Please select your check-in and check-out dates to continue.");     return; }
      if (!checkOut)           { setError("Please select a check-out date to complete your stay details.");    return; }
      if (checkOut <= checkIn) { setError("Your check-out date must be after your check-in date.");            return; }
      if (dateConflict)        { setError(dateConflict);                                                        return; }
    }
    if (step === 2) {
      if (!form.bedroomCount)                  { setError("Please select how many bedrooms you would like prepared."); return; }
      if (guestMode && !guest.fullName.trim()) { setError("Please enter your full name so we know who the booking request is for."); return; }
      if (guestMode && !guestEmail)            { setError("Please enter your email address so we can contact you about your booking."); return; }
      if (guestMode && !EMAIL_RE.test(guestEmail)) { setError("Please enter a valid email address so we can contact you about your booking."); return; }
      const sleeping = parseInt(form.sleepingGuests, 10);
      if (!sleeping || sleeping < 1)           { setError("Please enter at least 1 estimated guest before continuing."); return; }
    }
    setStep(s => s + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleAddon(id: string) {
    const addon = availableAddons.find((item) => item.id === id);
    if (!addon) return;
    const availability = getAddonAvailability(addon);
    if (!availability.selectable) return;
    // Phase 13C.4 correction: prevent deselection of Extra Bedding when 7-8 sleeping guests require it.
    if (
      sleepingGuestsCount >= EXTRA_BEDDING_REQUIRED_GUESTS &&
      isExtraBeddingAddon(addon) &&
      selectedAddons.includes(id)
    ) return;
    setSelectedAddons(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  /** Phase 12E Batch 5: select a timing add-on and mark it as discount-applied (display only). */
  function applyDeadDayOffer(addonId: string) {
    setSelectedAddons(prev => prev.includes(addonId) ? prev : [...prev, addonId]);
    setAppliedDiscounts(prev => prev.includes(addonId) ? prev : [...prev, addonId]);
  }

  function goBack() {
    setError("");
    setStep(s => s - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit() {
    setError("");
    setLoading(true);
    try {
      if (guestMode && !EMAIL_RE.test(guestEmail)) {
        throw new Error("Invalid email address.");
      }

      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr) console.error("[book] auth.getUser error:", authErr);

      let accessToken: string | null = null;
      if (user) {
        const { data: { session } } = await supabase.auth.getSession();
        accessToken = session?.access_token ?? null;
      }

      // Build structured addons payload.
      // Phase 12E Batch 6: include discounted_price when a dead-day offer was applied so the
      // server can persist the correct price in addons_snapshot. The field is omitted (not null)
      // for non-discounted add-ons to keep the payload backward-compatible.
      const selectedAddonObjects = selectedAddons
        .map(id => availableAddons.find(a => a.id === id))
        .filter((a): a is Addon => Boolean(a))
        .map(({ id, label, pricing_model, currency, price }) => {
          const offer = appliedDiscounts.includes(id)
            ? deadDayOfferAddons.find(o => o.addon.id === id)
            : undefined;
          return {
            id,
            label,
            pricing_model,
            currency,
            price,
            ...(offer !== undefined ? { discounted_price: offer.discountedPrice } : {}),
          };
        });

      const composedMessage = (() => {
        const userNotes = (form.message ?? "").replace(/\n*\[Stay Setup][\s\S]*$/, "").trim();
        return [
          "[Stay Setup]",
          `Bedrooms to be used: ${formatBedroomLabel(form.bedroomCount)}`,
          `Estimated guests: ${form.sleepingGuests}`,
          `Sleeping setup: ${sleepingSetupLabel}`,
          `Guest Notes: ${userNotes || "None"}`,
        ].join("\n");
      })();

      const body: Record<string, unknown> = {
        villa:           form.villa,
        check_in:        checkIn,
        check_out:       checkOut,
        sleeping_guests: form.sleepingGuests,
        day_visitors:    form.dayVisitors,
        message:         composedMessage,
        addons:          selectedAddonObjects,
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
      if (!res.ok) throw new Error(json.error ?? "Failed to submit booking.");

      const booking = json.booking;
      const bookingToken =
        (typeof json?.token === "string" && json.token.trim()) ||
        (typeof booking?.token === "string" && booking.token.trim()) ||
        (typeof booking?.view_token === "string" && booking.view_token.trim()) ||
        "";
      if (bookingToken) {
        router.push(`/booking/view/${encodeURIComponent(bookingToken)}`);
        return;
      }
      setSubmissionFallbackComplete(false);
      setError("Booking was created but redirect token was missing. Please retry or contact support.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      console.error("[book] submission error:", err);
      setError(friendlyError(msg));
    } finally {
      setLoading(false);
    }
  }

  // ── Auth loading spinner ──────────────────────────────────────────────────
  if (authStatus === "loading") {
    return (
      <main style={{ backgroundColor: MIDNIGHT, minHeight: "100vh", padding: "80px 24px" }}>
        <div style={{ width: "100%", maxWidth: "720px", margin: "0 auto" }} aria-hidden="true">
          <div style={{ width: "160px", margin: "0 auto 2.5rem", opacity: 0.45 }}>
            <OrayaLogoFull />
          </div>
          <div style={{ textAlign: "center", marginBottom: "2rem", display: "grid", justifyItems: "center", gap: "12px" }}>
            <SkeletonText width="120px" height="10px" />
            <SkeletonBlock width="260px" height="38px" />
            <SkeletonText width="340px" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "14px", marginBottom: "24px" }}>
            {[0, 1].map((item) => (
              <div key={item} style={{ border: "0.5px solid rgba(197,164,109,0.18)", backgroundColor: "rgba(255,255,255,0.02)" }}>
                <SkeletonBlock height="132px" />
                <div style={{ padding: "16px" }}>
                  <SkeletonText width="68%" height="20px" style={{ marginBottom: "12px" }} />
                  <SkeletonText width="92%" style={{ marginBottom: "8px" }} />
                  <SkeletonText width="76%" />
                </div>
              </div>
            ))}
          </div>
          <SkeletonBlock height="360px" style={{ border: "0.5px solid rgba(197,164,109,0.12)" }} />
        </div>
      </main>
    );
  }

  // ── Auth gate (not member, not yet chosen guest) ──────────────────────────
  // Phase 13C.2: simplified stay pricing panel — Estimated Booking Total prominent, then small detail lines.
  const estimatePanel = checkIn && checkOut && staySubtotal !== null ? (
    <div style={{ border: "0.5px solid rgba(197,164,109,0.2)", backgroundColor: "rgba(197,164,109,0.04)", padding: "1.25rem" }}>
      <p style={{ fontFamily: LATO, fontSize: "13px", letterSpacing: "1px", color: GOLD, margin: "0 0 8px" }}>
        Estimated booking total
      </p>
      <p style={{ fontFamily: PLAYFAIR, fontSize: "26px", color: GOLD, margin: "0 0 14px", lineHeight: 1.2 }}>
        {formatUsd(estimatedTotal)}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
          <span style={{ fontFamily: LATO, fontSize: "14px", color: "rgba(255,255,255,0.8)" }}>Duration</span>
          <span style={{ fontFamily: LATO, fontSize: "14px", color: "rgba(255,255,255,0.82)", textAlign: "right" }}>
            {nights} {nights === 1 ? "night" : "nights"}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
          <span style={{ fontFamily: LATO, fontSize: "14px", color: "rgba(255,255,255,0.8)" }}>Selected add-ons</span>
          <span style={{ fontFamily: LATO, fontSize: "14px", color: "rgba(255,255,255,0.82)", textAlign: "right" }}>
            {formatUsd(selectedAddonSubtotal)}
          </span>
        </div>
      </div>
      <p style={{ fontFamily: LATO, fontSize: "14px", color: "rgba(255,255,255,0.78)", margin: "14px 0 0", lineHeight: 1.65 }}>
        This total is based on your selected dates, bedroom setup, and add-ons. Final confirmation is handled by Oraya.
      </p>
      <p style={{ fontFamily: LATO, fontSize: "14px", color: "rgba(255,255,255,0.68)", margin: "10px 0 0", lineHeight: 1.6, letterSpacing: "0.01em" }}>
        Each booking is manually reviewed to ensure availability and preparation quality.
      </p>
      {selectedAddonQuoteCount > 0 && (
        <p style={{ fontFamily: LATO, fontSize: "14px", color: "rgba(255,255,255,0.76)", margin: "10px 0 0", lineHeight: 1.65 }}>
          {selectedAddonQuoteCount} selected add-on{selectedAddonQuoteCount === 1 ? "" : "s"} with price on request are excluded from this estimate.
        </p>
      )}
      {pricingResult?.warnings.map((warning, i) => {
        const message =
          warning.kind === "minimum_stay"
            ? `Minimum stay is ${warning.required} ${warning.required === 1 ? "night" : "nights"}. Your current selection is ${warning.actual} ${warning.actual === 1 ? "night" : "nights"}; Oraya will confirm whether it can be accommodated.`
            : warning.kind === "unpriced_nights"
              ? `${warning.count} ${warning.count === 1 ? "night has" : "nights have"} no nightly rate configured and ${warning.count === 1 ? "is" : "are"} excluded from this estimate.`
              : null;
        if (!message) return null;
        return (
          <p
            key={`${warning.kind}-${i}`}
            style={{ fontFamily: LATO, fontSize: "14px", color: "#e0b070", margin: "10px 0 0", lineHeight: 1.65 }}
          >
            {message}
          </p>
        );
      })}
    </div>
  ) : null;

  if (authStatus === "none" && !guestMode) {
    return (
      <main style={{ backgroundColor: MIDNIGHT, minHeight: "100vh", padding: "80px 24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: "520px" }}>
          <a href="/" style={{ display: "block", width: "160px", margin: "0 auto 2.5rem", cursor: "pointer" }}>
            <OrayaLogoFull />
          </a>
          <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
            <p style={{ fontFamily: LATO, fontSize: "13px", letterSpacing: "1.2px", color: GOLD, marginBottom: "12px" }}>
              Reservations
            </p>
            <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2rem", fontWeight: 400, color: WHITE, margin: "0 0 12px" }}>
              Request a booking
            </h1>
            <p style={{ fontFamily: LATO, fontSize: "15px", color: "rgba(255,255,255,0.82)", lineHeight: 1.75, margin: "0 0 1rem" }}>
              Sign in for member benefits, or continue as guest.
            </p>
            <p style={{ fontFamily: LATO, fontSize: "14px", color: "rgba(255,255,255,0.72)", lineHeight: 1.7, margin: 0, maxWidth: "520px", marginLeft: "auto", marginRight: "auto" }}>
              Booking on this site is direct with Oraya — not instant self-checkout. Every request is reviewed before confirmation; payment is requested only after that review. For help,{" "}
              <a href="mailto:hello@stayoraya.com" style={{ color: GOLD, textDecoration: "none" }}>hello@stayoraya.com</a>.
            </p>
          </div>
          <div style={{ border: "0.5px solid rgba(197,164,109,0.3)", backgroundColor: "rgba(197,164,109,0.05)", padding: "2rem", display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
            <a
              href="/login?redirect=/book"
              style={{ fontFamily: LATO, fontSize: "14px", letterSpacing: "0.8px", color: CHARCOAL, backgroundColor: GOLD, padding: "14px 34px", textDecoration: "none", display: "inline-block" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}
            >
              Sign In
            </a>
            <button
              onClick={() => setGuestMode(true)}
              style={{ fontFamily: LATO, fontSize: "14px", letterSpacing: "0.8px", color: GOLD, backgroundColor: "transparent", border: "0.5px solid rgba(197,164,109,0.4)", padding: "14px 34px", cursor: "pointer" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = GOLD; (e.currentTarget as HTMLElement).style.color = WHITE; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(197,164,109,0.4)"; (e.currentTarget as HTMLElement).style.color = GOLD; }}
            >
              Continue as Guest
            </button>
          </div>
          <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, textAlign: "center", marginTop: "2rem" }}>
            Already a member?{" "}
            <a href="/login?redirect=/book" style={{ color: GOLD, textDecoration: "none" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.textDecoration = "underline"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.textDecoration = "none"; }}>
              Sign in
            </a>
            {" "}for member benefits.
          </p>
        </div>
      </main>
    );
  }

  // ── Multi-step form ───────────────────────────────────────────────────────
  // Step 1 gets a wider container to accommodate the 2-month calendar
  const containerWidth = step === 1 ? "720px" : "560px";

  return (
    <main style={{ backgroundColor: MIDNIGHT, minHeight: "100vh", padding: "80px 24px" }}>
      <style>{CALENDAR_CSS}</style>

      <div style={{ width: "100%", maxWidth: containerWidth, margin: "0 auto", transition: "max-width 0.3s ease" }}>

        <a href="/" style={{ display: "block", width: "160px", margin: "0 auto 2.5rem", cursor: "pointer" }}>
          <OrayaLogoFull />
        </a>

        {step !== 1 && (
          <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
            <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2rem", fontWeight: 400, color: WHITE, margin: 0 }}>
              Request a booking
            </h1>
          </div>
        )}

        {/* Step indicator */}
        <StepIndicator step={step} />

        {/* Step content — keyed so the fade animation re-fires on each step change */}
        <div key={step} className="step-content">

          {/* ════════════════════════════════════════════════════════════════
              STEP 1 — Villa & Dates
          ════════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

              {/* Villa selector */}
              <div>
                <p style={{ ...labelStyle, marginBottom: "14px" }}>Choose your villa</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "14px" }}>
                  {VILLAS.map((villa) => {
                    const selected = form.villa === villa;
                    const meta = VILLA_CARD_META[villa];
                    const coverImage =
                      villa === "Villa Mechmech"
                        ? (mechmechCover || meta.image)
                        : (byblosCover || meta.image);
                    const startingPrice = getVillaBasePrice(villa, pricing);
                    return (
                      <button
                        key={villa}
                        type="button"
                        onClick={() => handleVillaSelect(villa)}
                        aria-pressed={selected}
                        style={{
                          padding: 0,
                          overflow: "hidden",
                          textAlign: "left",
                          border: `0.5px solid ${selected ? GOLD : "rgba(197,164,109,0.18)"}`,
                          backgroundColor: selected ? "rgba(197,164,109,0.08)" : "rgba(255,255,255,0.02)",
                          cursor: "pointer",
                          transition: "border-color 0.15s, background-color 0.15s, transform 0.15s",
                        }}
                      >
                        <div
                          style={{
                            height: "132px",
                            position: "relative",
                            overflow: "hidden",
                            borderBottom: "0.5px solid rgba(197,164,109,0.12)",
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={coverImage}
                            alt={villa}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              objectPosition: meta.imagePosition,
                              display: "block",
                            }}
                          />
                          <div
                            style={{
                              position: "absolute",
                              inset: 0,
                              background: "linear-gradient(180deg, rgba(31,43,56,0.12), rgba(31,43,56,0.45))",
                              pointerEvents: "none",
                            }}
                          />
                        </div>
                        <div style={{ padding: "16px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                            <h2 style={{ fontFamily: PLAYFAIR, fontSize: "20px", fontWeight: 400, color: WHITE, margin: 0 }}>
                              {villa}
                            </h2>
                            <span
                              style={{
                                width: "18px",
                                height: "18px",
                                border: `1px solid ${selected ? GOLD : "rgba(197,164,109,0.35)"}`,
                                backgroundColor: selected ? GOLD : "transparent",
                                color: CHARCOAL,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                                fontFamily: LATO,
                                fontSize: "11px",
                                fontWeight: 700,
                              }}
                            >
                              {selected ? "✓" : ""}
                            </span>
                          </div>
                          <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, lineHeight: 1.6, margin: 0 }}>
                            {meta.note}
                          </p>
                          {startingPrice !== null && (
                            <p style={{ fontFamily: LATO, fontSize: "14px", color: "rgba(255,255,255,0.8)", margin: "8px 0 0", lineHeight: 1.5 }}>
                              Starting from {formatUsd(startingPrice)} / night · 1 bedroom
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Calendar — only shown once a villa is selected */}
              {form.villa ? (
                <div>
                  <p style={{ ...labelStyle, marginBottom: "14px" }}>Select dates</p>
                  <div style={{ border: "0.5px solid rgba(197,164,109,0.12)", backgroundColor: "rgba(255,255,255,0.01)", padding: "1.25rem" }}>
                    <div className="oraya-cal">
                      <DayPicker
                        mode="range"
                        selected={dateRange}
                        onSelect={handleDateSelect}
                        disabled={disabledDays}
                        modifiers={{ deadCheckIn: isChoosingCheckout ? () => false : isDeadCheckInDate }}
                        numberOfMonths={2}
                        fromDate={today}
                        showOutsideDays
                      />
                    </div>
                  </div>

                  {/* Selected-dates summary strip */}
                  {checkIn && (
                    <div style={{ marginTop: "14px", padding: "14px 20px", border: "0.5px solid rgba(197,164,109,0.2)", backgroundColor: "rgba(197,164,109,0.04)", display: "flex", flexWrap: "wrap", gap: "28px" }}>
                      <div>
                        <p style={{ fontFamily: LATO, fontSize: "13px", letterSpacing: "0.6px", color: "rgba(255,255,255,0.76)", margin: "0 0 6px" }}>Check-in</p>
                        <p style={{ fontFamily: LATO, fontSize: "14px", color: WHITE, margin: 0 }}>{fmtDate(checkIn)}</p>
                      </div>
                      {checkOut ? (
                        <>
                          <div>
                            <p style={{ fontFamily: LATO, fontSize: "13px", letterSpacing: "0.6px", color: "rgba(255,255,255,0.76)", margin: "0 0 6px" }}>Check-out</p>
                            <p style={{ fontFamily: LATO, fontSize: "14px", color: WHITE, margin: 0 }}>{fmtDate(checkOut)}</p>
                          </div>
                          <div>
                            <p style={{ fontFamily: LATO, fontSize: "13px", letterSpacing: "0.6px", color: "rgba(255,255,255,0.76)", margin: "0 0 6px" }}>Duration</p>
                            <p style={{ fontFamily: LATO, fontSize: "14px", color: GOLD, margin: 0 }}>
                              {nights} {nights === 1 ? "night" : "nights"}
                            </p>
                          </div>
                        </>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <p style={{ fontFamily: LATO, fontSize: "14px", color: "rgba(255,255,255,0.78)", margin: 0 }}>Now select a check-out date</p>
                        </div>
                      )}
                    </div>
                  )}

                  {estimatePanel && (
                    <div style={{ marginTop: "14px" }}>
                      {estimatePanel}
                      <p style={{ fontFamily: LATO, fontSize: "14px", color: "rgba(255,255,255,0.76)", margin: "10px 0 0", lineHeight: 1.65 }}>
                        Rates vary by selected dates, season, and bedroom setup.
                      </p>
                    </div>
                  )}

                  {/* Conflict warning */}
                  {dateConflict && (
                    <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", marginTop: "12px", lineHeight: 1.6 }}>
                      ⚠ {dateConflict}
                    </p>
                  )}
                </div>
              ) : (
                <div style={{ border: "0.5px dashed rgba(197,164,109,0.15)", padding: "3rem", textAlign: "center" }}>
                  <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0, letterSpacing: "0.5px" }}>
                    Select a villa above to view availability
                  </p>
                </div>
              )}

              {error && (
                <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", textAlign: "center", lineHeight: 1.6, margin: 0 }}>
                  {error}
                </p>
              )}

              <button
                onClick={goNext}
                style={{ fontFamily: LATO, fontSize: "14px", letterSpacing: "0.8px", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "16px", cursor: "pointer" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}
              >
                Continue →
              </button>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 2 — Stay Details
          ════════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

              {/* Guest contact fields (only when not a member) */}
              {guestMode && (
                <div style={{ order: 6, border: "0.5px solid rgba(197,164,109,0.2)", backgroundColor: "rgba(255,255,255,0.02)", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "16px" }}>
                  <p style={{ fontFamily: LATO, fontSize: "13px", letterSpacing: "1px", color: GOLD, margin: 0 }}>
                    Your details
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
                      style={{
                        ...inputStyle,
                        borderColor: guestEmailInvalid ? "#e07070" : "rgba(197,164,109,0.25)",
                      }}
                      onFocus={focusGold} onBlur={blurGold} />
                    {guestEmailInvalid && (
                    <p style={{ fontFamily: LATO, fontSize: "14px", color: "#e07070", marginTop: "8px", lineHeight: 1.6 }}>
                        Please enter a valid email address so we can contact you about your booking.
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
                        {DIAL_CODES.map((d, i) =>
                          d.code === "" ? (
                            <option key={`div-${i}`} disabled value="" style={{ backgroundColor: MIDNIGHT, color: MUTED }}>{d.label}</option>
                          ) : (
                            <option key={`${d.code}-${d.label}`} value={d.code} style={{ backgroundColor: MIDNIGHT }}>{d.flag} {d.code}</option>
                          )
                        )}
                      </select>
                      <input name="phoneNumber" type="tel" value={guest.phoneNumber} onChange={handleGuestChange}
                        placeholder="70 000 000" style={{ ...inputStyle, flex: 1 }} onFocus={focusGold} onBlur={blurGold} />
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Country</label>
                    <select name="country" value={guest.country} onChange={handleGuestChange}
                      onFocus={focusGold} onBlur={blurGold} style={{ ...inputStyle, cursor: "pointer" }}>
                      {COUNTRIES.map((c, i) =>
                        c.value === "" ? (
                          <option key={`div-${i}`} disabled value="" style={{ backgroundColor: MIDNIGHT, color: MUTED }}>{c.label}</option>
                        ) : (
                          <option key={c.value} value={c.value} style={{ backgroundColor: MIDNIGHT }}>{c.label}</option>
                        )
                      )}
                    </select>
                  </div>
                </div>
              )}

              {/* Bedroom-based stay setup */}
              <div style={{ order: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label style={labelStyle}>Bedrooms to be used</label>
                  <p style={{ fontFamily: LATO, fontSize: "14px", color: "rgba(255,255,255,0.78)", margin: "0 0 14px", lineHeight: 1.65 }}>
                    Select how many bedrooms you would like prepared. Guests above bedroom capacity may require extra bedding or sofa setup.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
                    {(["1", "2", "3"] as BedroomCount[]).map((bedroomCount) => {
                      const selected = form.bedroomCount === bedroomCount;
                      return (
                        <button
                          key={bedroomCount}
                          type="button"
                          onClick={() => handleBedroomSelect(bedroomCount)}
                          style={{
                            border: `0.5px solid ${selected ? GOLD : "rgba(197,164,109,0.2)"}`,
                            backgroundColor: selected ? "rgba(197,164,109,0.08)" : "rgba(255,255,255,0.02)",
                            padding: "14px 12px",
                            cursor: "pointer",
                            textAlign: "center",
                            transition: "border-color 0.15s, background-color 0.15s",
                          }}
                          onMouseEnter={e => {
                            if (!selected) {
                              (e.currentTarget as HTMLElement).style.borderColor = "rgba(197,164,109,0.38)";
                              (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(197,164,109,0.04)";
                            }
                          }}
                          onMouseLeave={e => {
                            if (!selected) {
                              (e.currentTarget as HTMLElement).style.borderColor = "rgba(197,164,109,0.2)";
                              (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.02)";
                            }
                          }}
                        >
                          <span style={{ fontFamily: PLAYFAIR, fontSize: "16px", color: selected ? GOLD : WHITE, display: "block", marginBottom: "4px" }}>
                            {formatBedroomLabel(bedroomCount)}
                          </span>
                          <span style={{ fontFamily: LATO, fontSize: "13px", color: "rgba(255,255,255,0.76)", letterSpacing: "0.2px" }}>
                            {BEDROOM_CAPACITY_COPY[bedroomCount]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p style={{ fontFamily: LATO, fontSize: "14px", color: "rgba(255,255,255,0.76)", margin: "12px 0 0", lineHeight: 1.65 }}>
                    Bedroom setup affects the stay estimate. Add-ons are calculated separately.
                  </p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <div>
                    <label style={labelStyle}>Estimated number of guests</label>
                    <input name="sleepingGuests" type="number" required min={1} max={8}
                      value={form.sleepingGuests} onChange={handleFormChange}
                      onFocus={focusGold} onBlur={blurGold} style={inputStyle} />
                    <p style={{ fontFamily: LATO, fontSize: "14px", color: "rgba(255,255,255,0.76)", marginTop: "8px", lineHeight: 1.6 }}>
                      Optional - this helps us prepare the stay, but bedroom usage is the primary setup preference.
                    </p>
                    {bedroomCapacityWarning && (
                      <p style={{ fontFamily: LATO, fontSize: "14px", color: "#e2ab5a", marginTop: "8px", lineHeight: 1.6 }}>
                        {bedroomCapacityWarning}
                      </p>
                  )}
                  {sleepingGuestsCount >= EXTRA_BEDDING_REQUIRED_GUESTS && (
                    <p style={{ fontFamily: LATO, fontSize: "14px", color: GOLD, marginTop: "8px", lineHeight: 1.6 }}>
                      7–8 guests require extra bedding / sofa setup.
                    </p>
                  )}
                  </div>
                  <div>
                    <label style={labelStyle}>Expected day visitors</label>
                    <input name="dayVisitors" type="number" required min={0} max={25}
                      value={form.dayVisitors} onChange={handleFormChange}
                      onFocus={focusGold} onBlur={blurGold} style={inputStyle} />
                  </div>
                </div>
              </div>

              {/* Premium stay-to-event upgrade CTA — routes to /events/inquiry */}
              <div style={{ order: 7, border: "0.5px solid rgba(197,164,109,0.26)", backgroundColor: "rgba(255,255,255,0.03)", padding: "18px 20px", display: "flex", flexDirection: "column", gap: "10px", boxShadow: "inset 0 0 0 1px rgba(197,164,109,0.04)" }}>
                <p style={{ fontFamily: LATO, fontSize: "13px", letterSpacing: "1px", color: GOLD, margin: 0 }}>
                  Hosted Experiences
                </p>
                <p style={{ fontFamily: PLAYFAIR, fontSize: "16px", fontWeight: 400, color: WHITE, margin: "0 0 6px" }}>
                  Planning something more than a stay?
                </p>
                <p style={{ fontFamily: LATO, fontSize: "14px", color: "rgba(255,255,255,0.8)", margin: "0 0 14px", lineHeight: 1.65 }}>
                  Turn your villa booking into a fully hosted experience - celebrations, private gatherings, and curated event services.
                </p>
                <p style={{ fontFamily: LATO, fontSize: "14px", color: "rgba(255,255,255,0.72)", margin: "0", lineHeight: 1.6 }}>
                  Event inquiries are reviewed separately and confirmed by Oraya.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (form.villa && checkIn && checkOut) {
                      const lock = writeBookToEventHandoff({
                        villa: form.villa,
                        check_in: checkIn,
                        check_out: checkOut,
                        sleeping_guests: form.sleepingGuests,
                        day_visitors: form.dayVisitors,
                        ...(guestMode
                          ? {
                              guest: {
                                fullName: guest.fullName,
                                email: guest.email,
                                dialCode: guest.dialCode,
                                phoneNumber: guest.phoneNumber,
                                country: guest.country,
                              },
                            }
                          : {}),
                      });
                      if (lock) {
                        router.push(`/events/inquiry?prefill=book&hl=${encodeURIComponent(lock)}`);
                        return;
                      }
                    }
                    router.push("/events/inquiry");
                  }}
                  style={{ alignSelf: "flex-start", fontFamily: LATO, fontSize: "14px", letterSpacing: "0.8px", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "12px 24px", cursor: "pointer" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}
                >
                  Plan your event
                </button>
              </div>

              <div style={{ order: 2 }}>
                {estimatePanel}
              </div>

              {/* Notes */}
              <div style={{ order: 3 }}>
                <label style={labelStyle}>
                  Special requests{" "}
                  <span style={{ color: "rgba(138,128,112,0.5)", letterSpacing: 0 }}>(optional)</span>
                </label>
                <textarea name="message" value={form.message} onChange={handleFormChange}
                  onFocus={focusGold} onBlur={blurGold}
                  rows={4}
                  placeholder="Any special requirements, dietary needs, or occasion details…"
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
              </div>

              {error && (
                <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", textAlign: "center", lineHeight: 1.6, margin: 0 }}>
                  {error}
                </p>
              )}

              <div style={{ order: 4, display: "flex", gap: "12px" }}>
                <button onClick={goBack}
                  style={{ fontFamily: LATO, fontSize: "14px", letterSpacing: "0.8px", color: "rgba(255,255,255,0.8)", backgroundColor: "transparent", border: "0.5px solid rgba(197,164,109,0.25)", padding: "16px 24px", cursor: "pointer" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = GOLD; (e.currentTarget as HTMLElement).style.color = GOLD; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(197,164,109,0.25)"; (e.currentTarget as HTMLElement).style.color = MUTED; }}>
                  ← Back
                </button>
                <button onClick={goNext}
                  style={{ fontFamily: LATO, fontSize: "14px", letterSpacing: "0.8px", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "16px", flex: 1, cursor: "pointer" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}>
                  Review →
                </button>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
              STEP 3 — Add-ons & Review
          ════════════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

              {/* ── Add-ons ─────────────────────────────────────────────── */}
              <div>
                <p style={{ fontFamily: PLAYFAIR, fontSize: "20px", fontWeight: 400, color: WHITE, margin: "0 0 6px" }}>
                  Enhance your stay
                </p>

                {addonsLoading ? (
                  <div style={{ display: "grid", gap: "8px" }} aria-hidden="true">
                    {[0, 1, 2].map((item) => (
                      <div
                        key={item}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: "16px",
                          padding: "14px 18px",
                          border: "0.5px solid rgba(197,164,109,0.14)",
                          backgroundColor: "rgba(255,255,255,0.02)",
                          minHeight: "82px",
                        }}
                      >
                        <div style={{ display: "flex", gap: "12px", flex: 1, minWidth: 0 }}>
                          <SkeletonBlock width="16px" height="16px" style={{ marginTop: "2px", flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <SkeletonText width={item === 0 ? "48%" : item === 1 ? "38%" : "56%"} height="14px" style={{ marginBottom: "10px" }} />
                            <SkeletonText width="92%" height="11px" style={{ marginBottom: "7px" }} />
                            <SkeletonText width="62%" height="10px" />
                          </div>
                        </div>
                        <div style={{ width: "76px", display: "grid", justifyItems: "end", gap: "8px" }}>
                          <SkeletonText width="64px" height="10px" />
                          <SkeletonText width="46px" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : availableAddons.length === 0 ? (
                  <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED }}>
                    No add-ons are available for this booking.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {/* Smart suggestion context banner — derived from current stay details */}
                    {(() => {
                      const isGroupBooking = sleepingGuestsCount >= 4;
                      const isLongerStay   = nights >= 3;
                      const hasOffer       = deadDayOfferAddons.length > 0;
                      const hints: string[] = [];
                      if (hasOffer)                      hints.push("A special offer is available — see highlighted add-ons below.");
                      if (isGroupBooking)                hints.push("Some add-ons are especially popular for larger groups.");
                      else if (isLongerStay)             hints.push("A few add-ons are particularly suited to longer stays.");
                      if (hints.length === 0) return null;
                      return (
                        <div style={{ border: "0.5px solid rgba(197,164,109,0.18)", backgroundColor: "rgba(197,164,109,0.04)", padding: "10px 14px" }}>
                          {hints.map((hint, i) => (
                            <p key={i} style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: i > 0 ? "5px 0 0" : 0, lineHeight: 1.55, fontStyle: "italic" }}>
                              {hint}
                            </p>
                          ))}
                        </div>
                      );
                    })()}
                    {addonGroups.map((group) => (
                      <div key={group.category} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {showCategoryHeaders && (
                          <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, margin: 0 }}>
                            {group.label}
                          </p>
                        )}
                        {group.items.map((addon) => {
                          const selected = selectedAddons.includes(addon.id);
                          const availability = getAddonAvailability(addon);
                          const operationalFeedback = selected ? getAddonOperationalFeedback(addon) : [];
                          const sameDayWarning = getSameDayAddonWarning(addon, checkIn, checkOut, confirmedRanges);
                          const timingType = getAddonTimingType(addon);
                          const deadDayTimingHighlight =
                            (timingType === "early_checkin" && deadDaySuggestion.suggestEarlyCheckin) ||
                            (timingType === "late_checkout" && deadDaySuggestion.suggestLateCheckout);
                          const offerData = deadDayOfferAddons.find(o => o.addon.id === addon.id);
                          const hasOffer = offerData !== undefined;
                          const hasAppliedDiscount = offerData !== undefined && appliedDiscounts.includes(addon.id);
                          const disableSelection = !availability.selectable;
                          return (
                            <button
                              key={addon.id}
                              type="button"
                              onClick={() => toggleAddon(addon.id)}
                              disabled={disableSelection}
                              style={{
                                display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                                width: "100%", textAlign: "left",
                                padding: "14px 18px",
                                border: `0.5px solid ${selected ? "rgba(111,207,138,0.55)" : availability.mode === "soft" && !availability.available ? "rgba(226,171,90,0.42)" : disableSelection ? "rgba(255,255,255,0.12)" : "rgba(197,164,109,0.18)"}`,
                                backgroundColor: selected ? "rgba(111,207,138,0.08)" : availability.mode === "soft" && !availability.available ? "rgba(226,171,90,0.08)" : disableSelection ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.02)",
                                cursor: disableSelection ? "not-allowed" : "pointer",
                                transition: "border-color 0.15s, background-color 0.15s",
                                opacity: disableSelection ? 0.55 : 1,
                                gap: "16px",
                              }}
                            >
                          {/* Checkbox indicator + label */}
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", flex: 1, minWidth: 0 }}>
                            <div style={{
                              width: "16px", height: "16px", flexShrink: 0, marginTop: "2px",
                              border: `1px solid ${selected ? SUCCESS : availability.mode === "soft" && !availability.available ? "rgba(226,171,90,0.55)" : disableSelection ? "rgba(255,255,255,0.2)" : "rgba(197,164,109,0.3)"}`,
                              backgroundColor: selected ? SUCCESS : "transparent",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              transition: "background-color 0.15s, border-color 0.15s",
                            }}>
                              {selected && (
                                <span style={{ color: CHARCOAL, fontSize: "10px", fontWeight: 700, lineHeight: 1 }}>✓</span>
                              )}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "2px" }}>
                                <AddonIcon
                                  label={addon.label}
                                  size={16}
                                  color={selected ? "rgba(111,207,138,0.82)" : disableSelection ? "rgba(197,164,109,0.25)" : "rgba(197,164,109,0.45)"}
                                />
                                <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0, flexWrap: "wrap" }}>
                                  <span style={{ fontFamily: LATO, fontSize: "13px", color: selected ? WHITE : disableSelection ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.7)", fontWeight: selected ? 400 : 300, lineHeight: 1.3 }}>
                                    {addon.label}
                                  </span>
                                  {addon.recommended && (
                                    <span
                                      style={{
                                        fontFamily: LATO,
                                        fontSize: "9px",
                                        letterSpacing: "1.4px",
                                        textTransform: "uppercase",
                                        color: GOLD,
                                        border: "0.5px solid rgba(197,164,109,0.35)",
                                        backgroundColor: "rgba(197,164,109,0.08)",
                                        padding: "2px 6px",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      Recommended
                                    </span>
                                  )}
                                  {deadDayTimingHighlight && (
                                    <span
                                      style={{
                                        fontFamily: LATO,
                                        fontSize: "9px",
                                        letterSpacing: "1.4px",
                                        textTransform: "uppercase",
                                        color: "#d4b98a",
                                        border: "0.5px solid rgba(197,164,109,0.5)",
                                        backgroundColor: "rgba(197,164,109,0.12)",
                                        padding: "2px 6px",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      Fits your dates
                                    </span>
                                  )}
                                  {hasOffer && (
                                    <span
                                      style={{
                                        fontFamily: LATO,
                                        fontSize: "9px",
                                        letterSpacing: "1.4px",
                                        textTransform: "uppercase",
                                        color: "#7ecfcf",
                                        border: "0.5px solid rgba(126,207,207,0.38)",
                                        backgroundColor: "rgba(126,207,207,0.10)",
                                        padding: "2px 6px",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      Special offer
                                    </span>
                                  )}
                                  {hasAppliedDiscount && (
                                    <span
                                      style={{
                                        fontFamily: LATO,
                                        fontSize: "9px",
                                        letterSpacing: "1.4px",
                                        textTransform: "uppercase",
                                        color: SUCCESS,
                                        border: "0.5px solid rgba(111,207,138,0.4)",
                                        backgroundColor: "rgba(111,207,138,0.12)",
                                        padding: "2px 6px",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      Offer applied
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* Context microcopy — derived from stay details, never blocks selection */}
                              {(() => {
                                const cat = normalizeAddonCategory(addon.category);
                                if (deadDayTimingHighlight && offerData !== undefined) return (
                                  <span style={{ fontFamily: LATO, fontSize: "10px", color: "#7ecfcf", display: "block", marginTop: "3px", lineHeight: 1.4, fontStyle: "italic" }}>
                                    Best value for your dates
                                  </span>
                                );
                                if (sleepingGuestsCount >= 4 && (cat === "Experience" || cat === "Services")) return (
                                  <span style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, display: "block", marginTop: "3px", lineHeight: 1.4, fontStyle: "italic" }}>
                                    Popular for groups
                                  </span>
                                );
                                if (nights >= 3 && cat === "Comfort") return (
                                  <span style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, display: "block", marginTop: "3px", lineHeight: 1.4, fontStyle: "italic" }}>
                                    Recommended for your stay
                                  </span>
                                );
                                return null;
                              })()}
                              {addon.description?.trim() && (
                                <span
                                  style={{
                                    fontFamily: LATO,
                                    fontSize: "11px",
                                    color: disableSelection ? "rgba(255,255,255,0.34)" : MUTED,
                                    display: "-webkit-box",
                                    marginTop: "4px",
                                    lineHeight: 1.55,
                                    overflow: "hidden",
                                    WebkitBoxOrient: "vertical",
                                    WebkitLineClamp: 2,
                                  }}
                                >
                                  {addon.description.trim()}
                                </span>
                              )}
                              {hasOffer && (
                                <span
                                  style={{
                                    fontFamily: LATO,
                                    fontSize: "11px",
                                    color: hasAppliedDiscount ? "rgba(111,207,138,0.88)" : MUTED,
                                    display: "block",
                                    marginTop: "6px",
                                    lineHeight: 1.5,
                                  }}
                                >
                                  {hasAppliedDiscount ? "Discount applied due to an availability gap." : "Special rate for extending your stay."}
                                </span>
                              )}
                              {addon.requires_approval && (
                                <span style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, display: "block", marginTop: "4px", lineHeight: 1.5 }}>
                                  Subject to confirmation
                                </span>
                              )}
                              {/* Phase 13C.4 correction: required-for-7-8-guests helper */}
                              {isExtraBeddingAddon(addon) && sleepingGuestsCount >= EXTRA_BEDDING_REQUIRED_GUESTS && availability.selectable && (
                                <span style={{ fontFamily: LATO, fontSize: "11px", color: GOLD, display: "block", marginTop: "6px", lineHeight: 1.5 }}>
                                  Required for 7–8 guests.
                                </span>
                              )}
                              {!availability.available && (
                                <span style={{ fontFamily: LATO, fontSize: "11px", color: availability.mode === "soft" ? "#e2ab5a" : "#e07070", display: "block", marginTop: "6px", lineHeight: 1.5 }}>
                                  {availability.warning}
                                </span>
                              )}
                              {sameDayWarning && (
                                <span style={{ fontFamily: LATO, fontSize: "11px", color: "#e2ab5a", display: "block", marginTop: "6px", lineHeight: 1.5 }}>
                                  {sameDayWarning}
                                </span>
                              )}
                              {selected && operationalFeedback.length > 0 && (
                                <div style={{
                                  display: "grid",
                                  gap: "4px",
                                  marginTop: "8px",
                                  paddingTop: "8px",
                                  borderTop: "0.5px solid rgba(255,255,255,0.06)",
                                }}>
                                  {operationalFeedback.map((item) => (
                                    <span
                                      key={`${addon.id}-${item.text}`}
                                      style={{
                                        fontFamily: LATO,
                                        fontSize: "11px",
                                        color: item.tone === "warning" ? "#e2ab5a" : MUTED,
                                        display: "block",
                                        lineHeight: 1.5,
                                      }}
                                    >
                                      {item.text}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Pricing metadata */}
                          <div style={{ textAlign: "right", flexShrink: 0, paddingLeft: "16px" }}>
                            {hasAppliedDiscount && offerData ? (
                              /* Phase 12E Batch 5: discount override (display only, not submitted) */
                              <>
                                <span style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, display: "block", textDecoration: "line-through" }}>
                                  {offerData.basePrice.toLocaleString()} {addon.currency}
                                </span>
                                <span style={{ fontFamily: LATO, fontSize: "14px", color: selected ? SUCCESS : GOLD, display: "block", fontWeight: 600, lineHeight: 1.35 }}>
                                  {offerData.discountedPrice.toLocaleString()} {addon.currency}
                                </span>
                                <span style={{ fontFamily: LATO, fontSize: "10px", color: selected ? SUCCESS : "#6fbf7e", display: "block", lineHeight: 1.4 }}>
                                  Save {offerData.savings} {addon.currency}
                                </span>
                                <span style={{ fontFamily: LATO, fontSize: "10px", color: selected ? "rgba(111,207,138,0.88)" : MUTED, display: "block", marginTop: "3px", lineHeight: 1.4 }}>
                                  {selected ? "Offer applied ✓" : "Limited-time offer"}
                                </span>
                              </>
                            ) : addon.pricing_type === "percentage" && typeof addon.percentage_value === "number" && addon.percentage_value > 0 ? (
                              <>
                                <span style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1px", color: MUTED, display: "block" }}>
                                  {addon.percentage_value}% of stay
                                </span>
                                {(() => {
                                  const computed = computeAddonPrice(addon);
                                  return computed !== null ? (
                                    <span style={{ fontFamily: LATO, fontSize: "12px", color: selected ? SUCCESS : MUTED }}>
                                      {Math.round(computed).toLocaleString()} {addon.currency}
                                    </span>
                                  ) : (
                                    <span style={{ fontFamily: LATO, fontSize: "11px", color: "rgba(138,128,112,0.4)", fontStyle: "italic" }}>
                                      Select dates
                                    </span>
                                  );
                                })()}
                              </>
                            ) : (
                              <>
                                <span style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1px", color: MUTED, display: "block" }}>
                                  {PRICING_MODEL_LABELS[addon.pricing_model] ?? addon.pricing_model}
                                </span>
                                {addon.price !== null ? (
                                  <span style={{ fontFamily: LATO, fontSize: "12px", color: selected ? SUCCESS : MUTED }}>
                                    {addon.price.toLocaleString()} {addon.currency}
                                  </span>
                                ) : (
                                  <span style={{ fontFamily: LATO, fontSize: "11px", color: "rgba(138,128,112,0.5)", fontStyle: "italic" }}>
                                    Price on request
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Phase 12E Batch 4+5: Dead-day suggestion / offer card */}
              {(deadDaySuggestion.suggestLateCheckout || deadDaySuggestion.suggestEarlyCheckin) && (
                deadDayOfferAddons.length > 0 ? (
                  /* Batch 5: priced offer card — shown when timing add-ons have computable prices */
                  <div style={{
                    border: "0.5px solid rgba(197,164,109,0.4)",
                    backgroundColor: "rgba(197,164,109,0.06)",
                    padding: "16px 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                  }}>
                    <div>
                      <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 4px" }}>
                        Special offer
                      </p>
                      <p style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, margin: 0, fontWeight: 300 }}>
                        Extend your stay for less
                      </p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {deadDayOfferAddons.map(({ addon: offerAddon, basePrice: bp, discountedPrice: dp, savings: sv }) => {
                        const alreadyApplied = appliedDiscounts.includes(offerAddon.id);
                        return (
                          <div key={offerAddon.id} style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                            flexWrap: "wrap",
                          }}>
                            <div>
                              <p style={{ fontFamily: LATO, fontSize: "12px", color: "rgba(255,255,255,0.8)", margin: "0 0 2px", lineHeight: 1.4 }}>
                                {offerAddon.label}
                              </p>
                              <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.4 }}>
                                <span style={{ textDecoration: "line-through", marginRight: "6px" }}>
                                  {bp.toLocaleString()} {offerAddon.currency}
                                </span>
                                <span style={{ color: GOLD, marginRight: "6px" }}>
                                  {dp.toLocaleString()} {offerAddon.currency}
                                </span>
                                <span style={{ color: "#6fbf7e" }}>
                                  Save {sv}
                                </span>
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => applyDeadDayOffer(offerAddon.id)}
                              disabled={alreadyApplied}
                              style={{
                                fontFamily: LATO,
                                fontSize: "10px",
                                letterSpacing: "1.5px",
                                textTransform: "uppercase",
                                color: alreadyApplied ? MUTED : CHARCOAL,
                                backgroundColor: alreadyApplied ? "transparent" : GOLD,
                                border: alreadyApplied ? `0.5px solid rgba(197,164,109,0.3)` : "none",
                                padding: "8px 18px",
                                cursor: alreadyApplied ? "default" : "pointer",
                                flexShrink: 0,
                                whiteSpace: "nowrap",
                              }}
                              onMouseEnter={e => { if (!alreadyApplied) (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
                              onMouseLeave={e => { if (!alreadyApplied) (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}
                            >
                              {alreadyApplied ? "Applied ✓" : "Apply offer"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                      Estimated price shown. Final confirmation by Oraya.
                    </p>
                  </div>
                ) : (
                  /* Batch 4: generic suggestion — fallback when no timing add-ons are configured */
                  <div style={{
                    border: "0.5px solid rgba(197,164,109,0.25)",
                    backgroundColor: "rgba(197,164,109,0.04)",
                    padding: "16px 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}>
                    <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
                      Enhance your stay
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                      {deadDaySuggestion.suggestLateCheckout && (
                        <p style={{ fontFamily: LATO, fontSize: "12px", color: "rgba(255,255,255,0.65)", margin: 0, lineHeight: 1.6 }}>
                          · Late checkout may be available to extend your stay by a day
                        </p>
                      )}
                      {deadDaySuggestion.suggestEarlyCheckin && (
                        <p style={{ fontFamily: LATO, fontSize: "12px", color: "rgba(255,255,255,0.65)", margin: 0, lineHeight: 1.6 }}>
                          · Early check-in may be available for the adjacent day
                        </p>
                      )}
                      <p style={{ fontFamily: LATO, fontSize: "12px", color: "rgba(255,255,255,0.65)", margin: 0, lineHeight: 1.6 }}>
                        · A special offer may be available for adjacent days — contact Oraya for details
                      </p>
                    </div>
                    <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: "2px 0 0", lineHeight: 1.5 }}>
                      Select an early check-in or late checkout add-on above, or contact us to arrange.
                    </p>
                  </div>
                )
              )}

              {error && (
                <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", textAlign: "center", lineHeight: 1.6, margin: 0 }}>
                  {error}
                </p>
              )}
              <div style={{ display: "flex", gap: "12px" }}>
                <button onClick={goBack}
                  style={{ fontFamily: LATO, fontSize: "14px", letterSpacing: "0.8px", color: "rgba(255,255,255,0.8)", backgroundColor: "transparent", border: "0.5px solid rgba(197,164,109,0.25)", padding: "16px 24px", cursor: "pointer" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = GOLD; (e.currentTarget as HTMLElement).style.color = GOLD; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(197,164,109,0.25)"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.8)"; }}>
                  ← Back
                </button>
                <button onClick={goNext}
                  style={{ fontFamily: LATO, fontSize: "14px", letterSpacing: "0.8px", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "16px", flex: 1, cursor: "pointer" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}>
                  Continue to review →
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <p style={{ fontFamily: PLAYFAIR, fontSize: "20px", fontWeight: 400, color: WHITE, margin: "0 0 10px" }}>
                  Review your stay
                </p>
                <div style={{ border: "0.5px solid rgba(197,164,109,0.18)", padding: "1.25rem", backgroundColor: "rgba(255,255,255,0.015)" }}>
                  {(
                    [
                      ["Villa", form.villa],
                      ["Check-in", fmtDate(checkIn)],
                      ["Check-out", fmtDate(checkOut)],
                      ["Duration", `${nights} ${nights === 1 ? "night" : "nights"}`],
                      ["Bedrooms", formatBedroomLabel(form.bedroomCount)],
                      ["Guest estimate", form.sleepingGuests],
                      ...(sleepingGuestsCount > 6 ? [["Sleeping setup", sleepingSetupLabel]] : []),
                      ...(selectedAddons.length > 0 ? [["Selected add-ons", selectedAddonDetails.map((addon) => addon.label).join(", ")]] : []),
                    ] as [string, string][]
                  ).map(([label, value]) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 0", borderBottom: "0.5px solid rgba(255,255,255,0.05)", gap: "16px" }}>
                      <span style={{ fontFamily: LATO, fontSize: "14px", color: "rgba(255,255,255,0.76)", flexShrink: 0, paddingRight: "16px" }}>{label}</span>
                      <span style={{ fontFamily: LATO, fontSize: "14px", color: WHITE, textAlign: "right", lineHeight: 1.5, maxWidth: "60%" }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {estimatePanel}

              <div style={{ border: "0.5px solid rgba(197,164,109,0.24)", backgroundColor: "rgba(197,164,109,0.05)", padding: "16px 18px", display: "grid", gap: "10px" }}>
                <p style={{ fontFamily: PLAYFAIR, fontSize: "18px", color: WHITE, margin: 0 }}>Payment options</p>
                <p style={{ fontFamily: LATO, fontSize: "14px", color: "rgba(255,255,255,0.78)", margin: 0, lineHeight: 1.6 }}>
                  Payment does not confirm the booking until Oraya reviews and approves the request.
                </p>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button type="button" disabled style={{ fontFamily: LATO, fontSize: "14px", color: MUTED, border: "0.5px solid rgba(197,164,109,0.3)", backgroundColor: "rgba(255,255,255,0.02)", padding: "10px 16px", cursor: "not-allowed" }}>Pay deposit (coming soon)</button>
                  <button type="button" disabled style={{ fontFamily: LATO, fontSize: "14px", color: MUTED, border: "0.5px solid rgba(197,164,109,0.3)", backgroundColor: "rgba(255,255,255,0.02)", padding: "10px 16px", cursor: "not-allowed" }}>Pay full amount (coming soon)</button>
                </div>
              </div>

              {submissionFallbackComplete && (
                <p style={{ fontFamily: LATO, fontSize: "14px", color: "#6fcf8a", margin: 0, lineHeight: 1.6 }}>
                  Request submitted successfully. We will contact you shortly.
                </p>
              )}

              {error && (
                <p style={{ fontFamily: LATO, fontSize: "14px", color: "#e07070", textAlign: "center", lineHeight: 1.6, margin: 0 }}>
                  {error}
                </p>
              )}

              <div style={{ display: "flex", gap: "12px" }}>
                <button onClick={goBack} disabled={loading}
                  style={{ fontFamily: LATO, fontSize: "14px", letterSpacing: "0.8px", color: "rgba(255,255,255,0.8)", backgroundColor: "transparent", border: "0.5px solid rgba(197,164,109,0.25)", padding: "16px 24px", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}>
                  ← Back
                </button>
                <button onClick={handleSubmit} disabled={loading}
                  style={{ fontFamily: LATO, fontSize: "14px", letterSpacing: "0.8px", color: CHARCOAL, backgroundColor: GOLD, border: "none", padding: "16px", flex: 1, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
                  {loading ? "Submitting…" : "Submit request without payment"}
                </button>
              </div>
            </div>
          )}

        </div>

        <details style={{ border: "0.5px solid rgba(197,164,109,0.2)", backgroundColor: "rgba(197,164,109,0.04)", padding: "12px 14px", marginTop: "20px" }}>
          <summary style={{ fontFamily: LATO, fontSize: "14px", color: "rgba(255,255,255,0.82)", cursor: "pointer" }}>
            Booking details
          </summary>
          <p style={{ fontFamily: LATO, fontSize: "14px", color: "rgba(255,255,255,0.8)", margin: "10px 0 0", lineHeight: 1.7 }}>
            Direct booking here does not mean instant or unverified checkout. Oraya reviews each request against availability and operations before confirming your stay.
          </p>
          <p style={{ fontFamily: LATO, fontSize: "14px", color: "rgba(255,255,255,0.76)", margin: "0 0 10px", lineHeight: 1.7 }}>
            Payment is requested only after we confirm and align the reservation — not when you press submit. Guests receive coordinated support before arrival and during their stay. Automated arrival instructions are used only after confirmation and operational review.
          </p>
          <p style={{ fontFamily: LATO, fontSize: "14px", color: "rgba(255,255,255,0.76)", margin: 0, lineHeight: 1.7 }}>
            Questions:{" "}
            <a href="mailto:hello@stayoraya.com" style={{ color: GOLD, textDecoration: "none" }}>hello@stayoraya.com</a>
          </p>
          {authStatus === "member" ? (
            <div style={{ border: "0.5px solid rgba(197,164,109,0.2)", backgroundColor: "rgba(197,164,109,0.04)", padding: "0.875rem 1.25rem", marginTop: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={{ fontFamily: LATO, fontSize: "12px", color: "rgba(255,255,255,0.6)", margin: 0 }}>
                Booking as <span style={{ color: GOLD }}>{memberName || "member"}</span>
              </p>
              <a href="/login" style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, textDecoration: "none" }}>
                Not you?
              </a>
            </div>
          ) : (
            <div style={{ border: "0.5px solid rgba(197,164,109,0.12)", backgroundColor: "rgba(255,255,255,0.02)", padding: "0.75rem 1.25rem", marginTop: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0 }}>Continuing as guest</p>
              <button
                onClick={() => { setGuestMode(false); setStep(1); setError(""); }}
                style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, backgroundColor: "transparent", border: "none", cursor: "pointer", letterSpacing: "1px" }}>
                Sign in instead
              </button>
            </div>
          )}
        </details>
      </div>
    </main>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={null}>
      <BookPageInner />
    </Suspense>
  );
}
