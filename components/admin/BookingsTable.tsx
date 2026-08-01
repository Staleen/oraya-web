"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Booking, BookingAddonSnapshot, BookingProposalIncludedService, Member } from "./types";
import { AddonIcon } from "@/components/addon-icon";
import { SkeletonBlock, SkeletonText } from "@/components/LoadingSkeleton";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { BORDER, fieldStyle, fmt, GOLD, LATO, MIDNIGHT, MUTED, PLAYFAIR, WHITE } from "./theme";
import { addDaysToDateOnly, getOperationalRange, rangesOverlap } from "@/lib/calendar/event-block";
import { findAlternativeDateSuggestions, type AlternativeSuggestion } from "@/lib/calendar/alternative-dates";
import { adminApiFetchInit } from "@/lib/admin-auth";
import {
  buildEventFeedbackRequestMessage,
  buildMailtoFeedbackUrl,
  buildStayFeedbackRequestMessage,
  buildWhatsAppFeedbackUrl,
} from "@/lib/feedback-request-message";
import { isFeedbackEmailCooldownActive } from "@/lib/booking-feedback-eligibility";
import {
  extractEventInquiryGuestNotesLine,
  EVENT_SETUP_ESTIMATE_PREFIX,
  isEventInquiryPayload,
  parseEventSetupEstimateFromMessage,
  stripEventSetupEstimateFromMessage,
} from "@/lib/event-inquiry-message";
import { computeDefaultProposalValidUntilInputValue, computeProposalDepositFromTotal } from "@/lib/event-proposal-defaults";
import { roundMoney, sumMoney } from "@/lib/money";
import {
  computeFoundationAmountDue,
  derivePaymentFoundationStage,
  getFoundationAmountTotal,
  getFoundationDepositDisplay,
} from "@/lib/payment-foundation";
import { formatPaymentMethodLabel as formatPaymentMethodLabelShared } from "@/lib/payment-method-labels";

import {
  BookingSectionKey,
  ConfirmedSortKey,
  DeadDayUpsellOpportunity,
  PaymentDraft,
  ProposalLineItemDraft,
  ProposalDraft,
  EVENT_PROPOSAL_PAYMENT_METHODS,
  StatusBadge,
  getSectionTone,
  getCardAccent,
  getAddonStatusTone,
  getOperationalBadgeStyle,
  formatAddonPrice,
  formatMoney,
  parseAmountInput,
  formatDateTimeValue,
  toDateTimeLocalInput,
  formatAdvisoryLabel,
  createEventServiceKey,
  createCustomLineItemKey,
  parseLineItemNumber,
  computeProposalLineTotal,
  sumProposalLineItemDrafts,
  formatEventProposalServiceLabel,
  isProposalExpired,
  getPricingIntelligenceMeta,
  getSnapshotNumber,
  getPersistedStayValue,
  getBookingPaymentBasis,
  getPaymentStatus,
  isPaymentOverdue,
  isPaymentDueSoon,
  getBookingTotal,
  getStaySubtotalForOverlapComparison,
  getOverlapComparisonTotal,
  getPaymentStatusStyle,
  renderPaymentStatusBadge,
  renderFoundationLedgerBadge,
  renderRevenueEstimateRow,
  getAddonRiskWarning,
  hasResolvedAddonStatus,
  addonHasTrackedOffer,
  hasDiscountPriceMetadata,
  addonNeedsAttention,
  sortByNewest,
  sortConfirmedBookings,
  bookingDateRangesOverlap,
  isEventInquiryBooking,
  computeDefaultProposalPanelOpen,
  computeDefaultPaymentPanelOpen,
  cancelFlowLikelySendsEmail,
  buildAlternativeOfferMessage,
  parseRequestedEventServicesFromMessage,
  eventInquiryNightCount,
  dateOnlyGapDays,
  isBookingCheckedOutAfter,
  formatEventOrStayDateLine,
  getCompletedHistoryTotalDisplay,
  getBookingGuestEmailForFeedback,
  getBookingGuestPhoneForFeedback,
  getBookingGuestDisplayName,
  completedHistoryFeedbackLine,
  renderOperationalBadge,
} from "./bookings/helpers";
import { requestAddonResolution } from "./bookings/approve-addon";
import { bookingMatchesSearch, formatBookingRef } from "./bookings/booking-ref";
import ConfirmDialog from "./ConfirmDialog";
import { buildInitialPaymentDraftFromBooking, buildInitialProposalDraftFromBooking, validateProposalForSend } from "./bookings/drafts";
import type { BookingCardActions } from "./bookings/actions";
import { PaymentSection } from "./bookings/PaymentSection";
import { ProposalSection } from "./bookings/ProposalSection";
import { AddonRows } from "./bookings/AddonRows";
import { CompactRow } from "./bookings/CompactRow";
import { ExpandedBookingDetails } from "./bookings/ExpandedBookingDetails";

