"use client";
import { memo } from "react";
import type { Booking } from "../types";
import { BORDER, GOLD, LATO, MIDNIGHT, MUTED, WHITE } from "../theme";
import {
  computeDefaultPaymentPanelOpen,
  formatAdvisoryLabel,
  formatDateTimeValue,
  formatMoney,
  getPaymentStatus,
  getPaymentStatusStyle,
  isPaymentOverdue,
  renderFoundationLedgerBadge,
  renderPaymentStatusBadge,
  renderRevenueEstimateRow,
  type PaymentDraft,
} from "./helpers";
import type { BookingCardActions } from "./actions";
import {
  computeFoundationAmountDue,
  getFoundationAmountTotal,
  getFoundationDepositDisplay,
} from "@/lib/payment-foundation";
import { roundMoney } from "@/lib/money";

/**
 * The action key in flight for THIS booking (derived per-card by the parent
 * from `paymentUpdatingId`; null for every other booking, so memo holds).
 */
export type ActivePaymentAction = string | null;

/**
 * Remediation 2 (B.1) — renderPaymentSection extracted verbatim into a
 * memoized child. Keystrokes in another card's drafts leave this card's
 * props untouched, so React.memo skips it.
 */
function PaymentSectionImpl({
  booking,
  activePaymentAction,
  panelOpenStored,
  isMobile,
  actions,
}: {
  booking: Booking;
  /** Retained for prop compatibility; money drafts moved to Ops → Payments. */
  draftSlice?: PaymentDraft | undefined;
  activePaymentAction: ActivePaymentAction;
  panelOpenStored: boolean | undefined;
  isMobile: boolean;
  actions: BookingCardActions;
}) {
  // Audit B-5: a cancelled booking that holds recorded guest money must keep
  // its payment summary and the manual-refund recorder (REFUND_RUNBOOK Step C
  // has no status restriction, and neither does the API). Guest-chasing
  // actions (request deposit / record payment / reminder) stay confirmed-only.
  const recordedPaid =
    typeof booking.amount_paid === "number" && Number.isFinite(booking.amount_paid) ? booking.amount_paid : 0;
  const cancelledWithMoney =
    booking.status === "cancelled" &&
    (recordedPaid > 0 ||
      booking.refund_status != null ||
      booking.payment_status === "deposit_paid" ||
      booking.payment_status === "paid_in_full");
  if (booking.status !== "confirmed" && !cancelledWithMoney) return null;

  const paymentStatus = getPaymentStatus(booking);
  const overdue = booking.status === "confirmed" && isPaymentOverdue(booking);
  const paymentTone = getPaymentStatusStyle(paymentStatus, overdue);
  const amountPaidRaw = recordedPaid;
  const requestSentAt = formatDateTimeValue(booking.payment_requested_at);
  const receivedAt = formatDateTimeValue(booking.payment_received_at);
  const dueAt = formatDateTimeValue(booking.payment_due_at);
  const refundedAt = formatDateTimeValue(booking.refunded_at);
  const isReminderSending = activePaymentAction === "send-reminder";

  const foundationStoredTotal =
    typeof booking.amount_total === "number" && Number.isFinite(booking.amount_total) ? roundMoney(booking.amount_total) : null;
  const foundationComputedTotal = getFoundationAmountTotal(booking);
  const effectiveAmountTotal = foundationStoredTotal ?? foundationComputedTotal;
  const effectiveAmountDue =
    typeof booking.amount_due === "number" && Number.isFinite(booking.amount_due)
      ? roundMoney(booking.amount_due)
      : computeFoundationAmountDue(effectiveAmountTotal, amountPaidRaw);
  const foundationDepositForOverview = getFoundationDepositDisplay(booking);
  const lastFoundationPaymentAt = formatDateTimeValue(booking.payment_last_at);

  const paymentDefaultOpen = computeDefaultPaymentPanelOpen(booking);
  const paymentPanelOpen = panelOpenStored !== undefined ? panelOpenStored : paymentDefaultOpen;

  return (
    <div
      style={{
        border: `0.5px solid ${paymentTone.border}`,
        backgroundColor: paymentTone.background,
        padding: "14px 16px",
        borderRadius: "8px",
        display: "grid",
        gap: "12px",
      }}
    >
      {overdue && (
        <div
          style={{
            border: "0.5px solid rgba(224,112,112,0.3)",
            backgroundColor: "rgba(224,112,112,0.12)",
            padding: "10px 12px",
            borderRadius: "6px",
          }}
        >
          <p style={{ fontFamily: LATO, fontSize: "11px", color: "#f4b3b3", margin: 0, lineHeight: 1.5 }}>
            Payment overdue — follow up with the guest.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => actions.toggleCardPanel(booking.id, "payment", paymentDefaultOpen)}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
          width: "100%",
          cursor: "pointer",
          backgroundColor: "rgba(255,255,255,0.03)",
          border: `0.5px solid ${BORDER}`,
          borderRadius: "8px",
          padding: "10px 12px",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
          <span style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: paymentTone.color }}>
            Payment
          </span>
          {renderPaymentStatusBadge(booking)}
          {renderFoundationLedgerBadge(booking)}
          {booking.refund_status === "refunded" && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: LATO,
                fontSize: "9px",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: "#f08b8b",
                backgroundColor: "rgba(224,112,112,0.14)",
                border: "0.5px solid rgba(224,112,112,0.32)",
                padding: "6px 10px",
                borderRadius: "6px",
                whiteSpace: "nowrap",
              }}
            >
              Refunded
            </span>
          )}
        </div>
        <span style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.2px", textTransform: "uppercase", color: GOLD }}>
          {paymentPanelOpen ? "Hide details" : "View details"}
        </span>
      </button>

      {paymentPanelOpen && (
        <>
          <div
            style={{
              border: "0.5px solid rgba(197,164,109,0.22)",
              backgroundColor: "rgba(197,164,109,0.06)",
              padding: "12px 14px",
              borderRadius: "8px",
              display: "grid",
              gap: "10px",
            }}
          >
            <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
              Summary
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                gap: "10px 14px",
              }}
            >
              {renderRevenueEstimateRow(
                "Total amount",
                effectiveAmountTotal !== null ? formatMoney(effectiveAmountTotal) ?? "Not available" : "Not available",
              )}
              {renderRevenueEstimateRow("Amount paid", formatMoney(amountPaidRaw) ?? "$0")}
              {renderRevenueEstimateRow(
                "Amount due / remaining",
                effectiveAmountDue !== null ? formatMoney(effectiveAmountDue) ?? "Not available" : "Not available",
              )}
              {renderRevenueEstimateRow(
                "Deposit",
                foundationDepositForOverview !== null ? formatMoney(foundationDepositForOverview) ?? "—" : "—",
              )}
              {renderRevenueEstimateRow("Last payment date", lastFoundationPaymentAt ?? "—")}
            </div>
          </div>

          {/* Audit B-6 (#19): a recorded refund must be readable back — amount, date,
              and the required Business Center reference — not just a badge. */}
          {(booking.refund_status != null ||
            booking.refunded_at != null ||
            booking.refund_provider_reference?.trim()) && (
            <div
              style={{
                border: "0.5px solid rgba(224,112,112,0.28)",
                backgroundColor: "rgba(224,112,112,0.07)",
                padding: "12px 14px",
                borderRadius: "8px",
                display: "grid",
                gap: "10px",
              }}
            >
              <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#f08b8b", margin: 0 }}>
                Recorded refund
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                  gap: "10px 14px",
                }}
              >
                {renderRevenueEstimateRow("Refunded amount", formatMoney(booking.refund_amount) ?? "Not recorded")}
                {renderRevenueEstimateRow("Refunded on", refundedAt ?? "Not recorded")}
                {renderRevenueEstimateRow(
                  "Business Center reference",
                  booking.refund_provider_reference?.trim() || "Not recorded",
                )}
                {booking.refund_status
                  ? renderRevenueEstimateRow("Refund status", formatAdvisoryLabel(booking.refund_status.replaceAll("_", " ")))
                  : null}
              </div>
            </div>
          )}

          <details
            style={{
              border: `0.5px solid ${BORDER}`,
              backgroundColor: "rgba(255,255,255,0.02)",
              padding: "10px 12px",
              borderRadius: "8px",
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                fontFamily: LATO,
                fontSize: "10px",
                letterSpacing: "1.2px",
                textTransform: "uppercase",
                color: MUTED,
              }}
            >
              References &amp; timestamps
            </summary>
            <div
              style={{
                marginTop: "10px",
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                gap: "10px 16px",
              }}
            >
              {booking.payment_method
                ? renderRevenueEstimateRow(
                    "Recorded method",
                    formatAdvisoryLabel(booking.payment_method.replaceAll("_", " ")),
                  )
                : null}
              {dueAt ? renderRevenueEstimateRow("Due date", dueAt) : null}
              {requestSentAt ? renderRevenueEstimateRow("Requested", requestSentAt) : null}
              {receivedAt ? renderRevenueEstimateRow("Received", receivedAt) : null}
              {refundedAt ? renderRevenueEstimateRow("Refunded", refundedAt) : null}
              {booking.payment_reference?.trim()
                ? renderRevenueEstimateRow("Reference", booking.payment_reference.trim())
                : null}
              {booking.payment_notes?.trim() ? renderRevenueEstimateRow("Notes", booking.payment_notes.trim()) : null}
            </div>
          </details>

      {cancelledWithMoney && (
        <p style={{ fontFamily: LATO, fontSize: "11px", color: "#e2ab5a", margin: 0, lineHeight: 1.55 }}>
          Cancelled booking with recorded guest money — the refund is recorded in Ops → Payments
          (see REFUND_RUNBOOK).
        </p>
      )}

      {/*
        Phase 16B W2: recording money moved to Ops → Payments. This console wrote
        booking money columns directly — no ledger row, no idempotency key — which
        is how a duplicate receipt was written on 2026-08-11. The summaries above
        stay: history is readable here, it just is not writable here.
      */}
      <div
        style={{
          border: `0.5px solid ${BORDER}`,
          backgroundColor: "rgba(255,255,255,0.02)",
          padding: "12px",
          borderRadius: "8px",
          display: "grid",
          gap: "8px",
        }}
      >
        <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: WHITE, margin: 0 }}>
          Money is recorded in Ops
        </p>
        <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.55 }}>
          Requesting a deposit, recording a payment and recording a refund all live in{" "}
          <a href="/ops/payments" style={{ color: GOLD, textDecoration: "underline" }}>Ops → Payments</a>,
          which writes through the payment ledger so the same payment cannot be counted twice.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile || cancelledWithMoney ? "1fr" : "repeat(3, minmax(0, 1fr))",
          gap: "12px",
        }}
      >
        {booking.status === "confirmed" && (
        <div
          style={{
            border: `0.5px solid ${paymentStatus === "payment_requested" ? "rgba(197,164,109,0.24)" : BORDER}`,
            backgroundColor: paymentStatus === "payment_requested" ? "rgba(197,164,109,0.04)" : "rgba(255,255,255,0.02)",
            padding: "12px",
            borderRadius: "8px",
            display: "grid",
            gap: "10px",
          }}
        >
          <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: WHITE, margin: 0 }}>
            Send reminder
          </p>
          <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: 0, lineHeight: 1.45 }}>
            Resend reminder email and log a note.
          </p>
          <button
            type="button"
            onClick={() => actions.sendPaymentReminder(booking)}
            disabled={paymentStatus !== "payment_requested" || isReminderSending}
            style={{
              fontFamily: LATO,
              fontSize: "10px",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              color: paymentStatus === "payment_requested" ? MIDNIGHT : MUTED,
              backgroundColor: paymentStatus === "payment_requested" ? GOLD : "rgba(255,255,255,0.05)",
              border: paymentStatus === "payment_requested" ? "none" : `0.5px solid ${BORDER}`,
              padding: "12px 14px",
              borderRadius: "6px",
              cursor: paymentStatus === "payment_requested" && !isReminderSending ? "pointer" : "not-allowed",
              opacity: paymentStatus === "payment_requested" ? (isReminderSending ? 0.7 : 1) : 0.55,
            }}
          >
            {isReminderSending ? "Sending..." : "Send payment reminder"}
          </button>
        </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}

export const PaymentSection = memo(PaymentSectionImpl);
