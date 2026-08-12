import type { Booking } from "../types";
import type { PaymentDraft, ProposalDraft, ProposalLineItemDraft } from "./helpers";

/**
 * Remediation 2 (B.1) — the single stable actions object BookingsTable hands
 * to its memoized section components. The parent builds it ONCE (useMemo with
 * empty deps) from useEvent-style wrappers that delegate to the latest
 * closures via a ref, so its identity never changes and React.memo on the
 * sections holds.
 */
export type BookingCardPanelKey =
  | "proposal"
  | "payment"
  | "guestDetail"
  | "operationsContext"
  | "feedback"
  | "addons";

export interface BookingCardActions {
  toggleCardPanel: (bookingId: string, panel: BookingCardPanelKey, defaultOpen: boolean) => void;

  // Payment
  updatePaymentDraft: (bookingId: string, updates: Partial<PaymentDraft>) => void;
  sendPaymentReminder: (booking: Booking) => void;

  // Proposal
  updateProposalDraft: (booking: Booking, updates: Partial<ProposalDraft>) => void;
  updateProposalLineItem: (booking: Booking, key: string, updates: Partial<ProposalLineItemDraft>) => void;
  toggleProposalLineIncluded: (booking: Booking, key: string) => void;
  removeProposalLineItem: (booking: Booking, key: string) => void;
  addCustomProposalLineItem: (booking: Booking) => void;
  saveEventProposalDraft: (booking: Booking) => void;
  sendEventProposal: (booking: Booking) => void;

  // Add-ons
  resolveAddon: (bookingId: string, addonId: string, decision: "approve" | "decline") => void;

  // Compact rows
  toggleExpandedCompact: (bookingId: string) => void;
  prepFeedbackForBooking: (bookingId: string) => void;
}
