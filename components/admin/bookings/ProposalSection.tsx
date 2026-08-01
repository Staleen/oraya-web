"use client";
import { memo } from "react";
import type { Booking } from "../types";
import { BORDER, fieldStyle, GOLD, LATO, MIDNIGHT, MUTED, WHITE } from "../theme";
import {
  EVENT_PROPOSAL_PAYMENT_METHODS,
  computeProposalLineTotal,
  formatAdvisoryLabel,
  formatDateTimeValue,
  formatEventProposalServiceLabel,
  formatMoney,
  getPaymentStatus,
  isEventInquiryBooking,
  isProposalExpired,
  parseAmountInput,
  parseLineItemNumber,
  parseRequestedEventServicesFromMessage,
  renderRevenueEstimateRow,
  sumProposalLineItemDrafts,
  type ProposalDraft,
  type ProposalLineItemDraft,
} from "./helpers";
import { buildInitialProposalDraftFromBooking, validateProposalForSend } from "./drafts";
import type { BookingCardActions } from "./actions";
import { roundMoney } from "@/lib/money";

/**
 * Remediation 2 (B.1) — renderEventProposalSection extracted verbatim into a
 * memoized child keyed on the booking + its proposal draft slice.
 */
function ProposalSectionImpl({
  booking,
  draftSlice,
  activeProposalAction,
  isMobile,
  actions,
  sendEmailFailed = false,
}: {
  booking: Booking;
  draftSlice: ProposalDraft | undefined;
  /** "save-proposal" | "send-proposal" while in flight for THIS booking; null otherwise. */
  activeProposalAction: string | null;
  isMobile: boolean;
  actions: BookingCardActions;
  /** Audit B-4: the latest proposal send reported email_sent=false — the "sent" status must not read as delivered. */
  sendEmailFailed?: boolean;
}) {
    if (!isEventInquiryBooking(booking)) return null;

    const draft = draftSlice ?? buildInitialProposalDraftFromBooking(booking);
    const proposalExpired = isProposalExpired(booking.proposal_status, booking.proposal_valid_until);
    const proposalStatus = proposalExpired ? "expired" : booking.proposal_status ?? "draft";
    const statusLabel =
      proposalStatus === "sent"
        ? "Proposal sent"
      : proposalStatus === "draft"
          ? "Draft proposal"
          : proposalStatus === "accepted"
            ? booking.status === "confirmed"
              ? "Accepted · Confirmed"
              : "Accepted · Awaiting deposit"
            : proposalStatus === "declined"
              ? "Declined"
              : proposalStatus === "expired"
                ? "Proposal expired"
                : formatAdvisoryLabel(proposalStatus);
    const validUntil = formatDateTimeValue(booking.proposal_valid_until);
    const sentAt = formatDateTimeValue(booking.proposal_sent_at);
    const respondedAt = formatDateTimeValue(booking.proposal_responded_at);
    const isSavingDraft = activeProposalAction === "save-proposal";
    const isSendingProposal = activeProposalAction === "send-proposal";
    const cannotSendProposal = proposalStatus === "accepted";
    const sendProposalLabel = proposalStatus === "sent" ? "Resend proposal" : "Send proposal";
    // Phase 15H: live-computed totals + draft-level send validation drive the side panel + button state.
    const liveTotalNum = sumProposalLineItemDrafts(draft.lineItems);
    const liveDepositNum = parseAmountInput(draft.depositAmount);
    // Original guest-requested services — preserved snapshot, never mutated by proposal edits.
    const originalRequestedServices = parseRequestedEventServicesFromMessage(booking.message);
    const sendValidation = validateProposalForSend(draft);
    const sendBlockedReason = sendValidation.ok ? null : sendValidation.error;

    const includedLines = draft.lineItems.filter((line) => line.included);
    const excludedLines = draft.lineItems.filter((line) => !line.included);
    const subtotalRounded = roundMoney(liveTotalNum);
    const finalTotalRounded = roundMoney(subtotalRounded);
    const depositRounded =
      liveDepositNum != null && Number.isFinite(liveDepositNum) ? roundMoney(liveDepositNum) : roundMoney(0);
    const remainingBalanceRounded = roundMoney(Math.max(0, roundMoney(finalTotalRounded - depositRounded)));

    const renderProposalLineCard = (line: ProposalLineItemDraft) => {
      const lineUnit = parseLineItemNumber(line.unitPrice);
      const lineQty = parseLineItemNumber(line.quantity);
      const lineTotal = computeProposalLineTotal(lineUnit, lineQty);
      return (
        <div
          key={line.key}
          style={{
            border: `0.5px solid ${line.included ? "rgba(157,183,217,0.32)" : "rgba(255,255,255,0.08)"}`,
            backgroundColor: line.included ? "rgba(157,183,217,0.06)" : "rgba(255,255,255,0.015)",
            padding: "10px 12px",
            borderRadius: "8px",
            display: "grid",
            gap: "8px",
            opacity: line.included ? 1 : 0.7,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={line.included}
                onChange={() => actions.toggleProposalLineIncluded(booking, line.key)}
                style={{ accentColor: GOLD, width: "14px", height: "14px", cursor: "pointer" }}
              />
              <span style={{ fontFamily: LATO, fontSize: "11px", color: line.included ? "#6fcf8a" : "#f2a7a7", textTransform: "uppercase", letterSpacing: "1px" }}>
                {line.included ? "Included" : "Excluded"}
              </span>
              <span
                style={{
                  fontFamily: LATO,
                  fontSize: "9px",
                  letterSpacing: "1.2px",
                  textTransform: "uppercase",
                  color: line.source === "custom" ? GOLD : "#9db7d9",
                  border: `0.5px solid ${line.source === "custom" ? "rgba(197,164,109,0.32)" : "rgba(157,183,217,0.32)"}`,
                  padding: "2px 6px",
                  borderRadius: "4px",
                }}
              >
                {line.source === "custom" ? "Custom" : "Guest request"}
              </span>
            </label>
            {line.source === "custom" ? (
              <button
                type="button"
                onClick={() => actions.removeProposalLineItem(booking, line.key)}
                style={{
                  fontFamily: LATO,
                  fontSize: "10px",
                  letterSpacing: "1.4px",
                  textTransform: "uppercase",
                  color: "#f2a7a7",
                  backgroundColor: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                Remove
              </button>
            ) : null}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.1fr) auto",
              gap: "8px",
              alignItems: "center",
            }}
          >
            <input
              value={line.label}
              onChange={(event) => actions.updateProposalLineItem(booking, line.key, { label: event.target.value })}
              placeholder="Service name"
              style={fieldStyle}
            />
            <input
              value={line.quantity}
              onChange={(event) => actions.updateProposalLineItem(booking, line.key, { quantity: event.target.value })}
              placeholder="Qty"
              inputMode="decimal"
              style={fieldStyle}
            />
            <input
              value={line.unitLabel}
              onChange={(event) => actions.updateProposalLineItem(booking, line.key, { unitLabel: event.target.value })}
              placeholder="Unit (guest, hour…)"
              style={fieldStyle}
            />
            <input
              value={line.unitPrice}
              onChange={(event) => actions.updateProposalLineItem(booking, line.key, { unitPrice: event.target.value })}
              placeholder="Unit price"
              inputMode="decimal"
              style={fieldStyle}
            />
            <span
              style={{
                fontFamily: LATO,
                fontSize: "12px",
                color: line.included ? GOLD : MUTED,
                whiteSpace: "nowrap",
                textAlign: "right",
                minWidth: "80px",
              }}
            >
              {formatMoney(roundMoney(lineTotal)) ?? "—"}
            </span>
          </div>
          <input
            value={line.notes}
            onChange={(event) => actions.updateProposalLineItem(booking, line.key, { notes: event.target.value })}
            placeholder="Internal note (optional)"
            style={{ ...fieldStyle, fontSize: "12px" }}
          />
        </div>
      );
    };

    return (
      <div
        style={{
          border: "0.5px solid rgba(157,183,217,0.26)",
          backgroundColor: "rgba(157,183,217,0.05)",
          padding: "14px 16px",
          borderRadius: "8px",
          display: "grid",
          gap: "14px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: "4px" }}>
            <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#9db7d9", margin: 0 }}>
              Event Proposal
            </p>
            <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.45 }}>
              Draft, send, and revise — no auto-confirm or payment.
            </p>
          </div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: LATO,
              fontSize: "9px",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              color:
                proposalStatus === "accepted"
                  ? "#6fcf8a"
                  : proposalStatus === "declined" || proposalStatus === "expired"
                    ? "#f2a7a7"
                    : proposalStatus === "sent"
                      ? GOLD
                      : "#9db7d9",
              backgroundColor:
                proposalStatus === "accepted"
                  ? "rgba(111,207,138,0.15)"
                  : proposalStatus === "declined" || proposalStatus === "expired"
                    ? "rgba(224,112,112,0.12)"
                    : proposalStatus === "sent"
                      ? "rgba(197,164,109,0.14)"
                      : "rgba(157,183,217,0.14)",
              border: `0.5px solid ${
                proposalStatus === "accepted"
                  ? "rgba(111,207,138,0.3)"
                  : proposalStatus === "declined" || proposalStatus === "expired"
                    ? "rgba(224,112,112,0.3)"
                    : proposalStatus === "sent"
                      ? "rgba(197,164,109,0.28)"
                      : "rgba(157,183,217,0.26)"
              }`,
              padding: "6px 10px",
              borderRadius: "6px",
              whiteSpace: "nowrap",
            }}
          >
            {statusLabel}
          </span>
        </div>

        {sendEmailFailed && (
          <div
            role="alert"
            style={{
              border: "0.5px solid rgba(224,112,112,0.34)",
              backgroundColor: "rgba(224,112,112,0.10)",
              padding: "10px 12px",
              borderRadius: "6px",
            }}
          >
            <p style={{ fontFamily: LATO, fontSize: "12px", color: "#f4b3b3", margin: 0, lineHeight: 1.6 }}>
              The proposal is marked sent, but the email to the guest FAILED — the guest has not received it. Use
              &ldquo;Resend proposal&rdquo; once the issue is resolved.
            </p>
          </div>
        )}

        <details
          style={{
            border: "0.5px solid rgba(157,183,217,0.22)",
            borderRadius: "8px",
            padding: "8px 12px",
            backgroundColor: "rgba(157,183,217,0.04)",
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              fontFamily: LATO,
              fontSize: "10px",
              letterSpacing: "1.3px",
              textTransform: "uppercase",
              color: "#9db7d9",
            }}
          >
            Info — pricing & flow
          </summary>
          <div style={{ marginTop: "10px", display: "grid", gap: "8px" }}>
            <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
              Custom pricing; guests only see the proposal after send.
            </p>
            <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
              Flow: sent → accepted → confirmed → payment requested → paid.
            </p>
          </div>
        </details>

        {(proposalStatus === "accepted" || proposalStatus === "declined" || proposalStatus === "expired") && (
          <div
            style={{
              border:
                proposalStatus === "accepted"
                  ? "0.5px solid rgba(111,207,138,0.26)"
                  : "0.5px solid rgba(224,112,112,0.26)",
              backgroundColor:
                proposalStatus === "accepted"
                  ? "rgba(111,207,138,0.08)"
                  : "rgba(224,112,112,0.08)",
              padding: "10px 12px",
              borderRadius: "6px",
            }}
          >
            <p
              style={{
                fontFamily: LATO,
                fontSize: "11px",
                color:
                  proposalStatus === "accepted"
                    ? "#6fcf8a"
                    : proposalStatus === "declined"
                      ? "#f2a7a7"
                      : "#f0bd67",
                margin: 0,
                lineHeight: 1.55,
              }}
            >
              {proposalStatus === "accepted"
                ? booking.status === "confirmed"
                  ? "Proposal accepted — confirmed. Continue manual deposit follow-up below."
                  : "Proposal accepted — awaiting deposit confirmation. Confirm event after deposit received."
                : proposalStatus === "declined"
                  ? "Guest declined proposal — revise or close request."
                  : "Proposal expired."}
            </p>
          </div>
        )}

        {proposalStatus === "accepted" && booking.status === "confirmed" && (
          <div
            style={{
              border:
                getPaymentStatus(booking) === "payment_requested" || getPaymentStatus(booking) === "deposit_paid" || getPaymentStatus(booking) === "paid_in_full"
                  ? "0.5px solid rgba(111,207,138,0.26)"
                  : "0.5px solid rgba(197,164,109,0.26)",
              backgroundColor:
                getPaymentStatus(booking) === "payment_requested" || getPaymentStatus(booking) === "deposit_paid" || getPaymentStatus(booking) === "paid_in_full"
                  ? "rgba(111,207,138,0.08)"
                  : "rgba(197,164,109,0.08)",
              padding: "10px 12px",
              borderRadius: "6px",
            }}
          >
            <p
              style={{
                fontFamily: LATO,
                fontSize: "11px",
                color:
                  getPaymentStatus(booking) === "payment_requested" || getPaymentStatus(booking) === "deposit_paid" || getPaymentStatus(booking) === "paid_in_full"
                    ? "#6fcf8a"
                    : GOLD,
                margin: 0,
                lineHeight: 1.55,
              }}
            >
              {getPaymentStatus(booking) === "payment_requested" || getPaymentStatus(booking) === "deposit_paid" || getPaymentStatus(booking) === "paid_in_full"
                ? "Event confirmed and payment is in progress."
                : "Event confirmed. Request payment to secure the booking."}
            </p>
          </div>
        )}

        {/* Phase 15H — read-only computed total + editable deposit/deadline. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
            gap: "12px",
          }}
        >
          <div
            style={{
              ...fieldStyle,
              padding: "10px 12px",
              display: "grid",
              gap: "4px",
              backgroundColor: "rgba(255,255,255,0.02)",
              cursor: "default",
            }}
          >
            <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED }}>
              Proposal total (computed)
            </span>
            <span style={{ fontFamily: LATO, fontSize: "13px", color: liveTotalNum > 0 ? GOLD : MUTED }}>
              {liveTotalNum > 0 ? formatMoney(roundMoney(liveTotalNum)) : "Add line items below"}
            </span>
          </div>
          {/* Phase 15H.1 — deposit is admin-controlled. Prefilled at 50% on first draft only. */}
          <div style={{ display: "grid", gap: "4px" }}>
            <input
              value={draft.depositAmount}
              onChange={(event) =>
                actions.updateProposalDraft(booking, { depositAmount: event.target.value })
              }
              placeholder="Deposit amount"
              inputMode="decimal"
              style={fieldStyle}
            />
            <span style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, lineHeight: 1.5 }}>
              Suggested: 50% deposit (editable)
            </span>
          </div>
          <input
            type="datetime-local"
            value={draft.validUntil}
            onChange={(event) =>
              actions.updateProposalDraft(booking, { validUntil: event.target.value, deadlineManuallyEdited: true })
            }
            style={fieldStyle}
          />
        </div>

        {/* Phase 15H — Quote builder: line items drive the proposal total. */}
        <div style={{ display: "grid", gap: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: WHITE, margin: 0 }}>
              Quote line items
            </p>
            <button
              type="button"
              onClick={() => actions.addCustomProposalLineItem(booking)}
              style={{
                fontFamily: LATO,
                fontSize: "10px",
                letterSpacing: "1.4px",
                textTransform: "uppercase",
                color: GOLD,
                backgroundColor: "rgba(197,164,109,0.08)",
                border: "0.5px solid rgba(197,164,109,0.3)",
                padding: "8px 12px",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              + Add custom service
            </button>
          </div>
          <details style={{ margin: 0 }}>
            <summary style={{ cursor: "pointer", fontFamily: LATO, fontSize: "10px", color: MUTED }}>
              Line items — Include / Exclude
            </summary>
            <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: "8px 0 0", lineHeight: 1.45 }}>
              Exclude toggles a line off the billable subtotal; optional rows stay editable. Original guest request is preserved below.
            </p>
          </details>

          {draft.lineItems.length === 0 ? (
            <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.55 }}>
              No line items yet. Add a custom service or wait for guest-requested services to populate.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              <div style={{ display: "grid", gap: "8px" }}>
                <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#6fcf8a", margin: 0 }}>
                  Included services (billable)
                </p>
                {includedLines.length === 0 ? (
                  <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.55 }}>
                    No billable lines — turn <em>Include</em> on for rows below, or add a custom service.
                  </p>
                ) : (
                  <div style={{ display: "grid", gap: "8px" }}>{includedLines.map((line) => renderProposalLineCard(line))}</div>
                )}
              </div>
              <div style={{ display: "grid", gap: "8px" }}>
                <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#9db7d9", margin: 0 }}>
                  Optional / excluded services
                </p>
                {excludedLines.length === 0 ? (
                  <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.55 }}>
                    No optional or excluded lines.
                  </p>
                ) : (
                  <div style={{ display: "grid", gap: "8px" }}>{excludedLines.map((line) => renderProposalLineCard(line))}</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Phase 15H — preserved snapshot of the original guest request. Read-only. */}
        {originalRequestedServices.length > 0 && (
          <details style={{ border: "0.5px dashed rgba(157,183,217,0.28)", backgroundColor: "rgba(157,183,217,0.04)", padding: "10px 12px", borderRadius: "6px" }}>
            <summary style={{ cursor: "pointer", fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: "#9db7d9" }}>
              Original guest request ({originalRequestedServices.length})
            </summary>
            <ul style={{ margin: "8px 0 0", paddingLeft: "18px", fontFamily: LATO, fontSize: "12px", color: MUTED, lineHeight: 1.6 }}>
              {originalRequestedServices.map((service) => (
                <li key={service.key}>{formatEventProposalServiceLabel(service)}</li>
              ))}
            </ul>
            <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: "6px 0 0", lineHeight: 1.5 }}>
              This snapshot is preserved from the inquiry message and is never mutated by proposal edits.
            </p>
          </details>
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
              letterSpacing: "1.3px",
              textTransform: "uppercase",
              color: WHITE,
            }}
          >
            Guest payment options (required to send) · {draft.paymentMethods.length} selected
          </summary>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" }}>
            {EVENT_PROPOSAL_PAYMENT_METHODS.map((method) => {
              const selected = draft.paymentMethods.includes(method.value);
              return (
                <button
                  key={method.value}
                  type="button"
                  onClick={() =>
                    actions.updateProposalDraft(booking, {
                      paymentMethods: selected
                        ? draft.paymentMethods.filter((value) => value !== method.value)
                        : [...draft.paymentMethods, method.value],
                    })
                  }
                  style={{
                    fontFamily: LATO,
                    fontSize: "10px",
                    letterSpacing: "1.4px",
                    textTransform: "uppercase",
                    color: selected ? MIDNIGHT : WHITE,
                    backgroundColor: selected ? GOLD : "rgba(255,255,255,0.04)",
                    border: selected ? "none" : `0.5px solid ${BORDER}`,
                    padding: "10px 12px",
                    borderRadius: "999px",
                    cursor: "pointer",
                  }}
                >
                  {method.label}
                </button>
              );
            })}
          </div>
        </details>

        {/* Bug 9: collapse advanced/optional fields by default — open only if any has content. */}
        <details
          open={Boolean(
            draft.excludedServices.trim() || draft.optionalServices.trim() || draft.proposalNotes.trim(),
          )}
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
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              color: "#9db7d9",
            }}
          >
            Advanced (optional / excluded services + proposal notes)
          </summary>
          <div style={{ display: "grid", gap: "10px", marginTop: "10px" }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
              <textarea
                value={draft.excludedServices}
                onChange={(event) => actions.updateProposalDraft(booking, { excludedServices: event.target.value })}
                placeholder="Excluded services (optional)"
                rows={3}
                style={{ ...fieldStyle, resize: "vertical" }}
              />
              <textarea
                value={draft.optionalServices}
                onChange={(event) => actions.updateProposalDraft(booking, { optionalServices: event.target.value })}
                placeholder="Optional services (optional)"
                rows={3}
                style={{ ...fieldStyle, resize: "vertical" }}
              />
            </div>
            <textarea
              value={draft.proposalNotes}
              onChange={(event) => actions.updateProposalDraft(booking, { proposalNotes: event.target.value })}
              placeholder="Proposal notes (optional)"
              rows={3}
              style={{ ...fieldStyle, resize: "vertical" }}
            />
          </div>
        </details>

        <div
          style={{
            border: "0.5px solid rgba(197,164,109,0.28)",
            backgroundColor: "rgba(197,164,109,0.06)",
            padding: "12px 14px",
            borderRadius: "8px",
            display: "grid",
            gap: "10px",
          }}
        >
          <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
            Totals breakdown
          </p>
          {renderRevenueEstimateRow("Subtotal (included line items)", formatMoney(subtotalRounded) ?? "—")}
          {renderRevenueEstimateRow("Final total", formatMoney(finalTotalRounded) ?? "—")}
          {renderRevenueEstimateRow(
            "Deposit required (manual)",
            liveDepositNum != null ? formatMoney(depositRounded) ?? "—" : "—",
          )}
          {renderRevenueEstimateRow("Remaining balance", formatMoney(remainingBalanceRounded) ?? "—")}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
            gap: "10px 16px",
          }}
        >
          {renderRevenueEstimateRow("Payment deadline (valid until)", validUntil ?? "Not set")}
          {sentAt ? renderRevenueEstimateRow("Sent at", sentAt) : null}
          {respondedAt && (proposalStatus === "accepted" || proposalStatus === "declined")
            ? renderRevenueEstimateRow("Guest responded at", respondedAt)
            : null}
        </div>

        {sendBlockedReason && proposalStatus !== "accepted" && (
          <div
            style={{
              border: "0.5px solid rgba(240,189,103,0.32)",
              backgroundColor: "rgba(240,189,103,0.08)",
              padding: "10px 12px",
              borderRadius: "6px",
            }}
          >
            <p style={{ fontFamily: LATO, fontSize: "11px", color: "#f0bd67", margin: 0, lineHeight: 1.55 }}>
              Send blocked — {sendBlockedReason}
            </p>
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => actions.saveEventProposalDraft(booking)}
            disabled={isSavingDraft}
            style={{
              fontFamily: LATO,
              fontSize: "10px",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              color: WHITE,
              backgroundColor: "rgba(255,255,255,0.05)",
              border: `0.5px solid ${BORDER}`,
              padding: "12px 14px",
              borderRadius: "6px",
              cursor: isSavingDraft ? "not-allowed" : "pointer",
              opacity: isSavingDraft ? 0.7 : 1,
            }}
          >
            {isSavingDraft ? "Saving..." : "Save draft"}
          </button>
          <button
            type="button"
            onClick={() => actions.sendEventProposal(booking)}
            disabled={isSendingProposal || cannotSendProposal || Boolean(sendBlockedReason)}
            style={{
              fontFamily: LATO,
              fontSize: "10px",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              color: MIDNIGHT,
              backgroundColor: GOLD,
              border: "none",
              padding: "12px 14px",
              borderRadius: "6px",
              cursor: isSendingProposal || cannotSendProposal || sendBlockedReason ? "not-allowed" : "pointer",
              opacity: isSendingProposal || cannotSendProposal || sendBlockedReason ? 0.55 : 1,
            }}
          >
            {isSendingProposal ? "Sending..." : cannotSendProposal ? "Proposal accepted" : sendProposalLabel}
          </button>
        </div>
      </div>
    );
}

export const ProposalSection = memo(ProposalSectionImpl);
