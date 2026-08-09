"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOps } from "@/components/ops/OpsProvider";
import { Badge, Banner, Button, Card, Field, T } from "@/components/ops/ui";
import { PAYMENT_ALLOWED_METHODS, formatPaymentAmount, remainingRequestAmount, type PaymentAllowedMethod, type PaymentCurrency, type PaymentRequestRow, type PaymentTransactionRow } from "@/lib/payments/ledger";

type RequestView = PaymentRequestRow & { payment_url: string | null };
type LedgerData = {
  requests: RequestView[];
  transactions: PaymentTransactionRow[];
  attempts: Array<{
    id: string; booking_id: string | null; payment_request_id: string | null;
    idempotency_key: string;
    status: string; provider_transaction_id: string | null; provider_reference: string | null;
    amount: number; currency: PaymentCurrency; created_at: string; updated_at: string;
  }>;
  provider_events: Array<{
    id: string; provider: string; provider_event_id: string; payment_request_id: string | null;
    payment_transaction_id: string | null; verification_status: string; processing_status: string;
    received_at: string; processed_at: string | null; error_code: string | null;
  }>;
  checkout?: {
    checkout_ready: boolean; apple_pay_ready: boolean; provider_display_name: string | null;
    guest_message: string; environment: string | null; admin_message: string;
    missing_requirements: string[];
  };
};
const methodLabels: Record<PaymentAllowedMethod, string> = {
  cash: "Cash", bank_transfer: "Bank transfer", card: "Credit or debit card", apple_pay: "Apple Pay",
  whish: "Whish", omt: "OMT", western_union: "Western Union", suyool: "Suyool",
};
const inputStyle = { width: "100%", boxSizing: "border-box" as const, background: "rgba(255,255,255,.05)", border: `1px solid ${T.borderStrong}`, borderRadius: T.rSm, padding: "12px 13px", color: T.ink, fontSize: "14px", fontFamily: T.sans };

function paymentTone(status: string): "ok" | "warn" | "bad" | "neutral" {
  if (status === "paid") return "ok";
  if (status === "active" || status === "partially_paid") return "warn";
  if (status === "cancelled" || status === "expired") return "bad";
  return "neutral";
}

