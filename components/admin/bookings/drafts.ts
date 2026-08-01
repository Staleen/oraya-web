import type { Booking } from "../types";
import {
  createEventServiceKey,
  isEventInquiryBooking,
  parseAmountInput,
  parseLineItemNumber,
  parseRequestedEventServicesFromMessage,
  sumProposalLineItemDrafts,
  toDateTimeLocalInput,
  type PaymentDraft,
  type ProposalDraft,
  type ProposalLineItemDraft,
} from "./helpers";
import { isEventInquiryPayload, parseEventSetupEstimateFromMessage } from "@/lib/event-inquiry-message";
import { computeDefaultProposalValidUntilInputValue, computeProposalDepositFromTotal } from "@/lib/event-proposal-defaults";
import { roundMoney } from "@/lib/money";

/**
 * Remediation 2 (B.1) — pure draft seeding, extracted verbatim from
 * BookingsTable so the memoized section components can compute the effective
 * draft from `draftSlice ?? buildInitial...(booking)` without re-creating
 * objects in the parent on every render.
 */

export function buildInitialPaymentDraftFromBooking(booking: Booking): PaymentDraft {
  // Bug 8: for confirmed event inquiries, default the deposit to the proposal deposit (not stay deposit_amount).
  const proposalDepositForEvent =
    isEventInquiryPayload(booking.event_type, booking.message) &&
    typeof booking.proposal_deposit_amount === "number" &&
    Number.isFinite(booking.proposal_deposit_amount)
      ? booking.proposal_deposit_amount
      : null;
  const depositSeed =
    booking.deposit_amount != null
      ? String(booking.deposit_amount)
      : proposalDepositForEvent != null
        ? String(proposalDepositForEvent)
        : "";
  const dueDateSeed = toDateTimeLocalInput(booking.payment_due_at) || (() => {
    // Bug 8: default the payment due date to the proposal payment deadline (proposal_valid_until).
    if (
      isEventInquiryPayload(booking.event_type, booking.message) &&
      typeof booking.proposal_valid_until === "string" &&
      booking.proposal_valid_until.trim()
    ) {
      return toDateTimeLocalInput(booking.proposal_valid_until);
    }
    return "";
  })();
  return {
    depositAmount: depositSeed,
    dueAt: dueDateSeed,
    requestNote: "",
    paymentAmount: "",
    paymentMethod: booking.payment_method ?? "whish",
    paymentReference: booking.payment_reference ?? "",
    paymentNotes: "",
    refundAmount: booking.refund_amount != null ? String(booking.refund_amount) : "",
    refundNote: "",
    refundReference: "",
  };
}