export default function BookingsTable({
  loading,
  filteredBookings: _filteredBookings,
  members,
  isMobile,
  statusFilter,
  setStatusFilter,
  villaFilter,
  setVillaFilter,
  dateFilter,
  setDateFilter,
  clearFilters,
  villaOptions,
  updatingId,
  updateStatus,
  emailWarnings,
  reportSendWarning,
}: {
  loading: boolean;
  filteredBookings: Booking[];
  members: Member[];
  isMobile: boolean;
  statusFilter: "all" | "pending" | "confirmed" | "cancelled";
  setStatusFilter: (value: "all" | "pending" | "confirmed" | "cancelled") => void;
  villaFilter: string;
  setVillaFilter: (value: string) => void;
  dateFilter: string;
  setDateFilter: (value: string) => void;
  clearFilters: () => void;
  villaOptions: string[];
  updatingId: string | null;
  updateStatus: (id: string, status: "confirmed" | "cancelled") => void;
  emailWarnings: Record<string, string>;
  reportSendWarning: (text: string) => void;
}) {
  const { bookings, setBookings, setError, loadData, setPollingPaused } = useAdminData();
  const [approvingAddonId, setApprovingAddonId] = useState<string | null>(null);
  const [feedbackPrepBookingId, setFeedbackPrepBookingId] = useState<string | null>(null);
  const [feedbackCopiedBookingId, setFeedbackCopiedBookingId] = useState<string | null>(null);
  const [feedbackEmailModalBookingId, setFeedbackEmailModalBookingId] = useState<string | null>(null);
  const [feedbackEmailSendingId, setFeedbackEmailSendingId] = useState<string | null>(null);
  const [arrivalLinkFetchingId, setArrivalLinkFetchingId] = useState<string | null>(null);
  const [arrivalLinkCopiedBookingId, setArrivalLinkCopiedBookingId] = useState<string | null>(null);
  const [expandedCompactId, setExpandedCompactId] = useState<string | null>(null);
  const [bulkActionBookingId, setBulkActionBookingId] = useState<string | null>(null);
  const [confirmedSort, setConfirmedSort] = useState<ConfirmedSortKey>("created_desc");
  const [hiddenCancelledIds, setHiddenCancelledIds] = useState<string[]>([]);
  // Audit G1 (B-1): free-text search over reference / id / name / email / phone.
  const [bookingSearch, setBookingSearch] = useState("");
  // Audit B-3: ConfirmDialog gate for the confirm direction — names the guest
  // email + WhatsApp sends before anything fires. `proceed` runs the exact
  // pre-existing action; the dialog adds disclosure only.
  const [confirmGate, setConfirmGate] = useState<{
    booking: Booking;
    pendingAddonCount: number;
    proceed: () => Promise<void> | void;
  } | null>(null);
  const [confirmGateBusy, setConfirmGateBusy] = useState(false);
  // Audit B-4: bookings whose latest proposal send returned email_sent=false —
  // the "sent" status must not present as a successful send for these.
  const [proposalEmailFailedIds, setProposalEmailFailedIds] = useState<Set<string>>(new Set());
  const [paymentUpdatingId, setPaymentUpdatingId] = useState<string | null>(null);
  const [paymentDrafts, setPaymentDrafts] = useState<Record<string, PaymentDraft>>({});
  const [proposalDrafts, setProposalDrafts] = useState<Record<string, ProposalDraft>>({});
  // Phase 14L: offer-prep panel state. Key = `${bookingId}:${suggestion.label}`.
  const [activeOfferKey, setActiveOfferKey] = useState<string | null>(null);
  const [copiedOfferKey, setCopiedOfferKey] = useState<string | null>(null);
  /** Phase 15I.2 — per-booking collapsible panels (undefined = use default for that panel). */
  const [bookingCardPanels, setBookingCardPanels] = useState<
    Record<string, Partial<Record<"proposal" | "payment" | "guestDetail" | "operationsContext" | "feedback" | "addons", boolean>>>
  >({});

  // Remediation 5.2 — hold the 45s background poll while a payment edit is in
  // flight so an interleaved poll response can't clobber the optimistic state.
  useEffect(() => {
    // Audit X-2 — the pause previously covered only payment PATCHes, leaving
    // add-on resolution and bulk approve-and-confirm exposed to a silent load
    // landing mid-mutation and clobbering optimistic state.
    setPollingPaused(paymentUpdatingId !== null || approvingAddonId !== null || confirmGateBusy);
    return () => setPollingPaused(false);
  }, [paymentUpdatingId, approvingAddonId, confirmGateBusy, setPollingPaused]);

  async function patchAddonResolution(bookingId: string, addonId: string, decision: "approve" | "decline") {
    const addonsSnapshot = await requestAddonResolution(bookingId, addonId, decision);
    setBookings((prev) =>
      prev.map((booking) =>
        booking.id === bookingId ? { ...booking, addons_snapshot: addonsSnapshot } : booking,
      ),
    );
    return addonsSnapshot;
  }

  async function confirmSendFeedbackEmail() {
    const id = feedbackEmailModalBookingId;
    if (!id) return;
    setFeedbackEmailSendingId(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/bookings/${id}/send-feedback`, {
        ...adminApiFetchInit,
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      let data: { error?: string; booking?: Booking } = {};
      try {
        data = (await res.json()) as { error?: string; booking?: Booking };
      } catch {
        data = {};
      }
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Could not send feedback email.");
        return;
      }
      if (data.booking && typeof data.booking === "object" && data.booking.id) {
        setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, ...data.booking } : b)));
      }
      await loadData(true);
      setFeedbackEmailModalBookingId(null);
    } catch (error) {
      // Remediation 2.4: same failure discipline as patchBookingRecord —
      // a network error must surface instead of rejecting unhandled.
      console.error("[admin] feedback email send error:", error);
      setError("Could not send feedback email.");
    } finally {
      setFeedbackEmailSendingId(null);
    }
  }

  // Phase 16C Stage 4A — mint + copy the personalized Arrival Guide link for a
  // confirmed booking so the operator can paste it to the guest on WhatsApp
  // manually. The token is fetched only when the operator clicks and is never
  // rendered in the UI; non-confirmed bookings are refused server-side too.
  async function copyArrivalGuideLink(booking: Booking) {
    if (booking.status !== "confirmed") return;
    setArrivalLinkFetchingId(booking.id);
    setError("");
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}/arrival-link`, adminApiFetchInit);
      let data: { error?: string; arrival_guide_url?: string } = {};
      try {
        data = (await res.json()) as { error?: string; arrival_guide_url?: string };
      } catch {
        data = {};
      }
      if (!res.ok || typeof data.arrival_guide_url !== "string" || !data.arrival_guide_url) {
        setError(
          data.error === "booking_not_confirmed"
            ? "Arrival Guide links are only available for confirmed bookings."
            : "Could not generate the Arrival Guide link.",
        );
        return;
      }
      await navigator.clipboard.writeText(data.arrival_guide_url);
      setArrivalLinkCopiedBookingId(booking.id);
      setTimeout(() => setArrivalLinkCopiedBookingId(null), 2200);
    } catch {
      setError("Could not copy the Arrival Guide link — try again.");
    } finally {
      setArrivalLinkFetchingId(null);
    }
  }

  async function resolveAddon(bookingId: string, addonId: string, decision: "approve" | "decline") {
    const key = `${bookingId}-${addonId}-${decision}`;
    setApprovingAddonId(key);

    try {
      await patchAddonResolution(bookingId, addonId, decision);
    } catch (error) {
      console.error("[admin] resolve-addon network error:", error);
      setError(error instanceof Error ? error.message : "Failed to update add-on state.");
    } finally {
      setApprovingAddonId(null);
    }
  }

  async function approveAllAddonsAndConfirm(booking: Booking) {
    const unresolvedApprovalAddons = getAddonSnapshots(booking).filter(
      (addon) => addon.requires_approval && addon.status === "pending_approval",
    );

    if (unresolvedApprovalAddons.length === 0) {
      await updateStatus(booking.id, "confirmed");
      return;
    }

    setBulkActionBookingId(booking.id);

    try {
      for (const addon of unresolvedApprovalAddons) {
        await patchAddonResolution(booking.id, addon.id, "approve");
      }
      await updateStatus(booking.id, "confirmed");
    } catch (error) {
      console.error("[admin] approve-all-and-confirm failed:", error);
      setError(error instanceof Error ? error.message : "Failed to approve add-ons and confirm booking.");
    } finally {
      setBulkActionBookingId(null);
    }
  }

  /** Audit B-3: route confirm requests through the disclosure dialog; cancel keeps its existing prompt. */
  function requestStatusUpdate(id: string, status: "confirmed" | "cancelled") {
    if (status === "cancelled") {
      updateStatus(id, status);
      return;
    }
    const booking = bookings.find((b) => b.id === id);
    if (!booking) return;
    setConfirmGate({ booking, pendingAddonCount: 0, proceed: () => updateStatus(id, "confirmed") });
  }

  /** Audit B-3: the bulk approve-and-confirm action is a confirm action too — same dialog, shown BEFORE any add-on write. */
  function requestApproveAllAddonsAndConfirm(booking: Booking) {
    const pendingAddonCount = getAddonSnapshots(booking).filter(
      (addon) => addon.requires_approval && addon.status === "pending_approval",
    ).length;
    setConfirmGate({ booking, pendingAddonCount, proceed: () => approveAllAddonsAndConfirm(booking) });
  }

  function getPaymentDraft(booking: Booking): PaymentDraft {
    return paymentDrafts[booking.id] ?? buildInitialPaymentDraftFromBooking(booking);
  }

  function getProposalDraft(booking: Booking): ProposalDraft {
    return proposalDrafts[booking.id] ?? buildInitialProposalDraftFromBooking(booking);
  }

  function updatePaymentDraft(bookingId: string, updates: Partial<PaymentDraft>) {
    // Audit B-2: the first-edit fallback MUST match what PaymentSection
    // displays (`draftSlice ?? buildInitialPaymentDraftFromBooking`) — the old
    // hardcoded blank draft silently discarded every seeded value (deposit,
    // due date, method, reference) on the first keystroke.
    const booking = bookings.find((b) => b.id === bookingId);
    setPaymentDrafts((prev) => ({
      ...prev,
      [bookingId]: {
        ...(prev[bookingId] ??
          (booking
            ? buildInitialPaymentDraftFromBooking(booking)
            : {
                depositAmount: "",
                dueAt: "",
                requestNote: "",
                paymentAmount: "",
                paymentMethod: "whish",
                paymentReference: "",
                paymentNotes: "",
                refundAmount: "",
                refundNote: "",
                refundReference: "",
              })),
        ...updates,
      },
    }));
  }

  function updateProposalDraft(booking: Booking, updates: Partial<ProposalDraft>) {
    const bookingId = booking.id;
    setProposalDrafts((prev) => ({
      ...prev,
      [bookingId]: {
        ...(prev[bookingId] ?? buildInitialProposalDraftFromBooking(booking)),
        ...updates,
      },
    }));
  }

  async function patchBookingRecord(bookingId: string, updates: Record<string, unknown>, actionKey: string) {
    setError("");
    setPaymentUpdatingId(`${bookingId}:${actionKey}`);

    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}`, {
        ...adminApiFetchInit,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to update booking details.");
        return null;
      }

      // Audit B-4: these actions are supposed to email the guest — surface a
      // persistent failure notice when the API reports email_sent=false.
      // (Other actionKeys legitimately return email_sent=false with no email
      // attempted, so the check is scoped to the emailing actions.)
      const emailingActionLabels: Record<string, string> = {
        "request-deposit": "deposit-request email",
        "record-payment": "payment-received email",
        "send-reminder": "payment-reminder email",
        "send-proposal": "proposal email",
      };
      const emailingLabel = emailingActionLabels[actionKey];
      if (emailingLabel && data.email_sent === false) {
        reportSendWarning(
          `Booking ${formatBookingRef(bookingId) ?? bookingId}: the ${emailingLabel} was NOT sent to the guest.`,
        );
      }
      if (actionKey === "send-proposal") {
        setProposalEmailFailedIds((prev) => {
          const next = new Set(prev);
          if (data.email_sent === false) next.add(bookingId);
          else next.delete(bookingId);
          return next;
        });
      }

      if (data.booking) {
        setBookings((prev) => prev.map((booking) => (booking.id === bookingId ? { ...booking, ...data.booking } : booking)));
        if (actionKey === "send-proposal") {
          setProposalDrafts((prev) => {
            const next = { ...prev };
            delete next[bookingId];
            return next;
          });
        }
      }

      return data.booking as Booking | null;
    } catch (error) {
      console.error("[admin] booking update error:", error);
      setError("Failed to update booking details.");
      return null;
    } finally {
      setPaymentUpdatingId(null);
    }
  }

  /**
   * Phase 15H — serialize the admin line-item draft to BookingProposalIncludedService rows.
   * Both included and excluded rows are persisted; excluded rows carry `admin_status: "declined"`
   * so the guest view + email omit them while the admin can still flip them back on.
   */
  function serializeProposalLineItems(draft: ProposalDraft): BookingProposalIncludedService[] {
    return draft.lineItems
      .map((line) => {
        const label = line.label.trim();
        if (!label) return null;
        const unitPrice = parseLineItemNumber(line.unitPrice);
        const quantity = parseLineItemNumber(line.quantity);
        const lineTotal = computeProposalLineTotal(unitPrice, quantity);
        const result: BookingProposalIncludedService = {
          id: line.id ?? null,
          label,
          quantity: quantity > 0 ? quantity : null,
          unit_label: line.unitLabel.trim() || null,
          unit_price: line.unitPrice.trim() === "" ? null : unitPrice,
          line_total: line.unitPrice.trim() === "" || quantity === 0 ? null : lineTotal,
          source: line.source,
          notes: line.notes.trim() || null,
          admin_status: line.included ? "approved" : "declined",
        };
        return result;
      })
      .filter((line): line is BookingProposalIncludedService => line !== null);
  }

  async function requestDeposit(booking: Booking) {
    const draft = getPaymentDraft(booking);
    const depositAmount = parseAmountInput(draft.depositAmount);
    if (depositAmount === null) {
      setError("Enter a valid deposit amount before requesting payment.");
      return;
    }

    const dueAtIso = draft.dueAt ? new Date(draft.dueAt).toISOString() : null;
    const nextNotes = draft.requestNote.trim() || booking.payment_notes || null;
    const updated = await patchBookingRecord(
      booking.id,
      {
        deposit_amount: depositAmount,
        payment_method: draft.paymentMethod || null,
        payment_due_at: dueAtIso,
        payment_notes: nextNotes,
        payment_status: "payment_requested",
        payment_requested_at: new Date().toISOString(),
      },
      "request-deposit",
    );

    if (updated) {
      updatePaymentDraft(booking.id, { requestNote: "" });
    }
  }

  async function recordPayment(booking: Booking) {
    const draft = getPaymentDraft(booking);
    const receivedAmount = parseAmountInput(draft.paymentAmount);
    if (receivedAmount === null) {
      setError("Enter a valid payment amount before recording payment.");
      return;
    }
    if (!draft.paymentMethod) {
      setError("Select a payment method before recording payment.");
      return;
    }

    const currentPaid = typeof booking.amount_paid === "number" && Number.isFinite(booking.amount_paid)
      ? booking.amount_paid
      : 0;
    // Bug 8: for event inquiries with a proposal total, use that total as the paid-in-full basis,
    // not the host stay nights.
    const { totalRaw } = getBookingPaymentBasis(booking);
    const nextAmountPaid = currentPaid + receivedAmount;
    const nextPaymentStatus =
      typeof totalRaw === "number" && nextAmountPaid >= totalRaw
        ? "paid_in_full"
        : "deposit_paid";
    const nextNotes = draft.paymentNotes.trim() || booking.payment_notes || null;

    const foundationTotal = getFoundationAmountTotal(booking);
    const foundationDue = computeFoundationAmountDue(foundationTotal, nextAmountPaid);
    const foundationStage = derivePaymentFoundationStage(nextAmountPaid, foundationTotal);
    const recordedAt = new Date().toISOString();

    const updated = await patchBookingRecord(
      booking.id,
      {
        payment_method: draft.paymentMethod,
        amount_paid: nextAmountPaid,
        payment_reference: draft.paymentReference.trim() || null,
        payment_notes: nextNotes,
        payment_received_at: recordedAt,
        payment_last_at: recordedAt,
        amount_total: foundationTotal,
        amount_due: foundationDue,
        payment_stage: foundationStage,
        payment_status: nextPaymentStatus,
      },
      "record-payment",
    );

    if (updated) {
      updatePaymentDraft(booking.id, {
        paymentAmount: "",
        paymentNotes: "",
        paymentReference: updated.payment_reference ?? draft.paymentReference,
      });
    }
  }

  async function issueRefund(booking: Booking) {
    const draft = getPaymentDraft(booking);
    const refundAmount = parseAmountInput(draft.refundAmount);
    if (refundAmount === null) {
      setError("Enter a valid refund amount before recording a refund.");
      return;
    }

    // Plan 4 Phase 1 (KNOWN_BUGS #15): this action only RECORDS a refund the
    // admin already executed in the NetCommerce Business Center — the Business
    // Center refund/transaction reference is required for traceability.
    const refundReference = draft.refundReference.trim();
    if (!refundReference) {
      setError(
        "Enter the NetCommerce Business Center refund reference. Execute the refund in the Business Center first, then record it here.",
      );
      return;
    }

    const refundNoteLine = `Manual refund recorded — Business Center ref ${refundReference}${
      draft.refundNote.trim() ? `: ${draft.refundNote.trim()}` : ""
    }`;
    const combinedNotes = [booking.payment_notes?.trim(), refundNoteLine]
      .filter(Boolean)
      .join("\n");

    const updated = await patchBookingRecord(
      booking.id,
      {
        refund_status: "refunded",
        refund_amount: refundAmount,
        refunded_at: new Date().toISOString(),
        refund_provider_reference: refundReference,
        payment_notes: combinedNotes || null,
      },
      "issue-refund",
    );

    if (updated) {
      updatePaymentDraft(booking.id, { refundAmount: "", refundNote: "", refundReference: "" });
    }
  }

  async function sendPaymentReminder(booking: Booking) {
    if (getPaymentStatus(booking) !== "payment_requested") {
      setError("Payment reminders are only available after requesting payment.");
      return;
    }

    await patchBookingRecord(
      booking.id,
      { send_payment_reminder: true },
      "send-reminder",
    );
  }

  async function saveEventProposalDraft(booking: Booking) {
    const draft = getProposalDraft(booking);
    // Audit B-11: the guest already accepted these terms — overwriting them
    // must be an explicit decision that names the accepted totals.
    if (booking.proposal_status === "accepted") {
      const acceptedTotal = formatMoney(booking.proposal_total_amount ?? 0) ?? "—";
      const acceptedDeposit =
        booking.proposal_deposit_amount != null ? formatMoney(booking.proposal_deposit_amount) ?? "—" : "—";
      const proceed = confirm(
        `This proposal was ACCEPTED by the guest at ${acceptedTotal} total (deposit ${acceptedDeposit}). ` +
          `Saving will overwrite the accepted terms with your current draft. Overwrite the accepted proposal?`,
      );
      if (!proceed) return;
    }
    const proposalIncludedServices = serializeProposalLineItems(draft);
    // Phase 15H — total is derived from included line items; admin can no longer drift the total away from the line sum.
    const proposalTotalAmount = sumProposalLineItemDrafts(draft.lineItems);
    const proposalDepositAmount = parseAmountInput(draft.depositAmount);
    const proposalValidUntil = draft.validUntil ? new Date(draft.validUntil).toISOString() : null;
    const preserveProposalFlow =
      booking.proposal_status === "sent" || booking.proposal_status === "accepted";

    await patchBookingRecord(
      booking.id,
      {
        ...(preserveProposalFlow ? {} : { proposal_status: "draft" }),
        proposal_total_amount: proposalTotalAmount,
        proposal_deposit_amount: proposalDepositAmount,
        proposal_included_services: proposalIncludedServices,
        proposal_excluded_services: draft.excludedServices.trim() || null,
        proposal_optional_services: draft.optionalServices.trim() || null,
        proposal_notes: draft.proposalNotes.trim() || null,
        proposal_valid_until: proposalValidUntil,
        proposal_payment_methods: draft.paymentMethods,
      },
      "save-proposal",
    );
  }

  async function sendEventProposal(booking: Booking) {
    const draft = getProposalDraft(booking);
    const validation = validateProposalForSend(draft);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    const proposalIncludedServices = serializeProposalLineItems(draft);
    const proposalTotalAmount = sumProposalLineItemDrafts(draft.lineItems);
    const proposalDepositAmount = parseAmountInput(draft.depositAmount);
    const proposalValidUntil = draft.validUntil ? new Date(draft.validUntil).toISOString() : null;

    await patchBookingRecord(
      booking.id,
      {
        proposal_total_amount: proposalTotalAmount,
        proposal_deposit_amount: proposalDepositAmount,
        proposal_included_services: proposalIncludedServices,
        proposal_excluded_services: draft.excludedServices.trim() || null,
        proposal_optional_services: draft.optionalServices.trim() || null,
        proposal_notes: draft.proposalNotes.trim() || null,
        proposal_valid_until: proposalValidUntil,
        proposal_payment_methods: draft.paymentMethods,
        send_event_proposal: true,
      },
      "send-proposal",
    );
  }

  /**
   * Phase 15H — pre-send validation. Save-as-draft skips this so admin can
   * iterate freely; send-proposal blocks until the quote is internally consistent.
   */
  /**
   * Phase 15H.1 — line-item draft mutations.
   * Deposit is admin-controlled: prefilled once in `buildInitialProposalDraftFromBooking`
   * and never touched again when line items change. The total recomputes; the deposit doesn't.
   */
  function setProposalLineItems(
    booking: Booking,
    nextLineItems: ProposalLineItemDraft[],
    extraDraftPatch?: Partial<ProposalDraft>,
  ) {
    updateProposalDraft(booking, { lineItems: nextLineItems, ...(extraDraftPatch ?? {}) });
  }

  function updateProposalLineItem(
    booking: Booking,
    key: string,
    patch: Partial<ProposalLineItemDraft>,
  ) {
    const draft = getProposalDraft(booking);
    const next = draft.lineItems.map((line) => (line.key === key ? { ...line, ...patch } : line));
    setProposalLineItems(booking, next);
  }

  function toggleProposalLineIncluded(booking: Booking, key: string) {
    const draft = getProposalDraft(booking);
    const next = draft.lineItems.map((line) => (line.key === key ? { ...line, included: !line.included } : line));
    setProposalLineItems(booking, next);
  }

  function removeProposalLineItem(booking: Booking, key: string) {
    const draft = getProposalDraft(booking);
    const next = draft.lineItems.filter((line) => line.key !== key);
    setProposalLineItems(booking, next);
  }

  function addCustomProposalLineItem(booking: Booking) {
    const draft = getProposalDraft(booking);
    const next: ProposalLineItemDraft[] = [
      ...draft.lineItems,
      {
        key: createCustomLineItemKey(),
        id: null,
        label: "",
        quantity: "1",
        unitLabel: "",
        unitPrice: "",
        notes: "",
        source: "custom",
        included: true,
      },
    ];
    setProposalLineItems(booking, next);
  }

  function getMember(booking: Booking) {
    return booking.member_id ? members.find((member) => member.id === booking.member_id) : null;
  }

  function getBookingDisplayName(booking: Booking) {
    if (!booking.member_id) return booking.guest_name ?? "Guest";
    return getMember(booking)?.full_name ?? "Member";
  }

  function getAddonSnapshots(booking: Booking) {
    return booking.addons_snapshot ?? [];
  }

  function bookingHasPendingAddonApproval(booking: Booking) {
    return getAddonSnapshots(booking).some((addon) => addon.requires_approval && addon.status === "pending_approval");
  }

  function bookingHasOperationalAttention(booking: Booking) {
    return getAddonSnapshots(booking).some((addon) => addonNeedsAttention(addon));
  }

  function bookingHasDiscountedAddon(booking: Booking) {
    return getAddonSnapshots(booking).some((addon) => addonHasTrackedOffer(addon));
  }

  function getBookingOfferSavingsTotal(booking: Booking) {
    const total = getAddonSnapshots(booking).reduce((sum, addon) => {
      if (!addonHasTrackedOffer(addon) || typeof addon.savings !== "number") return sum;
      return sum + addon.savings;
    }, 0);

    return total > 0 ? total : null;
  }

  function bookingRequiresAction(booking: Booking) {
    if (booking.status === "cancelled") return false;
    return booking.status === "pending" || bookingHasPendingAddonApproval(booking) || bookingHasOperationalAttention(booking);
  }

  const filterActive = villaFilter !== "all" || dateFilter !== "" || bookingSearch.trim() !== "";
  const sortActive = confirmedSort !== "created_desc";

  const visibleBookings = useMemo(() => {
    return bookings.filter((booking) => {
      if (villaFilter !== "all" && booking.villa !== villaFilter) return false;
      if (dateFilter && booking.check_in !== dateFilter) return false;
      if (!bookingMatchesSearch(booking, bookingSearch)) return false;
      return true;
    });
  }, [bookings, villaFilter, dateFilter, bookingSearch]);

  const pendingOverlapMap = useMemo(() => {
    const pendingOnly = bookings.filter((booking) => booking.status === "pending");
    const overlaps = new Map<string, Booking[]>();

    for (let i = 0; i < pendingOnly.length; i += 1) {
      for (let j = i + 1; j < pendingOnly.length; j += 1) {
        const current = pendingOnly[i];
        const other = pendingOnly[j];

        if (current.villa !== other.villa) continue;
        if (!bookingDateRangesOverlap(current, other)) continue;

        overlaps.set(current.id, [...(overlaps.get(current.id) ?? []), other]);
        overlaps.set(other.id, [...(overlaps.get(other.id) ?? []), current]);
      }
    }

    return overlaps;
  }, [bookings]);

  function getPendingOverlaps(booking: Booking) {
    return pendingOverlapMap.get(booking.id) ?? [];
  }

  // Phase 14A: pending-vs-confirmed conflict detection. Frontend/admin-only — no backend changes.
  const confirmedConflictMap = useMemo(() => {
    const map = new Map<string, Booking[]>();
    const pendingOnly = bookings.filter((b) => b.status === "pending");
    const confirmedOnly = bookings.filter((b) => b.status === "confirmed");
    for (const p of pendingOnly) {
      const pRange = getOperationalRange(p);
      const conflicts = confirmedOnly.filter((c) => c.villa === p.villa && rangesOverlap(pRange, getOperationalRange(c)));
      if (conflicts.length > 0) map.set(p.id, conflicts);
    }
    return map;
  }, [bookings]);

  function getConfirmedConflicts(booking: Booking) {
    return confirmedConflictMap.get(booking.id) ?? [];
  }

  function hasConfirmedOverlap(booking: Booking) {
    return (confirmedConflictMap.get(booking.id) ?? []).length > 0;
  }

  // Phase 14K: alternative date suggestions for conflict/on-hold pending bookings.
  const conflictSuggestionsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof findAlternativeDateSuggestions>>();
    const confirmedOnly = bookings.filter((b) => b.status === "confirmed");
    const pendingOnly = bookings.filter((b) => b.status === "pending");
    for (const p of pendingOnly) {
      if (!confirmedConflictMap.has(p.id)) continue;
      map.set(
        p.id,
        findAlternativeDateSuggestions({
          villa: p.villa,
          check_in: p.check_in,
          check_out: p.check_out,
          isEvent: isEventInquiryBooking(p),
          confirmedBookings: confirmedOnly,
          excludeBookingId: p.id,
        }),
      );
    }
    return map;
  }, [bookings, confirmedConflictMap]);

  const deadDayUpsellMap = useMemo(() => {
    const byVilla = new Map<string, Booking[]>();
    const opportunities = new Map<string, DeadDayUpsellOpportunity[]>();

    for (const booking of bookings) {
      if (booking.status !== "confirmed") continue;
      byVilla.set(booking.villa, [...(byVilla.get(booking.villa) ?? []), booking]);
    }

    for (const villaBookings of Array.from(byVilla.values())) {
      const sortedVillaBookings = [...villaBookings].sort(
        (a, b) => a.check_in.localeCompare(b.check_in) || a.check_out.localeCompare(b.check_out) || a.created_at.localeCompare(b.created_at),
      );

      for (let index = 0; index < sortedVillaBookings.length - 1; index += 1) {
        const current = sortedVillaBookings[index];
        const next = sortedVillaBookings[index + 1];
        const gapDays = dateOnlyGapDays(current.check_out, next.check_in);
        if (gapDays !== 1) continue;

        const opportunityDate = current.check_out;
        const dateLabel = fmt(opportunityDate);
        opportunities.set(current.id, [
          ...(opportunities.get(current.id) ?? []),
          { kind: "late_checkout", dateISO: opportunityDate, dateLabel, pairedBooking: next },
        ]);
        opportunities.set(next.id, [
          ...(opportunities.get(next.id) ?? []),
          { kind: "early_checkin", dateISO: opportunityDate, dateLabel, pairedBooking: current },
        ]);
      }
    }

    return opportunities;
  }, [bookings]);

  function getDeadDayUpsells(booking: Booking) {
    return deadDayUpsellMap.get(booking.id) ?? [];
  }

  const pendingBookings = sortByNewest(visibleBookings.filter((booking) => bookingRequiresAction(booking)));
  // Phase 14A: split pending into Action Required vs Conflict / On Hold for visual grouping. No DB status change.
  const actionRequiredBookings = pendingBookings.filter((b) => !hasConfirmedOverlap(b));
  const conflictHoldBookings = pendingBookings.filter((b) => hasConfirmedOverlap(b));
  // Phase 14B: further split action-required into stay requests vs event inquiries (admin-only frontend classification).
  const stayRequestBookings = actionRequiredBookings.filter((b) => !isEventInquiryBooking(b));
  const eventInquiryBookings = actionRequiredBookings.filter((b) => isEventInquiryBooking(b));

  const confirmedBookings = sortConfirmedBookings(
    visibleBookings.filter((booking) => booking.status === "confirmed" && !bookingRequiresAction(booking)),
    confirmedSort,
  );

  const upcomingConfirmedBookings = confirmedBookings.filter((b) => !isBookingCheckedOutAfter(b));
  const completedConfirmedBookings = [...confirmedBookings.filter((b) => isBookingCheckedOutAfter(b))].sort(
    (a, b) => b.check_out.localeCompare(a.check_out) || b.created_at.localeCompare(a.created_at),
  );

  const cancelledBookings = sortByNewest(
    visibleBookings.filter((booking) => booking.status === "cancelled" && !hiddenCancelledIds.includes(booking.id)),
  );
  const hiddenCancelledCount = visibleBookings.filter(
    (booking) => booking.status === "cancelled" && hiddenCancelledIds.includes(booking.id),
  ).length;

  const sectionCounts: Record<BookingSectionKey, number> = {
    pending: pendingBookings.length,
    confirmed: confirmedBookings.length,
    cancelled: cancelledBookings.length,
  };

  const activeSection: BookingSectionKey =
    statusFilter === "confirmed" || statusFilter === "cancelled" ? statusFilter : "pending";

  const sectionBookings =
    activeSection === "pending"
      ? pendingBookings
      : activeSection === "confirmed"
        ? confirmedBookings
        : cancelledBookings;

  const confirmedSectionHasRows = upcomingConfirmedBookings.length > 0 || completedConfirmedBookings.length > 0;

  function renderFilterChip(label: string, value: string, onClear: () => void) {
    return (
      <button
        type="button"
        onClick={onClear}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          fontFamily: LATO,
          fontSize: "10px",
          letterSpacing: "1.6px",
          textTransform: "uppercase",
          color: GOLD,
          backgroundColor: "rgba(197,164,109,0.12)",
          border: "0.5px solid rgba(197,164,109,0.32)",
          borderRadius: "999px",
          padding: "7px 10px",
          cursor: "pointer",
        }}
      >
        <span>
          {label}: {value}
        </span>
        <span style={{ color: WHITE, fontSize: "12px", lineHeight: 1 }}>x</span>
      </button>
    );
  }

  function handleResetView() {
    clearFilters();
    setBookingSearch("");
    setConfirmedSort("created_desc");
    setHiddenCancelledIds([]);
    setExpandedCompactId(null);
  }

  function hideVisibleCancelledBookings() {
    setHiddenCancelledIds((prev) => {
      const next = new Set(prev);
      for (const booking of visibleBookings) {
        if (booking.status === "cancelled") next.add(booking.id);
      }
      return Array.from(next);
    });
    setExpandedCompactId(null);
  }

  function renderSectionTeaser(section: BookingSectionKey) {
    const tone = getSectionTone(section);
    const symbol = section === "confirmed" ? "C" : "X";

    return (
      <button
        key={section}
        type="button"
        onClick={() => setStatusFilter(section)}
        style={{
          width: "100%",
          background: `linear-gradient(90deg, ${tone.glow} 0%, rgba(255,255,255,0.02) 100%)`,
          border: `0.5px solid ${tone.accent}55`,
          borderRadius: "16px",
          padding: isMobile ? "16px 18px" : "18px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0 }}>
          <div
            style={{
              width: "46px",
              height: "46px",
              borderRadius: "999px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: tone.glow,
              color: tone.accent,
              fontFamily: LATO,
              fontSize: "20px",
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            {symbol}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
                marginBottom: "4px",
              }}
            >
              <span
                style={{
                  fontFamily: LATO,
                  fontSize: isMobile ? "20px" : "22px",
                  color: WHITE,
                  fontWeight: 700,
                }}
              >
                {tone.title}
              </span>
              <span
                style={{
                  minWidth: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: tone.accent,
                  color: MIDNIGHT,
                  fontFamily: LATO,
                  fontSize: "11px",
                  fontWeight: 700,
                }}
              >
                {sectionCounts[section]}
              </span>
            </div>
            <p style={{ fontFamily: LATO, fontSize: "14px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
              {tone.subtitle}
            </p>
          </div>
        </div>
        <span style={{ color: WHITE, fontFamily: LATO, fontSize: "22px", lineHeight: 1, opacity: 0.85 }}>
          {">"}
        </span>
      </button>
    );
  }

  function renderAddonRows(booking: Booking) {
    const activeAddonResolution =
      approvingAddonId && approvingAddonId.startsWith(`${booking.id}-`)
        ? approvingAddonId.slice(booking.id.length + 1)
        : null;
    return (
      <AddonRows
        booking={booking}
        activeAddonResolution={activeAddonResolution}
        isMobile={isMobile}
        actions={cardActions}
      />
    );
  }

  function renderGuestFeedbackSection(booking: Booking, emphasis: "completed" | "upcoming" = "upcoming") {
    if (booking.status !== "confirmed") return null;
    const guestName = getBookingGuestDisplayName(booking, members);
    const eventInquiry = isEventInquiryBooking(booking);
    const message = eventInquiry ? buildEventFeedbackRequestMessage(guestName) : buildStayFeedbackRequestMessage(guestName);
    const email = getBookingGuestEmailForFeedback(booking, members);
    const phone = getBookingGuestPhoneForFeedback(booking, members);
    const waUrl = phone ? buildWhatsAppFeedbackUrl(phone, message) : null;
    const mailtoUrl = email ? buildMailtoFeedbackUrl(email, message) : null;
    const open = feedbackPrepBookingId === booking.id;
    const isPrimary = emphasis === "completed";
    const recipientEmail = getBookingGuestEmailForFeedback(booking, members);
    const feedbackCooldown = isFeedbackEmailCooldownActive(booking.feedback_requested_at);
    const feedbackSentAtLabel = formatDateTimeValue(booking.feedback_requested_at);
    const hasPriorFeedbackEmail = Boolean(booking.feedback_requested_at);
    const feedbackEmailSendDisabled =
      !recipientEmail || feedbackCooldown || feedbackEmailSendingId === booking.id;
    let feedbackEmailButtonLabel = "Send feedback request";
    if (hasPriorFeedbackEmail && !feedbackCooldown) feedbackEmailButtonLabel = "Resend feedback request";

    async function copyFeedbackMessage() {
      try {
        await navigator.clipboard.writeText(message);
        setFeedbackCopiedBookingId(booking.id);
        setTimeout(() => setFeedbackCopiedBookingId(null), 2200);
      } catch {
        setError("Could not copy to clipboard — select the text manually.");
      }
    }

    const manualLine = eventInquiry
      ? "Send manually after the event date."
      : "Send manually after the guest has checked out.";

    return (
      <div
        style={{
          border: isPrimary ? "0.5px solid rgba(197,164,109,0.42)" : "0.5px solid rgba(197,164,109,0.16)",
          backgroundColor: isPrimary ? "rgba(197,164,109,0.07)" : "rgba(255,255,255,0.02)",
          padding: "12px 14px",
          borderRadius: "8px",
          marginTop: "10px",
        }}
      >
        {isPrimary ? (
          <div
            style={{
              border: "0.5px solid rgba(111,207,138,0.22)",
              backgroundColor: "rgba(80,180,100,0.06)",
              padding: "12px 14px",
              borderRadius: "8px",
              marginBottom: "12px",
            }}
          >
            <p
              style={{
                fontFamily: LATO,
                fontSize: "10px",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: "#7ddf9a",
                margin: "0 0 8px",
              }}
            >
              Feedback request email
            </p>
            {feedbackSentAtLabel ? (
              <p style={{ fontFamily: LATO, fontSize: "11px", color: "rgba(255,255,255,0.82)", margin: "0 0 8px", lineHeight: 1.55 }}>
                Feedback requested on {feedbackSentAtLabel}
                {typeof booking.feedback_request_count === "number" && booking.feedback_request_count > 1
                  ? ` · ${booking.feedback_request_count} sends logged`
                  : ""}
              </p>
            ) : (
              <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "0 0 8px", lineHeight: 1.55 }}>
                Sends only after you confirm in the dialog — nothing is automatic.
              </p>
            )}
            {feedbackCooldown ? (
              <p style={{ fontFamily: LATO, fontSize: "11px", color: "#f0bd67", margin: "0 0 10px", lineHeight: 1.55 }}>
                Feedback already requested recently. Wait for the 24-hour cooldown to resend.
              </p>
            ) : null}
            {!recipientEmail ? (
              <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "0 0 10px", lineHeight: 1.55 }}>
                No guest email on file — add email or use the manual tools below.
              </p>
            ) : null}
            <button
              type="button"
              disabled={feedbackEmailSendDisabled}
              onClick={() => setFeedbackEmailModalBookingId(booking.id)}
              style={{
                fontFamily: LATO,
                fontSize: "10px",
                letterSpacing: "1.6px",
                textTransform: "uppercase",
                color: feedbackEmailSendDisabled ? MUTED : MIDNIGHT,
                backgroundColor: feedbackEmailSendDisabled ? "rgba(255,255,255,0.06)" : "#6fcf8a",
                border: feedbackEmailSendDisabled ? `0.5px solid ${BORDER}` : "none",
                padding: "10px 16px",
                borderRadius: "6px",
                cursor: feedbackEmailSendDisabled ? "not-allowed" : "pointer",
              }}
            >
              {feedbackEmailButtonLabel}
            </button>
          </div>
        ) : null}

        <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: GOLD, margin: "0 0 6px" }}>
          Feedback request (manual)
        </p>
        <p style={{ fontFamily: LATO, fontSize: "11px", color: isPrimary ? "rgba(255,255,255,0.82)" : MUTED, margin: "0 0 6px", lineHeight: 1.55, fontWeight: isPrimary ? 500 : 400 }}>
          {manualLine}
        </p>
        <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: "0 0 10px", lineHeight: 1.55 }}>
          {isPrimary
            ? "Nothing is sent from Oraya automatically. Copy the message or open WhatsApp / email with the text filled in — you send when ready."
            : "Nothing sends automatically. Prefer preparing feedback from Completed / Checked-out once the stay or event has finished; you can still open the tool here if needed."}
        </p>
        <button
          type="button"
          onClick={() => setFeedbackPrepBookingId(open ? null : booking.id)}
          style={{
            fontFamily: LATO,
            fontSize: "10px",
            letterSpacing: "1.6px",
            textTransform: "uppercase",
            color: MIDNIGHT,
            backgroundColor: GOLD,
            border: "none",
            padding: "10px 16px",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          {open ? "Hide prepared message" : "Prepare feedback request"}
        </button>
        {open && (
          <div style={{ marginTop: "12px", display: "grid", gap: "10px" }}>
            <pre
              style={{
                fontFamily: LATO,
                fontSize: "11px",
                color: "rgba(255,255,255,0.82)",
                margin: 0,
                whiteSpace: "pre-wrap",
                lineHeight: 1.6,
                padding: "10px 12px",
                borderRadius: "6px",
                border: "0.5px solid rgba(197,164,109,0.15)",
                backgroundColor: "rgba(0,0,0,0.2)",
              }}
            >
              {message}
            </pre>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => void copyFeedbackMessage()}
                style={{
                  fontFamily: LATO,
                  fontSize: "10px",
                  letterSpacing: "1.4px",
                  textTransform: "uppercase",
                  color: GOLD,
                  backgroundColor: "transparent",
                  border: "0.5px solid rgba(197,164,109,0.35)",
                  padding: "8px 14px",
                  borderRadius: "6px",
                  cursor: "pointer",
                }}
              >
                {feedbackCopiedBookingId === booking.id ? "Copied" : "Copy message"}
              </button>
              {waUrl ? (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontFamily: LATO,
                    fontSize: "10px",
                    letterSpacing: "1.4px",
                    textTransform: "uppercase",
                    color: MIDNIGHT,
                    backgroundColor: "rgba(197,164,109,0.85)",
                    border: "none",
                    padding: "8px 14px",
                    borderRadius: "6px",
                    textDecoration: "none",
                  }}
                >
                  Open WhatsApp
                </a>
              ) : null}
              {mailtoUrl ? (
                <a
                  href={mailtoUrl}
                  style={{
                    fontFamily: LATO,
                    fontSize: "10px",
                    letterSpacing: "1.4px",
                    textTransform: "uppercase",
                    color: GOLD,
                    border: "0.5px solid rgba(197,164,109,0.35)",
                    padding: "8px 14px",
                    borderRadius: "6px",
                    textDecoration: "none",
                  }}
                >
                  Open in email
                </a>
              ) : null}
            </div>
            {!phone && !email ? (
              <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                No phone or email on file — copy the message and reach the guest your usual way.
              </p>
            ) : null}
            {phone && !waUrl ? (
              <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                Phone on file could not be turned into a WhatsApp link — check the number format (country code).
              </p>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  // Remediation 2 (B.1) — ONE permanently-stable actions object for the
  // memoized section components. The ref always holds the latest closures;
  // the useMemo wrappers delegate through it, so identity never changes and
  // React.memo on the sections holds (useEvent pattern).
  const cardActionsRef = useRef<BookingCardActions | null>(null);
  cardActionsRef.current = {
    toggleCardPanel: (bookingId, panel, defaultOpen) =>
      setBookingCardPanels((prev) => {
        const cur = prev[bookingId]?.[panel];
        const isOpen = cur !== undefined ? cur : defaultOpen;
        return { ...prev, [bookingId]: { ...prev[bookingId], [panel]: !isOpen } };
      }),
    updatePaymentDraft,
    requestDeposit,
    recordPayment,
    issueRefund,
    sendPaymentReminder,
    updateProposalDraft,
    updateProposalLineItem,
    toggleProposalLineIncluded,
    removeProposalLineItem,
    addCustomProposalLineItem,
    saveEventProposalDraft,
    sendEventProposal,
    resolveAddon,
    toggleExpandedCompact: (bookingId) =>
      setExpandedCompactId((prev) => (prev === bookingId ? null : bookingId)),
    prepFeedbackForBooking: (bookingId) => {
      setExpandedCompactId(bookingId);
      setFeedbackPrepBookingId(bookingId);
    },
  };

  const cardActions = useMemo<BookingCardActions>(() => ({
    toggleCardPanel: (...args) => cardActionsRef.current!.toggleCardPanel(...args),
    updatePaymentDraft: (...args) => cardActionsRef.current!.updatePaymentDraft(...args),
    requestDeposit: (...args) => cardActionsRef.current!.requestDeposit(...args),
    recordPayment: (...args) => cardActionsRef.current!.recordPayment(...args),
    issueRefund: (...args) => cardActionsRef.current!.issueRefund(...args),
    sendPaymentReminder: (...args) => cardActionsRef.current!.sendPaymentReminder(...args),
    updateProposalDraft: (...args) => cardActionsRef.current!.updateProposalDraft(...args),
    updateProposalLineItem: (...args) => cardActionsRef.current!.updateProposalLineItem(...args),
    toggleProposalLineIncluded: (...args) => cardActionsRef.current!.toggleProposalLineIncluded(...args),
    removeProposalLineItem: (...args) => cardActionsRef.current!.removeProposalLineItem(...args),
    addCustomProposalLineItem: (...args) => cardActionsRef.current!.addCustomProposalLineItem(...args),
    saveEventProposalDraft: (...args) => cardActionsRef.current!.saveEventProposalDraft(...args),
    sendEventProposal: (...args) => cardActionsRef.current!.sendEventProposal(...args),
    resolveAddon: (...args) => cardActionsRef.current!.resolveAddon(...args),
    toggleExpandedCompact: (...args) => cardActionsRef.current!.toggleExpandedCompact(...args),
    prepFeedbackForBooking: (...args) => cardActionsRef.current!.prepFeedbackForBooking(...args),
  }), []);

  function renderPaymentSection(booking: Booking) {
    const activePaymentAction =
      paymentUpdatingId && paymentUpdatingId.startsWith(`${booking.id}:`)
        ? paymentUpdatingId.slice(booking.id.length + 1)
        : null;
    return (
      <PaymentSection
        booking={booking}
        draftSlice={paymentDrafts[booking.id]}
        activePaymentAction={activePaymentAction}
        panelOpenStored={bookingCardPanels[booking.id]?.payment}
        isMobile={isMobile}
        actions={cardActions}
      />
    );
  }

  function renderEventProposalSection(booking: Booking) {
    const activeProposalAction =
      paymentUpdatingId && paymentUpdatingId.startsWith(`${booking.id}:`)
        ? paymentUpdatingId.slice(booking.id.length + 1)
        : null;
    return (
      <ProposalSection
        booking={booking}
        draftSlice={proposalDrafts[booking.id]}
        activeProposalAction={activeProposalAction}
        isMobile={isMobile}
        actions={cardActions}
        sendEmailFailed={proposalEmailFailedIds.has(booking.id)}
      />
    );
  }

  function renderExpandedBookingDetails(
    booking: Booking,
    compactMode: boolean,
    feedbackEmphasis: "completed" | "upcoming" = "upcoming",
  ) {
    return (
      <ExpandedBookingDetails
        booking={booking}
        compactMode={compactMode}
        feedbackEmphasis={feedbackEmphasis}
        deps={{
          approveAllAddonsAndConfirm: requestApproveAllAddonsAndConfirm,
          copyArrivalGuideLink,
          updateStatus: requestStatusUpdate,
          getMember,
          getBookingDisplayName,
          getConfirmedConflicts,
          getPendingOverlaps,
          getDeadDayUpsells,
          getBookingOfferSavingsTotal,
          bookingHasDiscountedAddon,
          bookingHasOperationalAttention,
          bookingHasPendingAddonApproval,
          getAddonSnapshots,
          renderAddonRows,
          renderEventProposalSection,
          renderPaymentSection,
          renderGuestFeedbackSection,
          renderExpandedBookingDetails,
          setActiveOfferKey,
          setCopiedOfferKey,
          setBookingCardPanels,
          updatingId,
          bulkActionBookingId,
          activeOfferKey,
          copiedOfferKey,
          bookingCardPanels,
          isMobile,
          bookings,
          arrivalLinkFetchingId,
          arrivalLinkCopiedBookingId,
          conflictSuggestionsMap,
          emailWarnings,
        }}
      />
    );
  }

  function renderCompactRow(
    booking: Booking,
    section: "confirmed" | "cancelled" | "pending",
    opts?: { confirmedBand?: "upcoming" | "completed" },
  ) {
    const expanded = expandedCompactId === booking.id;
    const confirmedBand = opts?.confirmedBand;
    const conflictHoldRow = section === "pending" && hasConfirmedOverlap(booking);
    const conflictHoldReason = conflictHoldRow
      ? getConfirmedConflicts(booking).some((c) => isEventInquiryBooking(c))
        ? "Blocked by event setup window"
        : "Blocked by confirmed stay"
      : null;
    const isGuest = !booking.member_id;
    const memberInfo = getMember(booking);
    const displayName = isGuest ? booking.guest_name ?? "Guest" : memberInfo?.full_name ?? "Member";
    const feedbackEmphasisForExpand: "completed" | "upcoming" =
      section === "confirmed" && confirmedBand === "completed" ? "completed" : "upcoming";
    return (
      <CompactRow
        key={booking.id}
        booking={booking}
        section={section}
        confirmedBand={confirmedBand}
        expanded={expanded}
        isMobile={isMobile}
        displayName={displayName}
        conflictHoldRow={conflictHoldRow}
        conflictHoldReason={conflictHoldReason}
        hasDeadDayUpsell={getDeadDayUpsells(booking).length > 0}
        expandedContent={expanded ? renderExpandedBookingDetails(booking, true, feedbackEmphasisForExpand) : null}
        actions={cardActions}
      />
    );
  }

  const sectionTone = getSectionTone(activeSection);
  const sectionEmptyCopy: Record<BookingSectionKey, string> = {
    pending: "No bookings currently need action.",
    confirmed: "No confirmed bookings match the current filters.",
    cancelled: "No cancelled bookings match the current filters.",
  };
  const confirmedSortLabel =
    confirmedSort === "created_asc"
      ? "Oldest confirmed first"
      : confirmedSort === "check_in_asc"
        ? "Earliest check-in first"
        : confirmedSort === "check_in_desc"
          ? "Latest check-in first"
          : "Newly confirmed first";

  function renderBookingSkeletons() {
    if (activeSection === "pending") {
      return (
        <div style={{ display: "grid", gap: "16px" }} aria-hidden="true">
          {[0, 1].map((item) => (
            <div
              key={item}
              style={{
                border: "0.5px solid rgba(197,164,109,0.26)",
                borderRadius: "18px",
                padding: isMobile ? "1rem" : "1.45rem 1.5rem",
                minHeight: isMobile ? "360px" : "330px",
                background: "linear-gradient(135deg, rgba(24,36,52,0.98), rgba(18,29,43,0.98))",
                display: "grid",
                gap: "16px",
              }}
            >
              <SkeletonText width={isMobile ? "60%" : "34%"} height="24px" />
              <SkeletonBlock height={isMobile ? "58px" : "62px"} radius="10px" />
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <SkeletonText width="170px" />
                <SkeletonText width="130px" />
                <SkeletonText width="100px" />
              </div>
              <SkeletonBlock height="44px" radius="8px" />
              <div style={{ display: "grid", gap: "10px" }}>
                <SkeletonText width="100%" />
                <SkeletonText width="86%" />
                <SkeletonText width="72%" />
              </div>
              <div style={{ display: "flex", gap: "12px", justifyContent: isMobile ? "stretch" : "flex-end", flexDirection: isMobile ? "column" : "row" }}>
                <SkeletonBlock height="42px" width={isMobile ? "100%" : "132px"} radius="8px" />
                <SkeletonBlock height="42px" width={isMobile ? "100%" : "190px"} radius="8px" />
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div style={{ display: "grid", gap: "12px" }} aria-hidden="true">
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            style={{
              border: `0.5px solid ${BORDER}`,
              borderRadius: "16px",
              padding: isMobile ? "14px 16px" : "14px 18px",
              minHeight: isMobile ? "92px" : "74px",
              backgroundColor: "rgba(255,255,255,0.025)",
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr auto" : "minmax(0, 1.15fr) minmax(0, 0.9fr) auto auto",
              gap: "12px",
              alignItems: "center",
            }}
          >
            <SkeletonText width={isMobile ? "68%" : "180px"} height="18px" />
            {!isMobile && <SkeletonText width="220px" />}
            <SkeletonText width="86px" />
            <SkeletonText width="42px" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {feedbackEmailModalBookingId ? (() => {
        const bookingForModal = bookings.find((b) => b.id === feedbackEmailModalBookingId);
        if (!bookingForModal) return null;
        const guestLabel = getBookingGuestDisplayName(bookingForModal, members);
        const guestMail = getBookingGuestEmailForFeedback(bookingForModal, members);
        const modalBusy = feedbackEmailSendingId === feedbackEmailModalBookingId;
        return (
          <ConfirmDialog
            titleId="feedback-email-confirm-title"
            title="Send feedback request to this guest?"
            confirmLabel={modalBusy ? "Sending…" : "Send email"}
            confirmDisabled={!guestMail}
            busy={modalBusy}
            isMobile={isMobile}
            onCancel={() => setFeedbackEmailModalBookingId(null)}
            onConfirm={() => void confirmSendFeedbackEmail()}
          >
            <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, margin: "0 0 6px", lineHeight: 1.55 }}>
              {guestLabel}
              {guestMail ? (
                <>
                  {" "}
                  · <span style={{ color: "rgba(255,255,255,0.78)" }}>{guestMail}</span>
                </>
              ) : null}
            </p>
            <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "0 0 18px", lineHeight: 1.55 }}>
              This sends one transactional email from Oraya Reservations. It is not automatic and does not publish testimonials.
            </p>
          </ConfirmDialog>
        );
      })() : null}

      {confirmGate && (() => {
        const gateBooking = confirmGate.booking;
        const gateRef = formatBookingRef(gateBooking.id);
        const gateIsEvent = isEventInquiryBooking(gateBooking);
        const gateName = getBookingDisplayName(gateBooking);
        return (
          <ConfirmDialog
            titleId="confirm-booking-dialog-title"
            title="Confirm this booking?"
            confirmLabel={confirmGateBusy ? "Confirming..." : "Confirm & notify guest"}
            confirmColor="#6fcf8a"
            busy={confirmGateBusy}
            isMobile={isMobile}
            onCancel={() => {
              if (!confirmGateBusy) setConfirmGate(null);
            }}
            onConfirm={async () => {
              setConfirmGateBusy(true);
              try {
                await confirmGate.proceed();
              } finally {
                setConfirmGateBusy(false);
                setConfirmGate(null);
              }
            }}
          >
            <p style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, margin: "0 0 10px", lineHeight: 1.6 }}>
              {gateName}
              {gateRef ? ` · Ref ${gateRef}` : ""} · {gateBooking.villa}
            </p>
            <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: "0 0 6px", lineHeight: 1.6 }}>
              Confirming immediately sends the guest their booking-confirmed email
              {gateIsEvent ? "" : " and the WhatsApp Arrival Guide message"}.
              {confirmGate.pendingAddonCount > 0
                ? ` ${confirmGate.pendingAddonCount} approval-required add-on${confirmGate.pendingAddonCount === 1 ? "" : "s"} will be approved first.`
                : ""}
            </p>
            <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "0 0 18px", lineHeight: 1.55 }}>
              Nothing is sent if you cancel this dialog.
            </p>
          </ConfirmDialog>
        );
      })()}

      <div style={{ display: "grid", gap: "1rem" }}>
      <div
        style={{
          background: "linear-gradient(180deg, rgba(26,37,53,0.98) 0%, rgba(23,33,47,0.98) 100%)",
          border: `0.5px solid ${BORDER}`,
          borderRadius: "22px",
          padding: isMobile ? "1rem" : "1.2rem",
          boxShadow: "0 20px 56px rgba(0,0,0,0.22)",
          display: "grid",
          gap: "1rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "stretch" : "flex-start",
            flexDirection: isMobile ? "column" : "row",
            gap: "16px",
          }}
        >
          <div>
            <p style={{ fontFamily: LATO, fontSize: isMobile ? "14px" : "16px", color: MUTED, margin: 0, lineHeight: 1.6 }}>
              Manage booking requests and approvals
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: "0",
              flexWrap: "wrap",
              border: `0.5px solid ${BORDER}`,
              borderRadius: "16px",
              padding: "4px",
              backgroundColor: "rgba(255,255,255,0.02)",
            }}
          >
            {([
              ["pending", "Pending"] as const,
              ["confirmed", "Confirmed"] as const,
              ["cancelled", "Cancelled"] as const,
            ]).map(([section, label]) => {
              const active = activeSection === section;
              const tone = getSectionTone(section);
              return (
                <button
                  key={section}
                  type="button"
                  onClick={() => setStatusFilter(section)}
                  style={{
                    minWidth: isMobile ? "calc(50% - 4px)" : "190px",
                    flex: isMobile ? "1 1 calc(50% - 4px)" : "0 0 auto",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                    padding: "16px 18px",
                    backgroundColor: active ? "rgba(255,255,255,0.03)" : "transparent",
                    border: `0.5px solid ${active ? tone.accent : "transparent"}`,
                    borderRadius: "12px",
                    color: active ? WHITE : MUTED,
                    fontFamily: LATO,
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      letterSpacing: "2px",
                      textTransform: "uppercase",
                      color: active ? tone.accent : MUTED,
                    }}
                  >
                    {label}
                  </span>
                  <span
                    style={{
                      minWidth: "28px",
                      height: "28px",
                      borderRadius: "999px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: active ? tone.accent : "rgba(255,255,255,0.12)",
                      color: active ? MIDNIGHT : WHITE,
                      fontSize: "11px",
                      fontWeight: 700,
                    }}
                  >
                    {sectionCounts[section]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ minWidth: isMobile ? "100%" : "260px", flex: "2 1 260px" }}>
            <label
              style={{
                fontFamily: LATO,
                fontSize: "10px",
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: MUTED,
                display: "block",
                marginBottom: "6px",
              }}
            >
              Search
            </label>
            <input
              type="search"
              value={bookingSearch}
              onChange={(event) => setBookingSearch(event.target.value)}
              placeholder="Reference, name, phone, or email"
              style={fieldStyle}
            />
          </div>

          <div style={{ minWidth: isMobile ? "100%" : "220px", flex: "1 1 220px" }}>
            <label
              style={{
                fontFamily: LATO,
                fontSize: "10px",
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: MUTED,
                display: "block",
                marginBottom: "6px",
              }}
            >
              Villa
            </label>
            <select
              value={villaFilter}
              onChange={(event) => setVillaFilter(event.target.value)}
              style={{ ...fieldStyle, cursor: "pointer" }}
            >
              <option value="all" style={{ backgroundColor: MIDNIGHT }}>
                All villas
              </option>
              {villaOptions.map((villa) => (
                <option key={villa} value={villa} style={{ backgroundColor: MIDNIGHT }}>
                  {villa}
                </option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: isMobile ? "100%" : "180px", flex: "1 1 180px" }}>
            <label
              style={{
                fontFamily: LATO,
                fontSize: "10px",
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: MUTED,
                display: "block",
                marginBottom: "6px",
              }}
            >
              Check-in
            </label>
            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              style={fieldStyle}
            />
          </div>

          <button
            type="button"
            onClick={handleResetView}
            style={{
              fontFamily: LATO,
              fontSize: "10px",
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: filterActive ? WHITE : MUTED,
              backgroundColor: filterActive ? "rgba(197,164,109,0.12)" : "transparent",
              border: `0.5px solid ${filterActive ? "rgba(197,164,109,0.28)" : BORDER}`,
              padding: isMobile ? "12px 16px" : "12px 18px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              borderRadius: "8px",
            }}
          >
            Clear
          </button>
        </div>

        {(filterActive || (activeSection === "confirmed" && sortActive)) && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {bookingSearch.trim() !== "" && renderFilterChip("Search", bookingSearch.trim(), () => setBookingSearch(""))}
            {villaFilter !== "all" && renderFilterChip("Villa", villaFilter, () => setVillaFilter("all"))}
            {dateFilter && renderFilterChip("Check-in", fmt(dateFilter), () => setDateFilter(""))}
            {activeSection === "confirmed" &&
              sortActive &&
              renderFilterChip("Sort", confirmedSortLabel, () => setConfirmedSort("created_desc"))}
          </div>
        )}
      </div>

      <div
        style={{
          background: "linear-gradient(180deg, rgba(26,37,53,0.98) 0%, rgba(23,33,47,0.98) 100%)",
          border: `0.5px solid ${BORDER}`,
          borderRadius: "22px",
          padding: isMobile ? "1rem" : "1.2rem",
          boxShadow: "0 20px 56px rgba(0,0,0,0.22)",
          display: "grid",
          gap: "14px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "stretch" : "center",
            flexDirection: isMobile ? "column" : "row",
            gap: "16px",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
                marginBottom: "6px",
              }}
            >
              <p style={{ fontFamily: PLAYFAIR, fontSize: isMobile ? "1.7rem" : "1.9rem", color: WHITE, margin: 0 }}>
                {sectionTone.title}
              </p>
              <span
                style={{
                  minWidth: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: sectionTone.accent,
                  color: MIDNIGHT,
                  fontFamily: LATO,
                  fontSize: "11px",
                  fontWeight: 700,
                }}
              >
                {sectionCounts[activeSection]}
              </span>
            </div>
            <p style={{ fontFamily: LATO, fontSize: "14px", color: MUTED, margin: 0, lineHeight: 1.6 }}>
              {sectionTone.subtitle}
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {activeSection === "confirmed" ? (
              <div style={{ minWidth: isMobile ? "100%" : "240px" }}>
                <select
                  value={confirmedSort}
                  onChange={(event) => setConfirmedSort(event.target.value as ConfirmedSortKey)}
                  style={{ ...fieldStyle, cursor: "pointer" }}
                >
                  <option value="created_desc" style={{ backgroundColor: MIDNIGHT }}>
                    Newly confirmed first
                  </option>
                  <option value="created_asc" style={{ backgroundColor: MIDNIGHT }}>
                    Oldest confirmed first
                  </option>
                  <option value="check_in_asc" style={{ backgroundColor: MIDNIGHT }}>
                    Earliest check-in first
                  </option>
                  <option value="check_in_desc" style={{ backgroundColor: MIDNIGHT }}>
                    Latest check-in first
                  </option>
                </select>
              </div>
            ) : (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "12px 16px",
                  border: `0.5px solid ${BORDER}`,
                  borderRadius: "10px",
                  color: WHITE,
                  fontFamily: LATO,
                  fontSize: "12px",
                }}
              >
                <span>Sort by: Newest</span>
                <span style={{ color: MUTED }}>v</span>
              </div>
            )}
            <button
              type="button"
              onClick={handleResetView}
              style={{
                width: "46px",
                height: "46px",
                border: `0.5px solid ${BORDER}`,
                borderRadius: "10px",
                backgroundColor: "transparent",
                color: WHITE,
                cursor: "pointer",
                fontFamily: LATO,
                fontSize: "16px",
                lineHeight: 1,
              }}
              aria-label="Reset booking filters"
            >
              R
            </button>
            {activeSection === "cancelled" && sectionBookings.length > 0 && (
              <button
                type="button"
                onClick={hideVisibleCancelledBookings}
                style={{
                  fontFamily: LATO,
                  fontSize: "10px",
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  color: MUTED,
                  backgroundColor: "transparent",
                  border: `0.5px solid ${BORDER}`,
                  padding: "12px 16px",
                  borderRadius: "10px",
                  cursor: "pointer",
                }}
              >
                Hide cancelled from view
              </button>
            )}
            {activeSection === "cancelled" && hiddenCancelledCount > 0 && (
              <button
                type="button"
                onClick={() => setHiddenCancelledIds([])}
                style={{
                  fontFamily: LATO,
                  fontSize: "10px",
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  color: GOLD,
                  backgroundColor: "rgba(197,164,109,0.08)",
                  border: "0.5px solid rgba(197,164,109,0.28)",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  cursor: "pointer",
                }}
              >
                Show hidden ({hiddenCancelledCount})
              </button>
            )}
          </div>
        </div>

        {loading ? (
          renderBookingSkeletons()
        ) : activeSection === "confirmed" && !confirmedSectionHasRows ? (
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, margin: 0 }}>{sectionEmptyCopy[activeSection]}</p>
        ) : activeSection !== "confirmed" && sectionBookings.length === 0 ? (
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, margin: 0 }}>{sectionEmptyCopy[activeSection]}</p>
        ) : activeSection === "pending" ? (
          // Phase 14A + 14B: pending section split into Stay Requests / Event Inquiries / Conflict / On Hold.
          <div style={{ display: "grid", gap: "20px" }}>
            {stayRequestBookings.length > 0 && (
              <div style={{ display: "grid", gap: "12px" }}>
                <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
                  Stay Requests ({stayRequestBookings.length})
                </p>
                {stayRequestBookings.map((booking) => renderCompactRow(booking, "pending"))}
              </div>
            )}
            {eventInquiryBookings.length > 0 && (
              <div style={{ display: "grid", gap: "12px" }}>
                <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: "#9db7d9", margin: 0 }}>
                  Event Inquiries ({eventInquiryBookings.length})
                </p>
                <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                  Event inquiries are reviewed separately. Pricing is customized after review — stay totals do not apply.
                </p>
                {eventInquiryBookings.map((booking) => renderCompactRow(booking, "pending"))}
              </div>
            )}
            {conflictHoldBookings.length > 0 && (
              <div style={{ display: "grid", gap: "12px" }}>
                <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: "#e07070", margin: 0 }}>
                  Conflict / On Hold ({conflictHoldBookings.length})
                </p>
                <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
                  These requests conflict with the calendar (confirmed stays or event setup windows). Resolve manually — no automatic action will be taken.
                </p>
                {conflictHoldBookings.map((booking) => renderCompactRow(booking, "pending"))}
              </div>
            )}
          </div>
        ) : activeSection === "confirmed" ? (
          <div style={{ display: "grid", gap: "20px" }}>
            {upcomingConfirmedBookings.length > 0 && (
              <div style={{ display: "grid", gap: "12px" }}>
                <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: "#6fcf8a", margin: 0 }}>
                  Confirmed / Upcoming ({upcomingConfirmedBookings.length})
                </p>
                <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.55 }}>
                  Today is on or before the window end date on the booking (check-out / event window end). Visual classification only — no database status change.
                </p>
                {upcomingConfirmedBookings.map((booking) => renderCompactRow(booking, "confirmed", { confirmedBand: "upcoming" }))}
              </div>
            )}
            {completedConfirmedBookings.length > 0 && (
              <div style={{ display: "grid", gap: "12px" }}>
                <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
                  Completed / Checked-out ({completedConfirmedBookings.length})
                </p>
                <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.55 }}>
                  Shown when today is after the booking window end on record. You can send a controlled feedback email from the expanded card (24-hour resend guard) or use{" "}
                  <span style={{ color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>Prepare feedback request</span> — nothing sends without your action.
                </p>
                {completedConfirmedBookings.map((booking) => renderCompactRow(booking, "confirmed", { confirmedBand: "completed" }))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "grid", gap: "12px" }}>
            {sectionBookings.map((booking) => renderCompactRow(booking, activeSection))}
          </div>
        )}
      </div>

      {activeSection === "pending" && (
        <div style={{ display: "grid", gap: "14px" }}>
          {renderSectionTeaser("confirmed")}
          {renderSectionTeaser("cancelled")}
        </div>
      )}
      </div>
    </>
  );
}
