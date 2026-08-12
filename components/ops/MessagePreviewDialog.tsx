"use client";
import { useCallback, useEffect, useState } from "react";
import type { QueueBooking } from "@/lib/ops-queue";
import { describeDeclineRefund } from "@/lib/ops/decline-refund";
import { decideDeclineRefundForBooking } from "@/lib/ops/decline-refund-execution";
import { Banner, Button, Kicker, Row, Rows, T } from "@/components/ops/ui";

/**
 * Preview-over-confirmation: approving, declining or cancelling a stay is
 * gated behind SEEING the messages the guest will receive — never behind
 * "Are you sure?". The preview content comes from the server, evaluated with
 * the same recipient resolution and WhatsApp gates the real dispatch uses;
 * the send itself goes through the one shared copy in
 * lib/booking-guest-dispatch.ts.
 */

interface EmailPreview {
  will_send: boolean;
  subject: string;
  heading: string;
  intro: string;
  summary_rows: Array<[string, string]>;
  addons: Array<{ label: string; price_label: string; notes: string[] }>;
  payment_rows: Array<[string, string]>;
  note: string | null;
  includes_view_link: boolean;
  includes_arrival_guide: boolean;
}

interface WhatsAppPreview {
  applicable: boolean;
  will_send?: boolean;
  reason?: string | null;
  phone?: string | null;
  template?: string;
  fields?: {
    guest_name: string | null;
    villa: string | null;
    check_in: string | null;
    check_out: string | null;
    booking_reference: string;
  } | null;
}

interface PreviewResponse {
  ok?: boolean;
  error?: string;
  recipient?: { email: string | null; name: string };
  email?: EmailPreview;
  whatsapp?: WhatsAppPreview;
}

const WHATSAPP_SKIP_COPY: Record<string, string> = {
  missing_phone: "this booking has no phone number",
  not_configured: "WhatsApp sending is not switched on in this environment",
  non_production: "WhatsApp sending is off outside production",
  expired_stay: "the stay has already ended",
  already_sent: "the arrival guide was already sent for this booking",
};

export type PreviewAction =
  | { kind: "approve" }
  | { kind: "decline"; expectedStatus: "pending" | "confirmed" };

/** What the decline branch reports back about the money. Display only. */
type DeclineRefundResult = {
  kind: string;
  refunded_amount?: number;
  currency?: string | null;
  requires_void?: boolean;
  operator_note?: string | null;
};

/**
 * The stay is cancelled either way — this only says what happened to the money,
 * and never claims a refund the server did not report.
 */
function describeRefundOutcome(refund: DeclineRefundResult | null | undefined): string {
  if (!refund) return "";
  const currency = refund.currency ?? "USD";
  switch (refund.kind) {
    case "completed":
      return ` ${currency} ${(refund.refunded_amount ?? 0).toFixed(2)} refunded to the guest's card.`;
    case "stopped":
      return refund.requires_void
        ? " The card was never actually charged — release the hold in Ops → Payments."
        : ` The refund did not finish${refund.refunded_amount ? ` (${currency} ${refund.refunded_amount.toFixed(2)} returned so far)` : ""} — open Ops → Payments before retrying.`;
    case "errored":
      return ` The refund could not be completed${refund.refunded_amount ? ` (${currency} ${refund.refunded_amount.toFixed(2)} returned so far)` : ""} — check Ops → Payments before retrying.`;
    case "no_charges_found":
      return " No card charge was found to refund — return the money by hand.";
    case "lookup_failed":
      return " Oraya could not check this booking's payments — check Ops → Payments.";
    case "not_attempted":
      return refund.operator_note ? ` ${refund.operator_note}` : "";
    default:
      return "";
  }
}