export default function PaymentWorkspace() {
  const { bookings } = useOps();
  const [ledger, setLedger] = useState<LedgerData>({ requests: [], transactions: [], attempts: [], provider_events: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bookingId, setBookingId] = useState("");
  const [payerName, setPayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [description, setDescription] = useState("");
  const [purpose, setPurpose] = useState("deposit");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<PaymentCurrency>("USD");
  const [methods, setMethods] = useState<PaymentAllowedMethod[]>(["cash"]);
  const [receiptFor, setReceiptFor] = useState<RequestView | null>(null);
  const [receiptAmount, setReceiptAmount] = useState("");
  const [receiptMethod, setReceiptMethod] = useState("Cash");
  const [receiptReference, setReceiptReference] = useState("");
  const [receiptIdempotencyKey, setReceiptIdempotencyKey] = useState("");
  const [reverseFor, setReverseFor] = useState<PaymentTransactionRow | null>(null);
  const [reverseReason, setReverseReason] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/ops/payments/requests", { credentials: "include", cache: "no-store" });
      const body = await response.json() as LedgerData & { error?: string };
      if (!response.ok) { setError(body.error ?? "Could not load payments."); return; }
      setLedger({
        requests: body.requests ?? [],
        transactions: body.transactions ?? [],
        attempts: body.attempts ?? [],
        provider_events: body.provider_events ?? [],
        checkout: body.checkout,
      });
      setError("");
    } catch { setError("Could not reach Oraya payments."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const chosenBooking = useMemo(() => bookings.find((booking) => booking.id === bookingId), [bookings, bookingId]);
  const activeRequestMethods = useMemo(
    () => PAYMENT_ALLOWED_METHODS.filter((method) =>
      (method !== "card" || ledger.checkout?.checkout_ready) &&
      (method !== "apple_pay" || ledger.checkout?.apple_pay_ready)),
    [ledger.checkout?.apple_pay_ready, ledger.checkout?.checkout_ready],
  );
  const attentionAttempts = useMemo(
    () => ledger.attempts.filter((attempt) => ["claimed", "authorized", "ambiguous"].includes(attempt.status)),
    [ledger.attempts],
  );
  const attentionEvents = useMemo(
    () => ledger.provider_events.filter((event) =>
      event.verification_status !== "verified" || ["pending", "failed"].includes(event.processing_status)),
    [ledger.provider_events],
  );
  const settlementTotals = useMemo(() => {
    const totals = new Map<string, { gross: number; fees: number; net: number }>();
    for (const transaction of ledger.transactions) {
      if (transaction.transaction_type !== "payment" || transaction.status !== "confirmed") continue;
      const key = `${transaction.provider}:${transaction.currency}`;
      const current = totals.get(key) ?? { gross: 0, fees: 0, net: 0 };
      current.gross += Number(transaction.gross_amount ?? transaction.amount);
      current.fees += Number(transaction.fee_amount ?? 0);
      current.net += Number(transaction.net_amount ?? transaction.amount);
      totals.set(key, current);
    }
    return [...totals.entries()];
  }, [ledger.transactions]);
  function chooseBooking(id: string) {
    setBookingId(id);
    const booking = bookings.find((item) => item.id === id);
    if (!booking) return;
    setCurrency("USD");
    setPayerName(booking.guest_name ?? "Guest");
    setPayerEmail(booking.guest_email ?? "");
    setPayerPhone(booking.guest_phone ?? "");
    setDescription(`${booking.villa} payment`);
    const due = typeof booking.amount_due === "number" ? booking.amount_due : 0;
    if (due > 0) setAmount(String(due));
  }

  async function createRequest() {
    setBusy(true); setError(""); setFlash("");
    try {
      const response = await fetch("/api/ops/payments/requests", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: bookingId || null, payer_name: payerName, payer_email: payerEmail || null, payer_phone: payerPhone || null, description, purpose, amount, currency, allowed_methods: methods }),
      });
      const body = await response.json() as { error?: string; request?: RequestView };
      if (!response.ok || !body.request) { setError(body.error ?? "Could not create the payment link."); return; }
      setShowCreate(false); setFlash("Payment link created. It is ready to copy and send.");
      setBookingId(""); setPayerName(""); setPayerEmail(""); setPayerPhone(""); setDescription(""); setAmount("");
      await load();
    } catch { setError("Could not reach Oraya. Nothing was created."); }
    finally { setBusy(false); }
  }

  async function copyLink(link: string | null) {
    if (!link) { setError("This link could not be decrypted. Check the server secret before sending it."); return; }
    try { await navigator.clipboard.writeText(link); setFlash("Payment link copied."); }
    catch { setError("The browser could not copy the link. Open it and copy it from the address bar."); }
  }

  async function cancelRequest(id: string) {
    setBusy(true); setError("");
    const response = await fetch(`/api/ops/payments/requests/${id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) });
    const body = await response.json() as { error?: string };
    if (!response.ok) setError(body.error ?? "Could not cancel that request.");
    else { setFlash("Payment request cancelled."); await load(); }
    setBusy(false);
  }

  function openReceipt(request: RequestView) {
    setReceiptFor(request);
    setReceiptAmount(String(remainingRequestAmount(Number(request.amount), Number(request.amount_paid))));
    setReceiptReference(""); setReceiptMethod("Cash"); setReceiptIdempotencyKey(crypto.randomUUID()); setError("");
  }

  async function recordReceipt() {
    if (!receiptFor) return;
    setBusy(true); setError("");
    const booking = bookings.find((item) => item.id === receiptFor.booking_id);
    const response = await fetch("/api/ops/payments/transactions", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment_request_id: receiptFor.id, booking_id: receiptFor.booking_id, amount: receiptAmount, applied_amount: receiptAmount, currency: receiptFor.currency, method: receiptMethod, reference: receiptReference, expected_booking_amount_paid: booking?.amount_paid ?? null, idempotency_key: receiptIdempotencyKey }),
    });
    const body = await response.json() as { error?: string; email_sent?: boolean };
    if (!response.ok) setError(body.error ?? "Could not record that receipt.");
    else { setReceiptFor(null); setFlash(`Receipt recorded${body.email_sent ? " and the guest email was sent" : ""}.`); await load(); }
    setBusy(false);
  }

  async function reverseReceipt() {
    if (!reverseFor) return;
    setBusy(true); setError("");
    const response = await fetch(`/api/ops/payments/transactions/${reverseFor.id}/reverse`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reverseReason }),
    });
    const body = await response.json() as { error?: string };
    if (!response.ok) setError(body.error ?? "Could not reverse that receipt.");
    else { setReverseFor(null); setReverseReason(""); setFlash("Receipt reversed. The original entry remains in the audit history."); await load(); }
    setBusy(false);
  }

  return <section style={{ marginBottom: 30 }}>
    {flash && <Banner tone="ok" title="Done" onDismiss={() => setFlash("")}>{flash}</Banner>}
    {error && <Banner tone="bad" title="Payments need attention" onDismiss={() => setError("")}>{error}</Banner>}
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div><h2 style={{ fontFamily: T.serif, fontWeight: 400, margin: 0, fontSize: 24 }}>Collect and track money</h2><p style={{ color: T.muted, margin: "5px 0 0", fontSize: 13 }}>Create a link for any caller or booking, then record every receipt in one ledger.</p></div>
        <Button variant="primary" onClick={() => setShowCreate((value) => !value)}>{showCreate ? "Close" : "New payment link"}</Button>
      </div>
    </Card>

    <Card title="Provider readiness and reconciliation" style={{ marginTop: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
        <div>
          <p style={{ margin: 0, fontSize: 14 }}>NetCommerce card checkout</p>
          <Badge tone={ledger.checkout?.checkout_ready ? "ok" : "warn"}>{ledger.checkout?.checkout_ready ? "ready" : "not ready"}</Badge>
          <p style={{ color: T.muted, fontSize: 12 }}>{ledger.checkout?.admin_message ?? "Checking provider setup…"}</p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 14 }}>Apple Pay</p>
          <Badge tone={ledger.checkout?.apple_pay_ready ? "ok" : "warn"}>{ledger.checkout?.apple_pay_ready ? "ready" : "provider-gated"}</Badge>
          <p style={{ color: T.muted, fontSize: 12 }}>Enabled only after merchant enrollment, domain verification, and an Apple sandbox-device test.</p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 14 }}>Items needing reconciliation</p>
          <Badge tone={attentionAttempts.length + attentionEvents.length > 0 ? "bad" : "ok"}>{attentionAttempts.length + attentionEvents.length}</Badge>
          <p style={{ color: T.muted, fontSize: 12 }}>Ambiguous/in-flight attempts and unprocessed or rejected provider events.</p>
        </div>
      </div>
      {(ledger.checkout?.missing_requirements?.length ?? 0) > 0 && <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", color: T.muted, fontSize: 12 }}>Show provider setup checklist</summary>
        <ul style={{ color: T.muted, fontSize: 12 }}>{ledger.checkout?.missing_requirements.map((item) => <li key={item}>{item}</li>)}</ul>
      </details>}
      {attentionAttempts.map((attempt) => <div key={attempt.id} style={{ borderTop: `1px solid ${T.borderFaint}`, paddingTop: 10, marginTop: 10 }}>
        <Badge tone="bad">{attempt.status}</Badge>
        <p style={{ color: T.muted, fontSize: 12, margin: "6px 0" }}>Attempt {attempt.id.slice(0, 8).toUpperCase()} · {formatPaymentAmount(Number(attempt.amount), attempt.currency)} · {new Date(attempt.updated_at).toLocaleString()}</p>
        <p style={{ color: T.muted, fontSize: 12, margin: "6px 0" }}>Merchant reference: {attempt.provider_reference ?? attempt.idempotency_key}</p>
        <p style={{ color: T.muted, fontSize: 12, margin: 0 }}>Check the matching merchant reference in CyberSource Business Center before allowing any retry.</p>
      </div>)}
      {attentionEvents.map((event) => <div key={event.id} style={{ borderTop: `1px solid ${T.borderFaint}`, paddingTop: 10, marginTop: 10 }}>
        <Badge tone="bad">{event.verification_status} / {event.processing_status}</Badge>
        <p style={{ color: T.muted, fontSize: 12, margin: "6px 0" }}>{event.provider.replaceAll("_", " ")} event {event.provider_event_id} · {new Date(event.received_at).toLocaleString()}</p>
        {event.error_code && <p style={{ color: T.muted, fontSize: 12, margin: 0 }}>Error code: {event.error_code}</p>}
      </div>)}
      {attentionAttempts.length === 0 && attentionEvents.length === 0 && <p style={{ color: T.muted, fontSize: 12, margin: "12px 0 0" }}>No provider item currently needs attention.</p>}
      {settlementTotals.length > 0 && <div style={{ borderTop: `1px solid ${T.borderFaint}`, marginTop: 14, paddingTop: 12 }}>
        <p style={{ margin: "0 0 8px", fontSize: 14 }}>Recorded settlement totals</p>
        {settlementTotals.map(([key, totals]) => { const [provider, currency] = key.split(":"); return <p key={key} style={{ color: T.muted, fontSize: 12, margin: "5px 0" }}>{provider.replaceAll("_", " ")} · gross {formatPaymentAmount(totals.gross, currency as PaymentCurrency)} · fees {formatPaymentAmount(totals.fees, currency as PaymentCurrency)} · net {formatPaymentAmount(totals.net, currency as PaymentCurrency)}</p>; })}
      </div>}
    </Card>

    {showCreate && <Card title="New payment request" style={{ marginTop: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
        <label style={{ fontSize: 12, color: T.muted }}>Link to a booking (optional)<select style={{ ...inputStyle, marginTop: 6 }} value={bookingId} onChange={(event) => chooseBooking(event.target.value)}><option value="">Standalone — no booking</option>{bookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.guest_name ?? "Guest"} · {booking.villa} · {booking.id.slice(0, 8).toUpperCase()}</option>)}</select></label>
        <Field label="Payer name" value={payerName} onChange={(event) => setPayerName(event.target.value)} />
        <Field label="Email (optional)" type="email" value={payerEmail} onChange={(event) => setPayerEmail(event.target.value)} />
        <Field label="Phone (optional)" value={payerPhone} onChange={(event) => setPayerPhone(event.target.value)} />
        <Field label="What is this for?" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Villa deposit" />
        <label style={{ fontSize: 12, color: T.muted }}>Purpose<select style={{ ...inputStyle, marginTop: 6 }} value={purpose} onChange={(event) => setPurpose(event.target.value)}>{["deposit","balance","full","addon","event","damage","other"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
        <Field label="Amount" type="number" min="0" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        <label style={{ fontSize: 12, color: T.muted }}>Currency<select style={{ ...inputStyle, marginTop: 6 }} value={currency} disabled={Boolean(chosenBooking)} onChange={(event) => setCurrency(event.target.value as PaymentCurrency)}><option>USD</option><option>LBP</option></select></label>
      </div>
      <p style={{ color: T.muted, fontSize: 12, margin: "8px 0" }}>Ways this person may pay</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>{activeRequestMethods.map((method) => { const on = methods.includes(method); return <Button small key={method} variant={on ? "primary" : "secondary"} onClick={() => setMethods((current) => on ? current.filter((item) => item !== method) : [...current, method])}>{methodLabels[method]}</Button>; })}</div>
      {!ledger.checkout?.checkout_ready && <p style={{ color: T.muted, fontSize: 12, margin: "-8px 0 18px" }}>Card links will appear here automatically after NetCommerce sandbox or live setup is ready.</p>}
      {ledger.checkout?.checkout_ready && !ledger.checkout.apple_pay_ready && <p style={{ color: T.muted, fontSize: 12, margin: "-8px 0 18px" }}>Apple Pay will appear only after merchant enrollment, domain verification, and device testing.</p>}
      <Button variant="primary" disabled={busy || !payerName.trim() || !description.trim() || !amount || methods.length === 0} onClick={() => void createRequest()}>{busy ? "Creating…" : "Create secure link"}</Button>
    </Card>}

    <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
      {loading ? <Card>Loading the payment ledger…</Card> : ledger.requests.length === 0 ? <Card>No payment links yet.</Card> : ledger.requests.map((request) => {
        const requestTransactions = ledger.transactions.filter((transaction) => transaction.payment_request_id === request.id);
        const canReceive = request.status === "active" || request.status === "partially_paid";
        return <Card key={request.id}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}><div><p style={{ margin: 0, fontSize: 17 }}>{request.description}</p><p style={{ margin: "4px 0 0", color: T.muted, fontSize: 13 }}>{request.payer_name} · {formatPaymentAmount(Number(request.amount), request.currency)}</p></div><Badge tone={paymentTone(request.status)}>{request.status.replaceAll("_", " ")}</Badge></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 15 }}><Button small onClick={() => void copyLink(request.payment_url)}>Copy link</Button>{canReceive && <Button small variant="primary" onClick={() => openReceipt(request)}>Record receipt</Button>}{canReceive && <Button small variant="danger" disabled={busy} onClick={() => void cancelRequest(request.id)}>Cancel link</Button>}</div>
          {requestTransactions.length > 0 && <div style={{ marginTop: 16, borderTop: `1px solid ${T.borderFaint}`, paddingTop: 12 }}>{requestTransactions.map((transaction) => <div key={transaction.id} style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}><p style={{ margin: "5px 0", color: T.muted, fontSize: 12 }}>{transaction.transaction_type === "reversal" ? "Reversal" : "Received"} · {formatPaymentAmount(Number(transaction.amount), transaction.currency)} · {transaction.provider.replaceAll("_", " ")} · {transaction.receipt_reference}</p>{transaction.transaction_type === "payment" && transaction.status === "confirmed" && <Button small variant="danger" onClick={() => { setReverseFor(transaction); setReverseReason(""); }}>Reverse</Button>}</div>)}</div>}
        </Card>;
      })}
    </div>

    {receiptFor && <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(10,15,20,.75)", display: "grid", placeItems: "center", padding: 18 }}><Card title="Record money already received" style={{ width: "min(500px,100%)", background: T.navyLift }}>
      <Banner tone="warn" title="This does not move money">Use this only after cash or a transfer has actually arrived.</Banner>
      <Field label="Amount received" type="number" min="0" value={receiptAmount} onChange={(event) => setReceiptAmount(event.target.value)} />
      <label style={{ fontSize: 12, color: T.muted }}>Method<select style={{ ...inputStyle, margin: "6px 0 16px" }} value={receiptMethod} onChange={(event) => setReceiptMethod(event.target.value)}>{["Cash","Bank transfer","Whish","OMT","Western Union","Suyool"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <Field label="Receipt or transfer reference" required value={receiptReference} onChange={(event) => setReceiptReference(event.target.value)} placeholder="e.g. CASH-2026-0042" />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><Button onClick={() => setReceiptFor(null)}>Cancel</Button><Button variant="primary" disabled={busy || !receiptReference.trim() || Number(receiptAmount) <= 0} onClick={() => void recordReceipt()}>{busy ? "Recording…" : "Record receipt"}</Button></div>
    </Card></div>}
    {reverseFor && <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(10,15,20,.75)", display: "grid", placeItems: "center", padding: 18 }}><Card title="Reverse a receipt" style={{ width: "min(500px,100%)", background: T.navyLift }}>
      <Banner tone="warn" title="History will be preserved">This creates a correcting entry. It does not delete the original receipt or return money to the guest.</Banner>
      <Field label="Reason for reversal" required value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} placeholder="e.g. Duplicate cash receipt" />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><Button onClick={() => setReverseFor(null)}>Cancel</Button><Button variant="danger" disabled={busy || !reverseReason.trim()} onClick={() => void reverseReceipt()}>{busy ? "Reversing…" : "Reverse receipt"}</Button></div>
    </Card></div>}
  </section>;
}
