"use client";
import { useState } from "react";
import type { QueueBooking } from "@/lib/ops-queue";
import { Badge, Banner, Button, Card, Field, T, type Tone } from "@/components/ops/ui";

/**
 * The event proposal — what Oraya offers, what it costs, and until when.
 *
 * Sending emails the guest an accept/decline link; their answer flips the
 * proposal to accepted/declined through the existing signed-token route. An
 * accepted proposal is a contract the guest agreed to, so this card stops
 * editing it (audit B-11) rather than letting a click rewrite the total.
 */

const PAYMENT_METHODS = ["whish", "cash", "bank_transfer", "card_manual", "other"] as const;
const METHOD_LABELS: Record<(typeof PAYMENT_METHODS)[number], string> = {
  whish: "Whish",
  cash: "Cash",
  bank_transfer: "Bank transfer",
  card_manual: "Card",
  other: "Other",
};

function money(n: number | null | undefined) {
  return typeof n === "number" ? `$${Math.round(n).toLocaleString("en-US")}` : "—";
}

function statusBadge(status: string | null): { tone: Tone; label: string } {
  switch (status) {
    case "accepted": return { tone: "ok", label: "Guest accepted" };
    case "declined": return { tone: "bad", label: "Guest declined" };
    case "sent": return { tone: "info", label: "Sent — waiting for their answer" };
    case "expired": return { tone: "warn", label: "Expired" };
    default: return { tone: "neutral", label: "Draft" };
  }
}

/** datetime-local ↔ ISO. */
function toIso(local: string): string | null {
  if (!local) return null;
  const parsed = Date.parse(local);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}
function toLocalInput(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface LineItem {
  id?: string;
  label: string;
  unit_label: string | null;
  quantity: number | null;
  unit_price: number | null;
  line_total: number | null;
  notes: string | null;
}

function readLineItems(raw: unknown): LineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    .map((s) => ({
      id: typeof s.id === "string" ? s.id : undefined,
      label: typeof s.label === "string" ? s.label : "",
      unit_label: typeof s.unit_label === "string" ? s.unit_label : null,
      quantity: typeof s.quantity === "number" ? s.quantity : null,
      unit_price: typeof s.unit_price === "number" ? s.unit_price : null,
      line_total: typeof s.line_total === "number" ? s.line_total : null,
      notes: typeof s.notes === "string" ? s.notes : null,
    }));
}

/** quantity × unit price, when both are known. */
function computedLineTotal(item: LineItem): number | null {
  if (item.line_total !== null) return item.line_total;
  if (item.quantity !== null && item.unit_price !== null) return item.quantity * item.unit_price;
  return item.unit_price;
}

const INPUT: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.05)",
  border: "1px solid rgba(255,255,255,.14)", borderRadius: "8px", padding: "9px 11px",
  color: "#f2efe9", fontSize: "14px", fontFamily: "inherit", outline: "none",
};