export default function MessagePreviewDialog({
  action, booking, onClose, onOpen, onDone,
}: {
  action: PreviewAction;
  booking: QueueBooking;
  onClose: () => void;
  onOpen: () => void;
  onDone: (message: string) => void | Promise<void>;
}) {
  const isApprove = action.kind === "approve";
  const previewAction = isApprove ? "approve" : "decline";

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [sendError, setSendError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    setPreview(null);
    try {
      const r = await fetch(
        `/api/ops/bookings/${booking.id}/message-preview?action=${previewAction}`,
        { credentials: "include", cache: "no-store" },
      );
      const body = (await r.json()) as PreviewResponse;
      if (!r.ok || !body.ok) {
        setLoadError(body.error ?? "Couldn't load the message preview.");
        return;
      }
      setPreview(body);
    } catch {
      setLoadError("Couldn't reach Oraya. Nothing was sent.");
    }
  }, [booking.id, previewAction]);

  useEffect(() => {
    onOpen();
    void load();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen, onClose, load]);

  async function submit() {
    setBusy(true);
    setSendError("");
    try {
      const r = await fetch(`/api/ops/bookings/${booking.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isApprove
            ? { action: "approve" }
            : { action: "decline", expected_status: action.kind === "decline" ? action.expectedStatus : "pending" },
        ),
      });
      const body = (await r.json()) as {
        error?: string;
        email_sent?: boolean;
        whatsapp?: { dispatched: boolean; reason?: string } | null;
        refund?: DeclineRefundResult | null;
      };
      if (!r.ok) {
        setSendError(body.error ?? "That didn't go through. Nothing may have been sent.");
        return;
      }

      const emailPart = body.email_sent
        ? `Email sent to ${preview?.recipient?.email ?? "the guest"}.`
        : "No email was sent (no address on the booking).";
      const whatsappPart = !isApprove || body.whatsapp === null || body.whatsapp === undefined
        ? ""
        : body.whatsapp.dispatched
          ? " WhatsApp arrival guide sent."
          : ` WhatsApp arrival guide not sent${body.whatsapp.reason && WHATSAPP_SKIP_COPY[body.whatsapp.reason] ? ` — ${WHATSAPP_SKIP_COPY[body.whatsapp.reason]}` : ""}.`;
      await onDone(
        `${isApprove ? "Stay approved." : action.kind === "decline" && action.expectedStatus === "confirmed" ? "Stay cancelled." : "Request declined."} ${emailPart}${whatsappPart}${describeRefundOutcome(body.refund)}`,
      );
    } catch {
      setSendError("Couldn't reach Oraya — it may not have gone through. Check the booking before retrying.");
    } finally {
      setBusy(false);
    }
  }

  const title = isApprove
    ? "Approve this stay"
    : action.kind === "decline" && action.expectedStatus === "confirmed"
      ? "Cancel this stay"
      : "Decline this request";
  const sendLabel = isApprove
    ? "Send this and approve"
    : action.kind === "decline" && action.expectedStatus === "confirmed"
      ? "Send this and cancel the stay"
      : "Send this and decline";

  const email = preview?.email;
  const whatsapp = preview?.whatsapp;

  // Preview-over-confirmation applies to the money too: what declining does to
  // the guest's card is stated BEFORE anything is sent, from the same decision
  // the server will act on.
  const refundDecision = isApprove
    ? null
    : decideDeclineRefundForBooking({
        amount_paid: booking.amount_paid,
        refund_amount: booking.refund_amount,
        refund_status: booking.refund_status,
        payment_method: booking.payment_method,
        payment_provider: booking.payment_link_provider,
      });
  const refundLine = refundDecision ? describeDeclineRefund(refundDecision) : "";
  // Nothing was ever paid — there is no money consequence worth a banner.
  const showRefundLine = Boolean(
    refundDecision && (refundDecision.refund || refundDecision.reason !== "nothing_paid"),
  );

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(10,15,20,.72)", display: "grid", placeItems: "center", padding: "20px", zIndex: 80 }}
    >
      <div role="dialog" aria-modal="true" style={{
        background: T.navyLift, border: `1px solid ${T.border}`, borderRadius: T.rLg,
        width: "min(640px,100%)", maxHeight: "90vh", overflow: "auto",
      }}>
        <div style={{ padding: "22px 24px 0", display: "flex", justifyContent: "space-between", gap: "16px" }}>
          <div>
            <h2 style={{ fontFamily: T.serif, fontWeight: 400, fontSize: "22px", margin: 0 }}>{title}</h2>
            <p style={{ margin: "4px 0 0", fontSize: "13px", color: T.muted }}>
              This is what {preview?.recipient?.name ?? booking.guest_name ?? "the guest"} will receive.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: 0, color: T.muted, fontSize: "24px", lineHeight: 1, cursor: "pointer" }}>&times;</button>
        </div>

        <div style={{ padding: "20px 24px" }}>
          {sendError && <Banner tone="bad" title="Not sent">{sendError}</Banner>}
          {loadError && <Banner tone="bad" title="Preview unavailable" onRetry={() => void load()}>{loadError}</Banner>}

          {showRefundLine && (
            <Banner
              tone={refundDecision?.refund ? "warn" : "info"}
              title={refundDecision?.refund ? "This also returns money" : "The money needs you"}
            >
              {refundLine}
            </Banner>
          )}
          {!preview && !loadError && (
            <p style={{ color: T.faint, fontSize: "13px", margin: "8px 0" }}>Preparing the messages…</p>
          )}

          {email && (
            <div style={{ marginBottom: "22px" }}>
              <Kicker>Email</Kicker>
              {email.will_send ? (
                <div style={{ border: `1px solid ${T.borderStrong}`, borderRadius: T.r, overflow: "hidden" }}>
                  <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.borderFaint}`, background: T.surface }}>
                    <div style={{ fontSize: "12px", color: T.muted }}>
                      To <span style={{ color: T.ink }}>{preview?.recipient?.email}</span>
                    </div>
                    <div style={{ fontSize: "14px", marginTop: "2px" }}><b>{email.subject}</b></div>
                  </div>
                  <div style={{ padding: "18px", background: "rgba(0,0,0,.18)" }}>
                    <p style={{ fontFamily: T.serif, fontSize: "19px", margin: "0 0 8px", textAlign: "center" }}>{email.heading}</p>
                    <p style={{ fontSize: "12px", color: T.muted, lineHeight: 1.7, margin: "0 0 16px", textAlign: "center" }}>{email.intro}</p>
                    <Rows>
                      {email.summary_rows.map(([k, v]) => <Row key={k} k={k} v={v} />)}
                    </Rows>
                    {email.addons.length > 0 && (
                      <div style={{ marginTop: "14px" }}>
                        <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: T.gold, marginBottom: "8px" }}>Add-ons</div>
                        {email.addons.map((a) => (
                          <div key={a.label} style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "13px", padding: "6px 0", borderBottom: `1px solid ${T.borderFaint}` }}>
                            <span>
                              {a.label}
                              {a.notes.map((n) => (
                                <span key={n} style={{ display: "block", fontSize: "11px", color: T.faint }}>{n}</span>
                              ))}
                            </span>
                            <span style={{ color: T.gold, whiteSpace: "nowrap" }}>{a.price_label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ marginTop: "14px" }}>
                      <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: T.gold, marginBottom: "8px" }}>Payment summary</div>
                      {email.payment_rows.map(([k, v]) => (
                        <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", padding: "4px 0" }}>
                          <span style={{ color: T.muted }}>{k}</span><span>{v}</span>
                        </div>
                      ))}
                    </div>
                    {email.note && (
                      <div style={{ marginTop: "14px" }}>
                        <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: T.gold, marginBottom: "6px" }}>Special request / notes</div>
                        <p style={{ fontSize: "13px", margin: 0, whiteSpace: "pre-line", color: T.ink2 }}>{email.note}</p>
                      </div>
                    )}
                    {(email.includes_view_link || email.includes_arrival_guide) && (
                      <p style={{ fontSize: "12px", color: T.faint, margin: "16px 0 0" }}>
                        Includes {email.includes_arrival_guide ? "their personal Arrival Guide link" : ""}
                        {email.includes_arrival_guide && email.includes_view_link ? " and " : ""}
                        {email.includes_view_link ? "a secure link to view the booking online" : ""}.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ border: `1px dashed ${T.warnBr}`, background: T.warnBg, borderRadius: T.r, padding: "14px 16px", fontSize: "13px" }}>
                  <b>No email will be sent</b>
                  <span style={{ display: "block", color: T.muted, marginTop: "2px" }}>
                    This booking has no email address. The guest will not hear about this by email.
                  </span>
                </div>
              )}
            </div>
          )}

          {whatsapp && whatsapp.applicable && (
            <div>
              <Kicker>WhatsApp</Kicker>
              {whatsapp.will_send && whatsapp.fields ? (
                <div>
                  <div style={{
                    background: "rgba(111,207,138,.09)", border: `1px solid ${T.okBr}`,
                    borderRadius: "14px 14px 14px 4px", padding: "14px 16px", maxWidth: "440px",
                  }}>
                    <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.65 }}>
                      Arrival guide for <b>{whatsapp.fields.guest_name ?? "the guest"}</b> — {whatsapp.fields.villa},{" "}
                      {whatsapp.fields.check_in} → {whatsapp.fields.check_out}, booking{" "}
                      <b>{whatsapp.fields.booking_reference}</b>, with their personal Arrival Guide link.
                    </p>
                  </div>
                  <p style={{ fontSize: "11px", color: T.faint, margin: "8px 0 0" }}>
                    Sent to +{whatsapp.phone} as the approved template “{whatsapp.template}” — the exact wording is
                    the WhatsApp-approved template text.
                  </p>
                </div>
              ) : (
                <div style={{ border: `1px dashed ${T.borderStrong}`, borderRadius: T.r, padding: "14px 16px", fontSize: "13px", background: T.surface }}>
                  <b>No WhatsApp will be sent</b>
                  <span style={{ display: "block", color: T.muted, marginTop: "2px" }}>
                    {whatsapp.reason && WHATSAPP_SKIP_COPY[whatsapp.reason]
                      ? `Because ${WHATSAPP_SKIP_COPY[whatsapp.reason]}.`
                      : "The arrival guide cannot be sent for this booking."}
                    {" "}The email above is unaffected.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: "16px 24px 22px", display: "flex", gap: "10px", justifyContent: "flex-end", borderTop: `1px solid ${T.borderFaint}` }}>
          <Button onClick={onClose}>Not now</Button>
          <Button
            variant={isApprove ? "primary" : "danger"}
            disabled={busy || !preview}
            onClick={() => void submit()}
          >
            {busy ? "Sending…" : sendLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
