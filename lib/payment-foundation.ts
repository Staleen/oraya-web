/**
 * Phase 15I.1 — booking-level payment foundation (totals + ledger stage).
 * Mirrors admin `getBookingPaymentBasis` / stay revenue so `amount_total` stays aligned
 * with existing pricing snapshots (no new pricing engine).
 */
import { isEventInquiryPayload } from "@/lib/event-inquiry-message";
import { roundMoney } from "@/lib/money";

export type PaymentFoundationStage = "none" | "unpaid" | "partially_paid" | "fully_paid";

export interface PaymentFoundationBookingInput {
  event_type: string | null;
  message: string | null;
  proposal_total_amount?: number | null;
  proposal_deposit_amount?: number | null;
  deposit_amount?: number | null;
  pricing_subtotal?: number | null;
  pricing_snapshot?: {
    adjusted_stay_subtotal?: number | null;
    subtotal?: number | null;
    estimated_total?: number | null;
    internal_intelligence?: {
      stay_value?: number | null;
      addons_value?: number | null;
      estimated_total?: number | null;
      internal_value?: number | null;
    } | null;
  } | null;
  addons_snapshot?: ReadonlyArray<{ price?: number | null }> | null;
}

function snapshotNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getAddonSnapshots(booking: PaymentFoundationBookingInput) {
  return booking.addons_snapshot ?? [];
}

function getPricingIntelligenceMeta(booking: PaymentFoundationBookingInput) {
  return booking.pricing_snapshot?.internal_intelligence ?? null;
}

function getPersistedStayValue(booking: PaymentFoundationBookingInput): number | null {
  const adjustedStaySubtotal =
    snapshotNumber(booking.pricing_snapshot?.adjusted_stay_subtotal) ??
    snapshotNumber(booking.pricing_snapshot?.subtotal);
  if (adjustedStaySubtotal !== null) return adjustedStaySubtotal;
  if (typeof booking.pricing_subtotal === "number" && Number.isFinite(booking.pricing_subtotal)) {
    return booking.pricing_subtotal;
  }
  return null;
}

function getBookingRevenueDataForFoundation(booking: PaymentFoundationBookingInput) {
  const pricingIntelligence = getPricingIntelligenceMeta(booking);
  const addonSubtotalRaw = getAddonSnapshots(booking).reduce((sum, addon) => {
    return sum + (typeof addon.price === "number" && Number.isFinite(addon.price) ? addon.price : 0);
  }, 0);
  const stayValueRaw =
    snapshotNumber(booking.pricing_snapshot?.adjusted_stay_subtotal) ??
    snapshotNumber(booking.pricing_snapshot?.subtotal) ??
    pricingIntelligence?.stay_value ??
    getPersistedStayValue(booking);
  const addonsValueRaw =
    pricingIntelligence?.addons_value ?? (getAddonSnapshots(booking).length > 0 ? addonSubtotalRaw : 0);
  const estimatedTotalRaw =
    snapshotNumber(booking.pricing_snapshot?.estimated_total) ??
    pricingIntelligence?.estimated_total ??
    pricingIntelligence?.internal_value ??
    (typeof stayValueRaw === "number" && typeof addonsValueRaw === "number" ? stayValueRaw + addonsValueRaw : null);

  return { estimatedTotalRaw };
}

/** Contract total for ledger: event proposal total when set, else stay estimated total. */
export function getFoundationAmountTotal(booking: PaymentFoundationBookingInput): number | null {
  if (isEventInquiryPayload(booking.event_type, booking.message)) {
    const proposalTotal = booking.proposal_total_amount;
    if (typeof proposalTotal === "number" && Number.isFinite(proposalTotal)) {
      return roundMoney(proposalTotal);
    }
    return null;
  }
  const { estimatedTotalRaw } = getBookingRevenueDataForFoundation(booking);
  if (typeof estimatedTotalRaw === "number" && Number.isFinite(estimatedTotalRaw)) {
    return roundMoney(estimatedTotalRaw);
  }
  return null;
}

/** Deposit shown in Payment Overview: proposal deposit for events, else requested deposit column. */
export function getFoundationDepositDisplay(booking: PaymentFoundationBookingInput): number | null {
  if (isEventInquiryPayload(booking.event_type, booking.message)) {
    const pd = booking.proposal_deposit_amount;
    if (typeof pd === "number" && Number.isFinite(pd)) return roundMoney(pd);
    return null;
  }
  const d = booking.deposit_amount;
  if (typeof d === "number" && Number.isFinite(d)) return roundMoney(d);
  return null;
}

export function derivePaymentFoundationStage(
  amountPaid: number,
  amountTotal: number | null,
): PaymentFoundationStage {
  if (amountTotal === null || !Number.isFinite(amountTotal) || amountTotal <= 0) {
    return amountPaid > 0 ? "partially_paid" : "none";
  }
  const paid = roundMoney(Math.max(0, amountPaid));
  const total = roundMoney(amountTotal);
  if (paid <= 0) return "unpaid";
  if (paid < total) return "partially_paid";
  return "fully_paid";
}

export function computeFoundationAmountDue(amountTotal: number | null, amountPaid: number): number | null {
  if (amountTotal === null || !Number.isFinite(amountTotal)) return null;
  return roundMoney(Math.max(0, roundMoney(amountTotal) - roundMoney(Math.max(0, amountPaid))));
}
