import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendBookingRequestEmail } from "@/lib/send-booking-request-email";
import { sendBookingPendingEmail } from "@/lib/send-booking-pending-email";
import { createActionToken } from "@/lib/booking-action-token";
import { SITE_URL } from "@/lib/brand";
import { findAvailabilityConflict } from "@/lib/calendar/availability";
import { getVillaPricing, parseVillaPricingSetting, VILLA_BASE_PRICING_KEY } from "@/lib/admin-pricing";
import {
  applyBedroomFactorToNightlyRates,
  buildUnavailableInternalPricingIntelligence,
  computeInternalPricingIntelligence,
  detectEventInquiry,
  parseBedroomCountFromMessage,
  parseRequestedServiceCount,
} from "@/lib/pricing/intelligence";
import { buildPricingSnapshot, runPricingAudit, type PricingSnapshot } from "@/lib/pricing/server-audit";
import { ADDON_OPERATIONAL_SETTINGS_KEY, formatPreparationTime, getAddonEnforcementMode, getAddonTimingType, mergeAddonsWithOperationalSettings, parseAddonOperationalSetting } from "@/lib/addon-operations";
import { runAddonAudit } from "@/lib/addon-audit";

const ALLOWED_VILLAS = ["Villa Mechmech", "Villa Byblos"];
const ISO_DATE_RE    = /^\d{4}-\d{2}-\d{2}$/;
/** Phase 12E Batch 6: mirrors the UI constant — used for server-side fallback recompute. */
const DEAD_DAY_DISCOUNT_PCT = 0.30;

const PRICING_ERROR_MESSAGES = {
  invalid_date_range: "Invalid booking dates.",
  pricing_config_missing: "Pricing is not available for this villa yet. Please contact us.",
  unpriced_nights: "Pricing is not available for one or more selected nights. Please choose different dates or contact us.",
  minimum_stay_violation: "Your selected dates do not meet the minimum stay requirement.",
} as const;

type ConfirmedRange = {
  check_in: string;
  check_out: string;
};

function getPricingValidationMessage(
  reasons: ReturnType<typeof runPricingAudit>["would_block_reasons"]
): string {
  if (reasons.length === 1) {
    return PRICING_ERROR_MESSAGES[reasons[0]];
  }

  return "Your selected dates could not be priced. Please review your stay details or contact us.";
}

function getAddonAuditResultLabel(input: {
  available: boolean;
  has_time_warning: boolean;
  has_same_day_warning?: boolean;
  requires_approval: boolean;
  enforcement_mode: "strict" | "soft" | "none";
}): "ok" | "requires_approval" | "soft_warning" | "strict_violation" {
  if (input.enforcement_mode === "strict" && !input.available) return "strict_violation";
  if (input.requires_approval) return "requires_approval";
  if ((input.enforcement_mode === "soft" && input.has_time_warning) || input.has_same_day_warning) return "soft_warning";
  return "ok";
}

function parseDateOnlyParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function dateOnlySerial(value: string) {
  const parts = parseDateOnlyParts(value);
  if (!parts) return null;

  let year = parts.year;
  const { month, day } = parts;
  year -= month <= 2 ? 1 : 0;
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400;
  const monthPrime = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * monthPrime + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;

  return era * 146097 + dayOfEra;
}

function formatDateOnlyFromSerial(serial: number) {
  const era = Math.floor(serial / 146097);
  const dayOfEra = serial - era * 146097;
  const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365);
  const yearBase = yearOfEra + era * 400;
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1;
  const month = monthPrime + (monthPrime < 10 ? 3 : -9);
  const year = yearBase + (month <= 2 ? 1 : 0);

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDaysDateOnly(value: string, days: number) {
  const serial = dateOnlySerial(value);
  if (serial === null) return null;
  return formatDateOnlyFromSerial(serial + days);
}

