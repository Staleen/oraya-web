"use client";
import { useEffect, useState } from "react";
import type { QueueBooking } from "@/lib/ops-queue";
import { Banner, Button, Field, Row, Rows, T } from "@/components/ops/ui";

function money(n: number) { return `$${Math.round(n).toLocaleString("en-US")}`; }

/**
 * Recording money in or money out.
 *
 * The operator never calculates anything: the amount is pre-filled with what is
 * owed, and the panel underneath states the RESULT of what they typed rather
 * than warning them about it. Reading "Nadia will be fully paid" is a better
 * check than reading "are you sure?".
 */
export default function MoneyDialog({
  mode, booking, onClose, onOpen, onDone,
}: {
  mode: "payment" | "refund";
  booking: QueueBooking;
  onClose: () => void;
  onOpen: () => void;
  onDone: (message: string) => void | Promise<void>;
}) {
  const total = booking.amount_total ?? 0;
  const paid = booking.amount_paid ?? 0;
  const alreadyRefunded = booking.refund_amount ?? 0;
  const target = mode === "payment" ? Math.max(0, total - paid) : Math.max(0, paid - alreadyRefunded);

  const [amount, setAmount] = useState(String(target || ""));
  const [reference, setReference] = useState("");
  const [method, setMethod] = useState("Bank transfer");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Hold the background refresh while the dialog is open so the numbers the
  // operator is reading cannot move under them mid-entry.
  useEffect(() => {
    onOpen();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen, onClose]);

  const value = Number(amount) || 0;
  const after = mode === "payment" ? paid + value : alreadyRefunded + value;
  const left = mode === "payment" ? total - after : paid - after;

  let outcomeTone: "ok" | "warn" = "ok";
  let outcomeTitle = "";
  let outcomeDetail = "";
  if (value <= 0) {
    outcomeTone = "warn";
    outcomeTitle = mode === "payment" ? "Enter how much came in" : "Enter how much you returned";
  } else if (left === 0) {
    outcomeTitle = mode === "payment"
      ? `${booking.guest_name ?? "The guest"} will be fully paid`
      : `${booking.guest_name ?? "The guest"} will have been fully refunded`;
    outcomeDetail = mode === "payment"
      ? `${money(after)} of ${money(total)} received. Nothing left outstanding.`
      : `${money(after)} of the ${money(paid)} they paid has been returned.`;
  } else if (left > 0) {
    outcomeTone = "warn";
    outcomeTitle = mode === "payment"
      ? `${money(left)} will still be outstanding`
      : `${money(left)} will still be owed back`;
    outcomeDetail = mode === "payment"
      ? `${money(after)} of ${money(total)} received after this.`
      : `${money(after)} of ${money(paid)} returned after this.`;
  } else {
    outcomeTone = "warn";
    outcomeTitle = mode === "payment"
      ? `That is ${money(Math.abs(left))} more than they owe`
      : `That is ${money(Math.abs(left))} more than they paid`;
    outcomeDetail = "Check the amount before recording it.";
  }

  async function submit() {
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/ops/bookings/${booking.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "payment"
            ? { action: "record_payment", amount: value, method, reference, expected_amount_paid: paid }
            : { action: "record_refund", amount: value, reference, expected_refund_amount: alreadyRefunded },
        ),
      });
      const body = (await r.json()) as { error?: string };
      if (!r.ok) { setError(body.error ?? "That didn't save."); return; }
      await onDone(
        mode === "payment"
          ? `Payment of ${money(value)} recorded.`
          : `Refund of ${money(value)} recorded.`,
      );
    } catch {
      setError("Couldn't reach Oraya. Nothing was recorded — try again.");
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
        width: "min(540px,100%)", maxHeight: "88vh", overflow: "auto",
      }}>
        <div style={{ padding: "22px 24px 0", display: "flex", justifyContent: "space-between", gap: "16px" }}>
          <div>
            <h2 style={{ fontFamily: T.serif, fontWeight: 400, fontSize: "22px", margin: 0 }}>
              {mode === "payment" ? "Record a payment" : "Record a refund"}
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: "13px", color: T.muted }}>{booking.guest_name ?? "Guest"}</p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: 0, color: T.muted, fontSize: "24px", lineHeight: 1, cursor: "pointer" }}>&times;</button>
        </div>

        <div style={{ padding: "22px 24px" }}>
          {error && <Banner tone="bad" title="Not recorded">{error}</Banner>}

          {mode === "refund" && (
            <Banner tone="warn" title="Send the money first">
              This records a refund you have already made in the bank. It does not move any money.
            </Banner>
          )}

          <div style={{ marginBottom: "20px" }}>
            <Rows>
              {mode === "payment" ? (
                <>
                  <Row k="Stay total" v={money(total)} />
                  <Row k="Already received" v={money(paid)} />
                  <Row k={<b>Still outstanding</b>} v={<b>{money(Math.max(0, total - paid))}</b>} />
                </>
              ) : (
                <>
                  <Row k="Received from them" v={money(paid)} />
                  <Row k="Already returned" v={money(alreadyRefunded)} />
                  <Row k={<b>Owed back</b>} v={<b>{money(target)}</b>} />
                </>
              )}
            </Rows>
          </div>

          <Field
            label={mode === "payment" ? "How much came in?" : "How much did you return?"}
            type="number" inputMode="decimal" min="0" value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />

          {mode === "payment" && (
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted, marginBottom: "6px" }}>
                How was it paid?
              </label>
              <select
                value={method} onChange={(e) => setMethod(e.target.value)}
                style={{
                  width: "100%", background: "rgba(255,255,255,.05)", border: `1px solid ${T.borderStrong}`,
                  borderRadius: T.rSm, padding: "12px 13px", color: T.ink, fontSize: "15px", fontFamily: T.sans, outline: "none",
                }}
              >
                {["Bank transfer", "Whish", "Cash", "Card"].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          )}

          <Field
            label={mode === "payment" ? "Reference from the bank or receipt" : "Reference from the bank"}
            required value={reference} onChange={(e) => setReference(e.target.value)}
            placeholder={mode === "payment" ? "e.g. TRX-88192" : "e.g. RFD-40221"}
            hint="Required — this is how the entry is traced later."
          />

          <div style={{
            background: outcomeTone === "ok" ? T.okBg : T.warnBg,
            border: `1px solid ${outcomeTone === "ok" ? T.okBr : T.warnBr}`,
            borderRadius: T.r, padding: "14px 16px", fontSize: "14px",
          }}>
            <b>{outcomeTitle}</b>
            {outcomeDetail && <span style={{ display: "block", color: T.muted, fontSize: "13px", marginTop: "2px" }}>{outcomeDetail}</span>}
          </div>
        </div>

        <div style={{ padding: "16px 24px 22px", display: "flex", gap: "10px", justifyContent: "flex-end", borderTop: `1px solid ${T.borderFaint}` }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || value <= 0 || !reference.trim()} onClick={() => void submit()}>
            {busy ? "Recording…" : `Record ${money(value)}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