export function buildInitialProposalDraftFromBooking(booking: Booking): ProposalDraft {
  const requestedServices = parseRequestedEventServicesFromMessage(booking.message);
  const persistedIncluded = Array.isArray(booking.proposal_included_services)
    ? booking.proposal_included_services
    : [];

  const estimate = isEventInquiryBooking(booking) ? parseEventSetupEstimateFromMessage(booking.message) : null;
  const estimateLineByLabel = new Map<string, { unit_price: number; line_total: number; quantity: number }>();
  for (const line of estimate?.lines ?? []) {
    estimateLineByLabel.set(line.label.trim().toLowerCase(), {
      unit_price: line.unit_price,
      line_total: line.line_total,
      quantity: line.quantity,
    });
  }

  /**
   * Phase 15H — seed the line-item draft.
   *
   * - If the proposal already has persisted line items, use them (preserves admin edits, custom rows, declined flags).
   * - Otherwise, build from the guest-requested services with unit_price seeded from the inquiry estimate when available.
   */
  const lineItems: ProposalLineItemDraft[] = [];
  if (persistedIncluded.length > 0) {
    for (const svc of persistedIncluded) {
      const key = createEventServiceKey(svc.id?.toString().trim() || svc.label || `line-${lineItems.length + 1}`);
      const labelLower = (svc.label ?? "").trim().toLowerCase();
      const fallback = estimateLineByLabel.get(labelLower);
      const unitPriceNum =
        typeof svc.unit_price === "number" && Number.isFinite(svc.unit_price)
          ? svc.unit_price
          : fallback?.unit_price ?? null;
      lineItems.push({
        key,
        id: svc.id ?? null,
        label: svc.label ?? "",
        quantity:
          typeof svc.quantity === "number" && Number.isFinite(svc.quantity) && svc.quantity > 0
            ? String(svc.quantity)
            : "1",
        unitLabel: svc.unit_label ?? "",
        unitPrice: unitPriceNum != null ? String(unitPriceNum) : "",
        notes: svc.notes ?? "",
        source: svc.source === "custom" ? "custom" : "requested",
        included: svc.admin_status !== "declined",
      });
    }
  } else {
    for (const svc of requestedServices) {
      const labelLower = svc.label.trim().toLowerCase();
      const fallback = estimateLineByLabel.get(labelLower);
      const qtyNum =
        typeof svc.quantity === "number" && Number.isFinite(svc.quantity) && svc.quantity > 0
          ? svc.quantity
          : fallback?.quantity ?? 1;
      lineItems.push({
        key: svc.key,
        id: svc.id ?? null,
        label: svc.label,
        quantity: String(qtyNum),
        unitLabel: svc.unit_label ?? "",
        unitPrice: fallback ? String(fallback.unit_price) : "",
        notes: "",
        source: "requested",
        included: true,
      });
    }
  }

  /**
   * Phase 15H.1 — deposit prefill is FIRST DRAFT ONLY.
   * If the booking already has a saved `proposal_deposit_amount`, use it as-is.
   * Otherwise (new draft), seed at 50% of the computed total, rounded up to the nearest $100
   * (`computeProposalDepositFromTotal`). After this seed runs, no auto-sync ever fires —
   * `setProposalLineItems` doesn't touch the deposit.
   */
  const computedTotal = sumProposalLineItemDrafts(lineItems);
  const savedDepNum =
    typeof booking.proposal_deposit_amount === "number" && Number.isFinite(booking.proposal_deposit_amount)
      ? booking.proposal_deposit_amount
      : null;
  const firstDraftDepositSeed =
    computedTotal > 0 ? roundMoney(computeProposalDepositFromTotal(computedTotal)) : null;
  const defaultDeposit =
    savedDepNum != null
      ? String(roundMoney(savedDepNum))
      : firstDraftDepositSeed != null
        ? String(firstDraftDepositSeed)
        : "";
  const persistedDeadline = toDateTimeLocalInput(booking.proposal_valid_until);
  const defaultValidUntil =
    persistedDeadline ||
    (isEventInquiryBooking(booking) && booking.check_in ? computeDefaultProposalValidUntilInputValue(booking.check_in) : "");
  const deadlineManuallyEditedInit = Boolean(persistedDeadline);

  return {
    lineItems,
    depositAmount: defaultDeposit,
    validUntil: defaultValidUntil,
    excludedServices: booking.proposal_excluded_services ?? "",
    optionalServices: booking.proposal_optional_services ?? "",
    proposalNotes: booking.proposal_notes ?? "",
    paymentMethods:
      Array.isArray(booking.proposal_payment_methods) && booking.proposal_payment_methods.length > 0
        ? booking.proposal_payment_methods
        : ["whish", "bank_transfer", "cash"],
    deadlineManuallyEdited: deadlineManuallyEditedInit,
  };
}

export function validateProposalForSend(draft: ProposalDraft): { ok: true } | { ok: false; error: string } {
  const includedLines = draft.lineItems.filter((line) => line.included);
  if (includedLines.length === 0) {
    return { ok: false, error: "Add at least one billable line item before sending the proposal." };
  }
  for (const line of includedLines) {
    if (!line.label.trim()) {
      return { ok: false, error: "Every billable line item needs a service name." };
    }
    const qty = parseLineItemNumber(line.quantity);
    if (qty <= 0) {
      return { ok: false, error: `Quantity must be greater than zero for "${line.label.trim() || "line item"}".` };
    }
    if (line.unitPrice.trim() === "") {
      return { ok: false, error: `Set a unit price for "${line.label.trim()}".` };
    }
    const unit = Number(line.unitPrice);
    if (!Number.isFinite(unit) || unit < 0) {
      return { ok: false, error: `Unit price for "${line.label.trim()}" is invalid.` };
    }
  }
  const total = sumProposalLineItemDrafts(draft.lineItems);
  if (!(total > 0)) {
    return { ok: false, error: "Proposal total must be greater than zero." };
  }
  const deposit = parseAmountInput(draft.depositAmount);
  if (deposit !== null && deposit > total) {
    return { ok: false, error: "Deposit cannot exceed the proposal total." };
  }
  if (draft.paymentMethods.length === 0) {
    return { ok: false, error: "Choose at least one payment method before sending." };
  }
  if (!draft.validUntil) {
    return { ok: false, error: "Set a payment deadline before sending the proposal." };
  }
  // Audit B-12: an expired proposal keeps its old deadline in the seeded
  // draft — sending (or resending) with a deadline that is not in the future
  // would reach the guest already expired. (datetime-local value; JS Date
  // parsing is fine here — the date-only check_in/check_out rule is separate.)
  const validUntilMs = new Date(draft.validUntil).getTime();
  if (!Number.isFinite(validUntilMs)) {
    return { ok: false, error: "The payment deadline is not a valid date." };
  }
  if (validUntilMs <= Date.now()) {
    return { ok: false, error: "The payment deadline is in the past — set a new future deadline before sending." };
  }
  return { ok: true };
}