function detectDeadDayOfferSuggestion(
  checkIn: string,
  checkOut: string,
  confirmedRanges: ConfirmedRange[],
) {
  let suggestLateCheckout = false;
  let suggestEarlyCheckin = false;

  for (const rangeA of confirmedRanges) {
    const nextBookingISO = addDaysDateOnly(rangeA.check_out, 2);
    if (!nextBookingISO) continue;

    const hasNextBooking = confirmedRanges.some((rangeB) => rangeB.check_in === nextBookingISO);
    if (!hasNextBooking) continue;

    const gapDayISO = addDaysDateOnly(rangeA.check_out, 1);
    if (!gapDayISO) continue;

    if (checkOut === rangeA.check_out) {
      suggestLateCheckout = true;
    }

    if (checkIn === gapDayISO) {
      suggestEarlyCheckin = true;
      suggestLateCheckout = true;
    }
  }

  return { suggestLateCheckout, suggestEarlyCheckin };
}

// POST — create a new booking (member or guest)
// Uses service role to bypass RLS entirely — avoids anon-client policy issues
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      villa,
      check_in,
      check_out,
      sleeping_guests,
      day_visitors,
      event_type,
      message,
      addons,
      member_id,
      guest_name,
      guest_email,
      guest_phone,
      guest_country,
      pricing_subtotal: clientPricingSubtotal,
    } = body;

    if (!villa || !check_in || !check_out) {
      return NextResponse.json({ error: "villa, check_in, and check_out are required." }, { status: 400 });
    }
    if (!ALLOWED_VILLAS.includes(villa)) {
      return NextResponse.json({ error: "Invalid villa selection." }, { status: 400 });
    }
    if (!ISO_DATE_RE.test(check_in) || !ISO_DATE_RE.test(check_out)) {
      return NextResponse.json({ error: "Dates must be in YYYY-MM-DD format." }, { status: 400 });
    }
    if (check_out <= check_in) {
      return NextResponse.json({ error: "check_out must be after check_in." }, { status: 400 });
    }

    try {
      const incomingIsEvent = Boolean(event_type) && typeof message === "string" && message.includes("[Event Inquiry]");
      if (incomingIsEvent) {
        const attendeeCount = parseInt(String(day_visitors ?? ""), 10);
        if (!Number.isFinite(attendeeCount) || attendeeCount < 1) {
          return NextResponse.json(
            { error: "Please enter a valid expected attendee count for your event inquiry." },
            { status: 400 },
          );
        }
        if (attendeeCount > 30) {
          return NextResponse.json(
            { error: "Oraya private events are limited to 30 attendees." },
            { status: 400 },
          );
        }
      }
      const conflict = await findAvailabilityConflict(villa, check_in, check_out, undefined, incomingIsEvent);
      if (conflict) {
        return NextResponse.json(
          { error: `These dates are unavailable — ${villa} is already blocked for ${conflict.check_in} to ${conflict.check_out}. Please choose different dates.` },
          { status: 409 }
        );
      }
    } catch (conflictError) {
      console.error("[api/bookings] conflict check error:", conflictError);
      return NextResponse.json({ error: "Could not verify availability. Please try again." }, { status: 500 });
    }

    if (member_id) {
      const token = request.headers.get("Authorization")?.replace("Bearer ", "");
      if (!token) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (!user || user.id !== member_id) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
      }
    }

    if (guest_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(guest_email))) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
    }

    let pricingSnapshotData: {
      pricing_subtotal: number;
      pricing_nights: ReturnType<typeof runPricingAudit>["nights"];
      pricing_warnings: string[];
      pricing_snapshot: PricingSnapshot;
    } | null = null;
    let addonsSnapshotData: Array<{
      id: string;
      label: string;
      price: number | null;
      category: string | null;
      preparation_time_hours: number | null;
      enforcement_mode: string | null;
      requires_approval: boolean;
      status: "pending_approval" | "confirmed" | "at_risk";
      pricing_type?: "percentage";
      original_price?: number;
      offer_applied?: true;
      offer_type?: "dead_day";
      savings?: number;
      same_day_warning?: "same_day_checkout" | "same_day_checkin";
    }> | null = null;

    const insertData: Record<string, unknown> = {
      villa,
      check_in,
      check_out,
      sleeping_guests: parseInt(sleeping_guests, 10) || 0,
      day_visitors:    parseInt(day_visitors, 10) || 0,
      event_type:      event_type || null,
      message:         message || null,
      addons:          Array.isArray(addons) ? addons : [],
      status:          "pending",
      member_id:       member_id || null,
      guest_name:      guest_name || null,
      guest_email:     guest_email || null,
      guest_phone:     guest_phone || null,
      guest_country:   guest_country || null,
      pricing_subtotal: null,
      pricing_nights: null,
      pricing_warnings: null,
      pricing_snapshot: null,
      addons_snapshot: null,
    };

    try {
      const { data: pricingRow, error: pricingError } = await supabaseAdmin
        .from("settings")
        .select("value")
        .eq("key", VILLA_BASE_PRICING_KEY)
        .maybeSingle();

      if (pricingError) {
        throw pricingError;
      }

      const pricingConfig = pricingRow?.value
        ? getVillaPricing(parseVillaPricingSetting(pricingRow.value), villa)
        : null;
      const pricingAudit = runPricingAudit({
        config: pricingConfig,
        check_in,
        check_out,
      });
      const selectedBedrooms = parseBedroomCountFromMessage(message) ?? 3;
      const bedroomPricing = applyBedroomFactorToNightlyRates(pricingAudit.nights, selectedBedrooms);
      const adjustedStaySubtotal = bedroomPricing.adjustedSubtotal ?? pricingAudit.subtotal;
      const pricingSnapshot = buildPricingSnapshot(pricingAudit, {
        clientSubtotal: clientPricingSubtotal,
      });
      pricingSnapshot.full_villa_subtotal = pricingAudit.subtotal;
      pricingSnapshot.adjusted_stay_subtotal = adjustedStaySubtotal;
      pricingSnapshot.subtotal = adjustedStaySubtotal;
      pricingSnapshot.bedroom_factor = bedroomPricing.bedroomFactor;
      pricingSnapshot.bedrooms_to_be_used = bedroomPricing.bedrooms;
      pricingSnapshot.nightly_breakdown = bedroomPricing.nightlyBreakdown;

      if (process.env.NODE_ENV !== "production") {
        console.debug("[pricing-dry-run]", {
          ok: pricingAudit.ok,
          would_block_reasons: pricingAudit.would_block_reasons,
          subtotal: pricingAudit.subtotal,
        });
      }

      if (!pricingAudit.ok) {
        return NextResponse.json(
          {
            error: getPricingValidationMessage(pricingAudit.would_block_reasons),
            reasons: pricingAudit.would_block_reasons,
          },
          { status: 400 }
        );
      }

      pricingSnapshotData = {
        pricing_subtotal: pricingAudit.subtotal,
        pricing_nights: pricingAudit.nights,
        pricing_warnings: pricingAudit.warnings,
        pricing_snapshot: pricingSnapshot,
      };
    } catch (pricingAuditError) {
      console.error("[api/bookings] pricing audit failed:", pricingAuditError);
      return NextResponse.json(
        { error: "Unable to validate pricing for this booking. Please try again or contact us." },
        { status: 500 }
      );
    }

    if (pricingSnapshotData) {
      insertData.pricing_subtotal = pricingSnapshotData.pricing_subtotal;
      insertData.pricing_nights = pricingSnapshotData.pricing_nights;
      insertData.pricing_warnings = pricingSnapshotData.pricing_warnings;
      insertData.pricing_snapshot = pricingSnapshotData.pricing_snapshot;
    }

    try {
      const selectedAddonIds = Array.isArray(addons)
        ? addons
            .map((addon) => {
              if (!addon || typeof addon !== "object") return null;
              const id = (addon as { id?: unknown }).id;
              return typeof id === "string" ? id : null;
            })
            .filter((id): id is string => Boolean(id))
        : [];

      /**
       * Phase 12E Batch 6: discount signals from the frontend.
       * An entry of type `number` means the client supplied an explicit discounted price.
       * An entry of `"flag_only"` means the client set applied_discount=true but sent no
       * price — the server will recompute using DEAD_DAY_DISCOUNT_PCT as a fallback.
       */
      const discountedPriceMap = new Map<string, number | "flag_only">();
      if (Array.isArray(addons)) {
        for (const item of addons) {
          if (!item || typeof item !== "object") continue;
          const entry = item as Record<string, unknown>;
          const id = typeof entry.id === "string" ? entry.id : null;
          if (!id) continue;
          const dp =
            typeof entry.discounted_price === "number" &&
            Number.isFinite(entry.discounted_price) &&
            entry.discounted_price >= 0
              ? (entry.discounted_price as number)
              : null;
          if (dp !== null) {
            discountedPriceMap.set(id, dp);
          } else if (entry.applied_discount === true) {
            discountedPriceMap.set(id, "flag_only");
          }
        }
      }

      if (selectedAddonIds.length > 0) {
        const [addonsResponse, addonSettingsResponse, sameDayCheckoutResponse, sameDayCheckinResponse, confirmedRangesResponse] = await Promise.all([
          supabaseAdmin
            .from("addons")
            .select("id, label, price, enabled")
            .in("id", selectedAddonIds),
          supabaseAdmin
            .from("settings")
            .select("value")
            .eq("key", ADDON_OPERATIONAL_SETTINGS_KEY)
            .maybeSingle(),
          supabaseAdmin
            .from("bookings")
            .select("id")
            .eq("villa", villa)
            .eq("status", "confirmed")
            .eq("check_out", check_in)
            .limit(1),
          supabaseAdmin
            .from("bookings")
            .select("id")
            .eq("villa", villa)
            .eq("status", "confirmed")
            .eq("check_in", check_out)
            .limit(1),
          supabaseAdmin
            .from("bookings")
            .select("check_in, check_out")
            .eq("villa", villa)
            .eq("status", "confirmed"),
        ]);

        if (addonsResponse.error) {
          throw addonsResponse.error;
        }
        if (addonSettingsResponse.error) {
          throw addonSettingsResponse.error;
        }
        if (sameDayCheckoutResponse.error) {
          throw sameDayCheckoutResponse.error;
        }
        if (sameDayCheckinResponse.error) {
          throw sameDayCheckinResponse.error;
        }
        if (confirmedRangesResponse.error) {
          throw confirmedRangesResponse.error;
        }

        const operationalSettings = parseAddonOperationalSetting(addonSettingsResponse.data?.value);
        const mergedAddons = mergeAddonsWithOperationalSettings(addonsResponse.data ?? [], operationalSettings);
        const confirmedRanges = (confirmedRangesResponse.data ?? []).filter(
          (range): range is ConfirmedRange =>
            typeof range.check_in === "string" && typeof range.check_out === "string",
        );
        const deadDayOfferSuggestion = detectDeadDayOfferSuggestion(check_in, check_out, confirmedRanges);
        const sameDayContext = {
          has_same_day_checkout: (sameDayCheckoutResponse.data ?? []).length > 0,
          has_same_day_checkin: (sameDayCheckinResponse.data ?? []).length > 0,
        };
        const selectedAddonAuditRows = mergedAddons
          .filter((addon) => selectedAddonIds.includes(addon.id))
          .map((addon) => ({
            id: addon.id,
            label: addon.label,
            preparation_time_hours: addon.preparation_time_hours ?? null,
            requires_approval: addon.requires_approval ?? false,
            enforcement_mode: addon.enforcement_mode ?? null,
          }));
        const addonAudit = runAddonAudit({
          addons: selectedAddonAuditRows,
          check_in,
          check_out,
          same_day_context: sameDayContext,
        });
        const addonStatuses = new Map(addonAudit.items.map((item) => [item.id, item.status]));
        const addonAuditItems = new Map(addonAudit.items.map((item) => [item.id, item]));
        addonsSnapshotData = mergedAddons
          .filter((addon) => selectedAddonIds.includes(addon.id))
          .map((addon) => {
            const auditItem = addonAuditItems.get(addon.id);
            const addonTimingType = getAddonTimingType(addon);

            // Phase 12E Batch 7: lift price computation to capture base for admin display metadata.
            const addonBase = (
              addon.pricing_type === "percentage" &&
              typeof addon.percentage_value === "number" &&
              addon.percentage_value > 0 &&
              pricingSnapshotData !== null
            )
              ? Math.round(
                  (addon.percentage_value / 100) *
                    (
                      pricingSnapshotData.pricing_snapshot.adjusted_stay_subtotal ??
                      pricingSnapshotData.pricing_snapshot.subtotal ??
                      pricingSnapshotData.pricing_subtotal
                    )
                )
              : addon.price ?? null;

            const discountEntry = discountedPriceMap.get(addon.id) ?? null;
            const expectedDiscountPrice =
              addonBase !== null ? Math.round(addonBase * (1 - DEAD_DAY_DISCOUNT_PCT)) : null;
            const deadDayOfferEligible =
              addonTimingType === "early_checkin"
                ? deadDayOfferSuggestion.suggestEarlyCheckin
                : addonTimingType === "late_checkout"
                  ? deadDayOfferSuggestion.suggestLateCheckout
                  : false;
            const shouldApplyDeadDayDiscount =
              addonBase !== null &&
              deadDayOfferEligible &&
              expectedDiscountPrice !== null &&
              expectedDiscountPrice >= 0 &&
              expectedDiscountPrice < addonBase &&
              (
                discountEntry === "flag_only" ||
                (typeof discountEntry === "number" && Math.round(discountEntry) === expectedDiscountPrice)
              );
            let addonFinalPrice: number | null = addonBase;
            if (shouldApplyDeadDayDiscount && expectedDiscountPrice !== null) {
              addonFinalPrice = expectedDiscountPrice;
            }
            const addonIsDiscounted =
              addonFinalPrice !== null && addonBase !== null && addonFinalPrice < addonBase;
            const addonSavings =
              addonIsDiscounted && addonBase !== null && addonFinalPrice !== null
                ? addonBase - addonFinalPrice
                : null;

            return {
              id: addon.id,
              label: addon.label,
              price: addonFinalPrice,
              category: addon.category ?? null,
              preparation_time_hours: addon.preparation_time_hours ?? null,
              enforcement_mode: addon.enforcement_mode ?? null,
              requires_approval: addon.requires_approval ?? false,
              status: addonStatuses.get(addon.id) ?? "confirmed",
              ...(addon.pricing_type === "percentage" ? { pricing_type: "percentage" as const } : {}),
              ...(addonIsDiscounted ? { original_price: addonBase } : {}),
              ...(addonIsDiscounted
                ? {
                    offer_applied: true as const,
                    offer_type: "dead_day" as const,
                    savings: addonSavings!,
                  }
                : {}),
              ...(auditItem?.same_day_warning ? { same_day_warning: auditItem.same_day_warning } : {}),
            };
          });

        const addonOperationalAudit = mergedAddons
          .filter((addon) => selectedAddonIds.includes(addon.id))
          .map((addon) => {
            const auditItem = addonAuditItems.get(addon.id);
            const enforcementMode = getAddonEnforcementMode(addon.enforcement_mode);
            const preparationTimeHours = addon.preparation_time_hours ?? null;
            const timingType = getAddonTimingType(addon);
            const sameDayWarning =
              auditItem?.same_day_warning === "same_day_checkout"
                ? "May not be available due to a same-day checkout."
                : auditItem?.same_day_warning === "same_day_checkin"
                  ? "May not be available due to a same-day check-in."
                  : null;

            return {
              addon_label: addon.label,
              addon_timing_type: timingType,
              required_advance_notice: preparationTimeHours ? formatPreparationTime(preparationTimeHours) : null,
              operational_mode: enforcementMode,
              requires_approval: addon.requires_approval ?? false,
              same_day_warning: sameDayWarning,
              audit_result: getAddonAuditResultLabel({
                available: auditItem?.available ?? true,
                has_time_warning: auditItem?.has_time_warning ?? false,
                has_same_day_warning: auditItem?.same_day_warning !== null,
                requires_approval: addon.requires_approval ?? false,
                enforcement_mode: enforcementMode,
              }),
            };
          });

        console.info("[api/bookings] addon operational audit", {
          villa,
          check_in,
          check_out,
          addons: addonOperationalAudit,
        });

        const strictViolations = addonOperationalAudit.filter((item) => item.audit_result === "strict_violation");
        if (strictViolations.length > 0) {
          return NextResponse.json(
            { error: "One or more selected add-ons require more advance notice." },
            { status: 400 }
          );
        }

        if (process.env.NODE_ENV !== "production") {
          console.debug("[addon-dry-run]", {
            ok: addonAudit.ok,
            items: addonAudit.items,
            would_block_reasons: addonAudit.would_block_reasons,
            warnings: addonAudit.warnings,
            addon_ids: selectedAddonIds,
          });
        }
      }
    } catch (addonAuditError) {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[api/bookings] addon audit skipped", addonAuditError);
      }
    }

    if (addonsSnapshotData) {
      insertData.addons_snapshot = addonsSnapshotData.length > 0 ? addonsSnapshotData : null;
    }

    if (pricingSnapshotData) {
      let internalIntelligence = buildUnavailableInternalPricingIntelligence();

      try {
        const bedrooms = parseBedroomCountFromMessage(message) ?? 3;
        const guests = parseInt(sleeping_guests, 10) || 0;
        const eventInquiry = detectEventInquiry(message);
        const servicesCount = eventInquiry ? parseRequestedServiceCount(message) : 0;
        const addonsValue = (addonsSnapshotData ?? []).reduce((sum, addon) => {
          return sum + (typeof addon.price === "number" && Number.isFinite(addon.price) ? addon.price : 0);
        }, 0);
        const addonsCount = addonsSnapshotData?.length ?? 0;
        internalIntelligence = computeInternalPricingIntelligence({
          fullVillaBase:
            pricingSnapshotData.pricing_snapshot.full_villa_subtotal ??
            pricingSnapshotData.pricing_subtotal,
          bedrooms,
          guests,
          addonsValue,
          addonsCount,
          eventInquiry,
          servicesCount,
        });

      } catch (internalIntelligenceError) {
        console.error("[api/bookings] pricing intelligence unavailable:", internalIntelligenceError);
      }

      pricingSnapshotData.pricing_snapshot = {
        ...pricingSnapshotData.pricing_snapshot,
        estimated_total:
          (pricingSnapshotData.pricing_snapshot.adjusted_stay_subtotal ??
            pricingSnapshotData.pricing_snapshot.subtotal ??
            0) +
          (addonsSnapshotData ?? []).reduce((sum, addon) => {
            return sum + (typeof addon.price === "number" && Number.isFinite(addon.price) ? addon.price : 0);
          }, 0),
        internal_intelligence: internalIntelligence,
      };
      insertData.pricing_snapshot = pricingSnapshotData.pricing_snapshot;
    }

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("[api/bookings] insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    try {
      const { data: settingsRows, error: settingsErr } = await supabaseAdmin
        .from("settings")
        .select("value")
        .eq("key", "notification_emails")
        .single();

      if (settingsErr) {
        console.error("[api/bookings] notification_emails lookup error:", settingsErr.message);
      }

      const rawEmails = settingsRows?.value ?? "";
      const recipients = rawEmails.split(",").map((e: string) => e.trim()).filter(Boolean);

      console.log(`[api/bookings] notification recipients (${recipients.length}):`, recipients);

      if (recipients.length > 0) {
        let requesterName  = data.guest_name ?? "Guest";
        let requesterEmail = data.guest_email ?? "";
        let requesterPhone = data.guest_phone ?? null;

        if (data.member_id) {
          try {
            const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(data.member_id);
            requesterEmail = authUser?.user?.email ?? requesterEmail;
            const { data: memberRow } = await supabaseAdmin
              .from("members")
              .select("full_name, phone")
              .eq("id", data.member_id)
              .single();
            if (memberRow) {
              requesterName = memberRow.full_name ?? requesterName;
              requesterPhone = memberRow.phone ?? requesterPhone;
            }
          } catch (memberErr) {
            console.warn("[api/bookings] member lookup error (falling back to guest fields):", memberErr);
          }
        }

        const base = process.env.NEXT_PUBLIC_SITE_URL || SITE_URL;
        const adminUrl = base + "/admin";

        const { token: confirmToken, jti: confirmJti, exp: confirmExp } = createActionToken(data.id, "confirmed");
        const { token: cancelToken, jti: cancelJti, exp: cancelExp } = createActionToken(data.id, "cancelled");

        const { error: tokenInsertErr } = await supabaseAdmin.from("booking_action_tokens").insert([
          { jti: confirmJti, booking_id: data.id, action: "confirmed", expires_at: new Date(confirmExp * 1000).toISOString() },
          { jti: cancelJti, booking_id: data.id, action: "cancelled", expires_at: new Date(cancelExp * 1000).toISOString() },
        ]);
        if (tokenInsertErr) {
          console.error("[api/bookings] token row insert failed — action links omitted from email.", {
            message: tokenInsertErr.message,
            code:    tokenInsertErr.code,
            details: tokenInsertErr.details,
            hint:    tokenInsertErr.hint,
          });
        }

        const confirmUrl = tokenInsertErr ? undefined : `${base}/api/booking-action?token=${confirmToken}`;
        const cancelUrl  = tokenInsertErr ? undefined : `${base}/api/booking-action?token=${cancelToken}`;

        await sendBookingRequestEmail({
          recipients,
          booking_id:      data.id,
          requester_name:  requesterName,
          requester_email: requesterEmail,
          requester_phone: requesterPhone,
          villa:           data.villa,
          check_in:        data.check_in,
          check_out:       data.check_out,
          sleeping_guests: data.sleeping_guests,
          day_visitors:    data.day_visitors,
          event_type:      data.event_type ?? null,
          message:         data.message ?? null,
          addons:          Array.isArray(data.addons) ? data.addons : [],
          addons_snapshot: Array.isArray(data.addons_snapshot) ? data.addons_snapshot : null,
          pricing_subtotal: data.pricing_subtotal ?? null,
          pricing_snapshot: data.pricing_snapshot ?? null,
          created_at:      data.created_at,
          admin_url:       adminUrl,
          confirm_url:     confirmUrl,
          cancel_url:      cancelUrl,
        });
      }
    } catch (emailErr) {
      console.error("[api/bookings] notification email error:", emailErr);
    }

    // Phase 6: best-effort guest "booking received" email with view link.
    // Independent of admin notification; never blocks the response.
    try {
      let guestEmail: string | null = null;
      let guestName  = data.guest_name ?? "Guest";

      if (data.member_id) {
        const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(data.member_id);
        if (user?.email) guestEmail = user.email;
        const { data: memberRow } = await supabaseAdmin
          .from("members")
          .select("full_name")
          .eq("id", data.member_id)
          .single();
        if (memberRow?.full_name) guestName = memberRow.full_name;
      } else if (data.guest_email) {
        guestEmail = data.guest_email;
      }

      if (guestEmail) {
        await sendBookingPendingEmail({
          to:         guestEmail,
          name:       guestName,
          villa:      data.villa,
          check_in:   data.check_in,
          check_out:  data.check_out,
          booking_id: data.id,
          sleeping_guests: data.sleeping_guests,
          day_visitors:    data.day_visitors,
          event_type:      data.event_type ?? null,
          message:         data.message ?? null,
          addons:          Array.isArray(data.addons) ? data.addons : [],
          addons_snapshot: Array.isArray(data.addons_snapshot) ? data.addons_snapshot : null,
          pricing_subtotal: data.pricing_subtotal ?? null,
          pricing_snapshot: data.pricing_snapshot ?? null,
        });
      }
    } catch (pendingEmailErr) {
      console.error("[api/bookings] guest pending email error:", pendingEmailErr);
    }

    return NextResponse.json({ booking: data });
  } catch (err) {
    console.error("[api/bookings] unexpected error:", err);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}