function num(value: string): number | null {
  const t = value.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default function ProposalCard({ booking, onChanged }: {
  booking: QueueBooking;
  onChanged: (message: string) => void | Promise<void>;
}) {
  const status = booking.proposal_status ?? null;
  const locked = status === "accepted";
  const badge = statusBadge(status);

  const [total, setTotal] = useState(booking.proposal_total_amount != null ? String(booking.proposal_total_amount) : "");
  const [deposit, setDeposit] = useState(booking.proposal_deposit_amount != null ? String(booking.proposal_deposit_amount) : "");
  const [validUntil, setValidUntil] = useState(toLocalInput(booking.proposal_valid_until));
  const [methods, setMethods] = useState<string[]>(
    Array.isArray(booking.proposal_payment_methods) ? (booking.proposal_payment_methods as string[]) : ["bank_transfer"],
  );
  const [notes, setNotes] = useState(booking.proposal_notes ?? "");
  const [items, setItems] = useState<LineItem[]>(() => readLineItems(booking.proposal_included_services));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirmSend, setConfirmSend] = useState(false);

  const itemsTotal = items.reduce((sum, i) => sum + (computedLineTotal(i) ?? 0), 0);

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((cur) => cur.map((x, i) => (i === index ? { ...x, ...patch } : x)));
  }

  async function submit(action: "save_proposal" | "send_proposal") {
    setBusy(action);
    setError("");
    try {
      const r = await fetch(`/api/ops/bookings/${booking.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          total_amount: Number(total) || null,
          deposit_amount: deposit.trim() === "" ? null : Number(deposit) || null,
          valid_until: toIso(validUntil),
          payment_methods: methods,
          notes: notes.trim() || null,
          included_services: items
            .filter((i) => i.label.trim())
            .map((i) => ({
              ...(i.id ? { id: i.id } : {}),
              label: i.label.trim(),
              unit_label: i.unit_label?.trim() || null,
              quantity: i.quantity,
              unit_price: i.unit_price,
              line_total: computedLineTotal(i),
              notes: i.notes?.trim() || null,
            })),
        }),
      });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; email_sent?: boolean };
      if (!r.ok || !body.ok) {
        setError(body.error ?? "That didn't save.");
        return;
      }
      setConfirmSend(false);
      await onChanged(
        action === "send_proposal"
          ? body.email_sent
            ? "Proposal sent — the guest can accept or decline from the email."
            : "Proposal marked as sent, but no email went out (no address on the booking)."
          : "Proposal saved as a draft. Nothing was sent.",
      );
    } catch {
      setError("Couldn't reach Oraya. Nothing was saved.");
    } finally {
      setBusy("");
    }
  }

  return (
    <Card title="Event proposal">
      {error && <Banner tone="bad" title="Not saved" onDismiss={() => setError("")}>{error}</Banner>}

      <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" }}>
        <Badge tone={badge.tone}>{badge.label}</Badge>
        {booking.proposal_valid_until && !locked && (
          <span style={{ fontSize: "12px", color: T.faint }}>
            valid until {new Date(booking.proposal_valid_until).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        )}
      </div>

      {locked ? (
        <div>
          <p style={{ margin: "0 0 14px", fontSize: "14px", color: T.muted, lineHeight: 1.7 }}>
            The guest accepted this proposal, so it is now the agreed contract — changing its
            numbers here is deliberately not possible. Approve the event to confirm it, or use
            the legacy admin if the agreement itself must change.
          </p>
          {items.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <p style={{ margin: "0 0 8px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: T.gold }}>
                What&apos;s included
              </p>
              {items.map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "14px", padding: "5px 0", borderBottom: `1px solid ${T.borderFaint}` }}>
                  <span>{item.label}{item.quantity ? ` × ${item.quantity}` : ""}</span>
                  <span style={{ color: T.muted, whiteSpace: "nowrap" }}>{money(computedLineTotal(item))}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: T.muted }}>Total</span><b>{money(booking.proposal_total_amount)}</b></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: T.muted }}>Deposit</span><span>{money(booking.proposal_deposit_amount)}</span></div>
          </div>
        </div>
      ) : (
        <>
          {/* What the event actually includes — catering, decoration, staff… */}
          <div style={{ marginBottom: "20px" }}>
            <p style={{ margin: "0 0 10px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: T.gold }}>
              What&apos;s included
            </p>
            {items.length === 0 && (
              <p style={{ margin: "0 0 10px", fontSize: "13px", color: T.faint }}>
                Nothing listed yet — add the catering, decoration and anything else the price covers.
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {items.map((item, i) => (
                <div key={i} style={{ borderBottom: `1px solid ${T.borderFaint}`, paddingBottom: "10px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(140px,2fr) minmax(70px,.7fr) minmax(90px,1fr) auto", gap: "8px", alignItems: "center" }}>
                    <input
                      value={item.label}
                      placeholder="e.g. Catering for 30"
                      onChange={(e) => updateItem(i, { label: e.target.value })}
                      style={INPUT}
                    />
                    <input
                      value={item.quantity === null ? "" : String(item.quantity)}
                      placeholder="Qty"
                      inputMode="numeric"
                      onChange={(e) => updateItem(i, { quantity: num(e.target.value) })}
                      style={INPUT}
                    />
                    <input
                      value={item.unit_price === null ? "" : String(item.unit_price)}
                      placeholder="Price"
                      inputMode="decimal"
                      onChange={(e) => updateItem(i, { unit_price: num(e.target.value), line_total: null })}
                      style={INPUT}
                    />
                    <Button small variant="ghost" onClick={() => setItems(items.filter((_, xi) => xi !== i))}>
                      Remove
                    </Button>
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: "12px", color: T.faint, textAlign: "right" }}>
                    {computedLineTotal(item) !== null ? money(computedLineTotal(item)) : "no price yet"}
                  </p>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginTop: "12px" }}>
              <Button small onClick={() => setItems([...items, { label: "", unit_label: null, quantity: null, unit_price: null, line_total: null, notes: null }])}>
                Add a line
              </Button>
              {items.length > 0 && (
                <>
                  <span style={{ fontSize: "13px", color: T.muted }}>Lines add up to <b>{money(itemsTotal)}</b></span>
                  {itemsTotal > 0 && String(itemsTotal) !== total && (
                    <Button small variant="secondary" onClick={() => setTotal(String(itemsTotal))}>
                      Use as the total
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "0 14px" }}>
            <Field label="Total for the event" type="number" inputMode="decimal" min="0" value={total}
              onChange={(e) => setTotal(e.target.value)} />
            <Field label="Deposit to secure it" type="number" inputMode="decimal" min="0" value={deposit}
              onChange={(e) => setDeposit(e.target.value)} hint="Optional." />
          </div>

          <Field label="Offer valid until" type="datetime-local" value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)} style={{ colorScheme: "dark" }}
            hint="After this, the guest's accept link stops working." />

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted, marginBottom: "8px" }}>
              How they can pay
            </label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {PAYMENT_METHODS.map((m) => {
                const on = methods.includes(m);
                return (
                  <Button key={m} small variant={on ? "primary" : "secondary"}
                    onClick={() => setMethods((cur) => (on ? cur.filter((x) => x !== m) : [...cur, m]))}>
                    {METHOD_LABELS[m]}
                  </Button>
                );
              })}
            </div>
          </div>

          <label style={{ display: "block", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted, marginBottom: "6px" }}>
            Notes for the guest
          </label>
          <textarea
            value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
            placeholder="What's included, timings, anything they should know."
            style={{
              width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.05)",
              border: `1px solid ${T.borderStrong}`, borderRadius: T.rSm, padding: "12px 13px",
              fontFamily: T.sans, fontSize: "14px", color: T.ink, outline: "none", resize: "vertical", marginBottom: "18px",
            }}
          />

          {confirmSend ? (
            <div style={{ background: T.warnBg, border: `1px solid ${T.warnBr}`, borderRadius: T.r, padding: "14px 16px" }}>
              <p style={{ margin: "0 0 4px", fontSize: "14px" }}>
                <b>This emails {booking.guest_name ?? booking.member_contact?.full_name ?? "the guest"} an offer of {money(Number(total) || null)}</b>
              </p>
              <p style={{ margin: "0 0 12px", fontSize: "13px", color: T.muted, lineHeight: 1.6 }}>
                They can accept or decline straight from that email. Accepting makes these numbers
                the agreed contract.
              </p>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <Button small onClick={() => setConfirmSend(false)}>Not yet</Button>
                <Button small variant="primary" disabled={busy !== ""} onClick={() => void submit("send_proposal")}>
                  {busy === "send_proposal" ? "Sending…" : "Send it"}
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <Button disabled={busy !== ""} onClick={() => void submit("save_proposal")}>
                {busy === "save_proposal" ? "Saving…" : "Save draft"}
              </Button>
              <Button variant="primary" disabled={busy !== "" || !total} onClick={() => setConfirmSend(true)}>
                {status === "sent" ? "Send an updated proposal…" : "Send to the guest…"}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
