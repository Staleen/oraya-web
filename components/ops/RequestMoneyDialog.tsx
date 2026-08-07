"use client";
import { useCallback, useEffect, useState } from "react";
import type { QueueBooking } from "@/lib/ops-queue";
import { bookingMoneyView } from "@/lib/ops-booking-display";
import { Banner, Button, Field, Kicker, Row, Rows, T } from "@/components/ops/ui";

/**
 * Asking a guest for money — the /ops half of the Phase 16B payment
 * lifecycle. Requesting sets `payment_status = payment_requested` and sends
 * the SAME deposit-request email the legacy admin sends; a reminder re-sends
 * the same reminder email and leaves the same trail in the payment notes.
 * Nothing here invents a second money path.
 *
 * Preview-over-confirmation, as everywhere in /ops: the guest's email is
 * rendered before anything is sent, and the panel states the RESULT of the
 * amount typed rather than warning about it.
 */

interface EmailPreview {
  will_send: boolean;
  subject: string;
  heading: string;
  intro: string;
  summary_rows: Array<[string, string]>;
  note: string | null;
}

export type MoneyRequestMode = "request" | "reminder";

function money(n: number) { return `$${Math.round(n).toLocaleString("en-US")}`; }

/** datetime-local value → ISO, without pretending about time zones. */
function toIso(local: string): string | null {
  if (!local) return null;
  const parsed = Date.parse(local);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export default function RequestMoneyDialog({
  mode, booking, onClose, onOpen, onDone,
}: {
  mode: MoneyRequestMode;
  booking: QueueBooking;
  onClose: () => void;
  onOpen: () => void;
  onDone: (message: string) => void | Promise<void>;
}) {
  const isRequest = mode === "request";
  const view = bookingMoneyView(booking);
  const total = view.amount ?? 0;
  const paid = booking.amount_paid ?? 0;
  const outstanding = Math.max(0, total - paid);

  // Default ask: what is still owed (the system calculates, the person confirms).
  const [amount, setAmount] = useState(String((booking.deposit_amount ?? outstanding) || ""));
  const [dueAt, setDueAt] = useState("");
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const value = Number(amount) || 0;

  const loadPreview = useCallback(async () => {
    setPreviewError("");
    try {
      const params = new URLSearchParams({ action: isRequest ? "request_deposit" : "send_reminder" });
      if (isRequest) {
        if (value > 0) params.set("deposit", String(value));
        const iso = toIso(dueAt);
        if (iso) params.set("due_at", iso);
      }
      const r = await fetch(`/api/ops/bookings/${booking.id}/message-preview?${params}`, {
        credentials: "include", cache: "no-store",
      });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; email?: EmailPreview };
      if (!r.ok || !body.ok || !body.email) {
        setPreviewError(body.error ?? "Couldn't load the email preview.");
        return;
      }
      setPreview(body.email);
    } catch {
      setPreviewError("Couldn't reach Oraya.");
    }
  }, [booking.id, isRequest, value, dueAt]);

  useEffect(() => {
    onOpen();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen, onClose]);

  // Re-render the preview as the amount/date settle.
  useEffect(() => {
    const t = window.setTimeout(() => { void loadPreview(); }, 250);
    return () => window.clearTimeout(t);
  }, [loadPreview]);

  const afterRequest = paid + value;
  let outcomeTone: "ok" | "warn" = "ok";
  let outcomeTitle = "";
  let outcomeDetail = "";
  if (isRequest) {
    if (value <= 0) {
      outcomeTone = "warn";
      outcomeTitle = "Enter how much to ask for";
    } else if (value > outstanding && outstanding > 0) {
      outcomeTone = "warn";
      outcomeTitle = `That is ${money(value - outstanding)} more than they still owe`;
      outcomeDetail = `${money(outstanding)} is outstanding on this stay.`;
    } else if (afterRequest >= total && total > 0) {
      outcomeTitle = `Asking for the full remaining ${money(value)}`;
      outcomeDetail = "Once paid, nothing will be outstanding.";
    } else {
      outcomeTitle = `Asking for ${money(value)} now`;
      outcomeDetail = `${money(Math.max(0, outstanding - value))} would still be outstanding after this.`;
    }
  }

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/ops/bookings/${booking.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isRequest
            ? {
                action: "request_deposit",
                deposit_amount: value,
                due_at: toIso(dueAt),
                amount_total: view.amount,
                expected_payment_status: booking.payment_status,
              }
            : { action: "send_reminder" },
        ),
      });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; email_sent?: boolean; note_saved?: boolean };
      if (!r.ok || !body.ok) {
        setError(body.error ?? "That didn't go through.");
        return;
      }
      const emailPart = body.email_sent
        ? `Email sent to ${preview?.will_send ? "them" : "the guest"}.`
        : "No email was sent (no address on the booking).";
      await onDone(
        isRequest
          ? `Asked for ${money(value)}. ${emailPart}`
          : `Reminder sent.${body.note_saved === false ? " (The reminder note couldn't be saved.)" : ""}`,
      );
    } catch {
      setError("Couldn't reach Oraya — it may not have gone through. Check the booking before retrying.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(10,15,20,.72)", display: "grid", placeItems: "center", padding: "20px", zIndex: 80 }}
    >
      <div role="dialog" aria-modal="true" style={{
        background: T.navyLift, border: `1px solid ${T.border}`, borderRadius: T.rLg,
        width: "min(600px,100%)", maxHeight: "90vh", overflow: "auto",
      }}>
        <div style={{ padding: "22px 24px 0", display: "flex", justifyContent: "space-between", gap: "16px" }}>
          <div>
            <h2 style={{ fontFamily: T.serif, fontWeight: 400, fontSize: "22px", margin: 0 }}>
              {isRequest ? "Ask for a payment" : "Send a reminder"}
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: "13px", color: T.muted }}>
              {booking.guest_name ?? booking.member_contact?.full_name ?? "Guest"}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: 0, color: T.muted, fontSize: "24px", lineHeight: 1, cursor: "pointer" }}>&times;</button>
        </div>

        <div style={{ padding: "20px 24px" }}>
          {error && <Banner tone="bad" title="Not sent">{error}</Banner>}

          {isRequest && (
            <>
              <div style={{ marginBottom: "18px" }}>
                <Rows>
                  <Row k={view.estimated ? "Stay total (estimated)" : "Stay total"} v={money(total)} />
                  <Row k="Already received" v={money(paid)} />
                  <Row k={<b>Still outstanding</b>} v={<b>{money(outstanding)}</b>} />
                </Rows>
              </div>

              <Field
                label="How much are you asking for?"
                type="number" inputMode="decimal" min="0" value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Field
                label="Due by (optional)"
                type="datetime-local" value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                style={{ colorScheme: "dark" }}
                hint="Shown to the guest in the email. Leave empty for no deadline."
              />

              <div style={{
                background: outcomeTone === "ok" ? T.okBg : T.warnBg,
                border: `1px solid ${outcomeTone === "ok" ? T.okBr : T.warnBr}`,
                borderRadius: T.r, padding: "14px 16px", fontSize: "14px", marginBottom: "22px",
              }}>
                <b>{outcomeTitle}</b>
                {outcomeDetail && <span style={{ display: "block", color: T.muted, fontSize: "13px", marginTop: "2px" }}>{outcomeDetail}</span>}
              </div>
            </>
          )}

          <Kicker>The email they get</Kicker>
          {previewError && <Banner tone="bad" title="Preview unavailable" onRetry={() => void loadPreview()}>{previewError}</Banner>}
          {!preview && !previewError && <p style={{ fontSize: "13px", color: T.faint, margin: 0 }}>Preparing…</p>}
          {preview && (
            preview.will_send ? (
              <div style={{ border: `1px solid ${T.borderStrong}`, borderRadius: T.r, overflow: "hidden" }}>
                <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.borderFaint}`, background: T.surface }}>
                  <div style={{ fontSize: "12px", color: T.muted }}>To <span style={{ color: T.ink }}>{/* resolved server-side */}the guest</span></div>
                  <div style={{ fontSize: "14px", marginTop: "2px" }}><b>{preview.subject}</b></div>
                </div>
                <div style={{ padding: "18px", background: "rgba(0,0,0,.18)" }}>
                  <p style={{ fontFamily: T.serif, fontSize: "18px", margin: "0 0 8px", textAlign: "center" }}>{preview.heading}</p>
                  <p style={{ fontSize: "12px", color: T.muted, lineHeight: 1.7, margin: "0 0 14px", textAlign: "center" }}>{preview.intro}</p>
                  <Rows>
                    {preview.summary_rows.map(([k, v]) => <Row key={k} k={k} v={v} />)}
                  </Rows>
                  {preview.note && (
                    <p style={{ fontSize: "12px", color: T.faint, margin: "14px 0 0" }}>{preview.note}</p>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ border: `1px dashed ${T.warnBr}`, background: T.warnBg, borderRadius: T.r, padding: "14px 16px", fontSize: "13px" }}>
                <b>No email will be sent</b>
                <span style={{ display: "block", color: T.muted, marginTop: "2px" }}>
                  This booking has no email address — {isRequest ? "the request will be recorded, but the guest won't hear about it here." : "there is nobody to remind."}
                </span>
              </div>
            )
          )}
        </div>

        <div style={{ padding: "16px 24px 22px", display: "flex", gap: "10px", justifyContent: "flex-end", borderTop: `1px solid ${T.borderFaint}` }}>
          <Button onClick={onClose}>Not now</Button>
          <Button
            variant="primary"
            disabled={busy || (isRequest && value <= 0) || (!isRequest && preview?.will_send === false)}
            onClick={() => void submit()}
          >
            {busy ? "Sending…" : isRequest ? `Send this and ask for ${money(value)}` : "Send this reminder"}
          </Button>
        </div>
      </div>
    </div>
  );
}
