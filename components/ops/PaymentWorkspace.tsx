"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOps } from "@/components/ops/OpsProvider";
import { Badge, Banner, Button, Card, Field, T } from "@/components/ops/ui";
import {
  PAYMENT_ALLOWED_METHODS,
  formatPaymentAmount,
  remainingRequestAmount,
  type PaymentAllowedMethod,
  type PaymentCurrency,
  type PaymentRequestRow,
  type PaymentTransactionRow,
} from "@/lib/payments/ledger";
import { remainingRefundableAmount } from "@/lib/payments/provider-refund";

type RequestView = PaymentRequestRow & { payment_url: string | null };
type AttemptView = {
  id: string;
  booking_id: string | null;
  payment_request_id: string | null;
  idempotency_key: string;
  status: string;
  provider_transaction_id: string | null;
  provider_reference: string | null;
  amount: number;
  currency: PaymentCurrency;
  created_at: string;
  updated_at: string;
};
type LedgerData = {
  requests: RequestView[];
  transactions: PaymentTransactionRow[];
  attempts: AttemptView[];
  provider_events: Array<{
    id: string;
    provider: string;
    provider_event_id: string;
    payment_request_id: string | null;
    payment_transaction_id: string | null;
    verification_status: string;
    processing_status: string;
    received_at: string;
    processed_at: string | null;
    error_code: string | null;
  }>;
  checkout?: {
    checkout_ready: boolean;
    apple_pay_ready: boolean;
    provider_display_name: string | null;
    guest_message: string;
    environment: string | null;
    admin_message: string;
    missing_requirements: string[];
  };
};

type ListTab = "collecting" | "collected" | "closed";

const FRESH_CLAIM_MS = 10 * 60 * 1000;

const methodLabels: Record<PaymentAllowedMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  card: "Credit or debit card",
  apple_pay: "Apple Pay",
  whish: "Whish",
  omt: "OMT",
  western_union: "Western Union",
  suyool: "Suyool",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  background: "rgba(255,255,255,.05)",
  border: `1px solid ${T.borderStrong}`,
  borderRadius: T.rSm,
  padding: "12px 13px",
  color: T.ink,
  fontSize: "14px",
  fontFamily: T.sans,
};

function paymentTone(status: string): "ok" | "warn" | "bad" | "neutral" {
  if (status === "paid") return "ok";
  if (status === "active" || status === "partially_paid") return "warn";
  if (status === "cancelled" || status === "expired") return "bad";
  return "neutral";
}

function statusLabel(status: string) {
  if (status === "partially_paid") return "Part paid";
  return status.replaceAll("_", " ");
}

export default function PaymentWorkspace() {
  const { bookings } = useOps();
  const [ledger, setLedger] = useState<LedgerData>({
    requests: [],
    transactions: [],
    attempts: [],
    provider_events: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listTab, setListTab] = useState<ListTab>("collecting");
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
  const [refundFor, setRefundFor] = useState<PaymentTransactionRow | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundNotes, setRefundNotes] = useState("");
  const [refundMode, setRefundMode] = useState<"provider" | "record" | "fail">("provider");
  const [refundReference, setRefundReference] = useState("");
  const [refundIdempotencyKey, setRefundIdempotencyKey] = useState("");
  const [refundPendingId, setRefundPendingId] = useState("");
  const [refundProviderBlocked, setRefundProviderBlocked] = useState(false);
  const [refundMax, setRefundMax] = useState(0);
  const [attemptActionFor, setAttemptActionFor] = useState<AttemptView | null>(null);
  const [attemptAction, setAttemptAction] = useState<"mark_failed" | "mark_cleared">("mark_failed");
  const [attemptReason, setAttemptReason] = useState("");
  const [highlightRequestId, setHighlightRequestId] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/ops/payments/requests", {
        credentials: "include",
        cache: "no-store",
      });
      const body = await response.json() as LedgerData & { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Could not load payments.");
        return;
      }
      setLedger({
        requests: body.requests ?? [],
        transactions: body.transactions ?? [],
        attempts: body.attempts ?? [],
        provider_events: body.provider_events ?? [],
        checkout: body.checkout,
      });
      setError("");
    } catch {
      setError("Could not reach Oraya payments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const requestById = useMemo(() => {
    const map = new Map<string, RequestView>();
    for (const request of ledger.requests) map.set(request.id, request);
    return map;
  }, [ledger.requests]);

  const chosenBooking = useMemo(
    () => bookings.find((booking) => booking.id === bookingId),
    [bookings, bookingId],
  );
  const activeRequestMethods = useMemo(
    () =>
      PAYMENT_ALLOWED_METHODS.filter(
        (method) =>
          (method !== "card" || ledger.checkout?.checkout_ready) &&
          (method !== "apple_pay" || ledger.checkout?.apple_pay_ready),
      ),
    [ledger.checkout?.apple_pay_ready, ledger.checkout?.checkout_ready],
  );

  const attentionAttempts = useMemo(() => {
    const now = Date.now();
    return ledger.attempts.filter((attempt) => {
      if (!["claimed", "authorized", "ambiguous"].includes(attempt.status)) return false;
      // Fresh claimed = guest may still be paying — do not alarm.
      if (
        attempt.status === "claimed" &&
        now - Date.parse(attempt.created_at) < FRESH_CLAIM_MS
      ) {
        return false;
      }
      return true;
    });
  }, [ledger.attempts]);

  const attentionEvents = useMemo(
    () =>
      ledger.provider_events.filter(
        (event) =>
          event.verification_status !== "verified" ||
          ["pending", "failed"].includes(event.processing_status),
      ),
    [ledger.provider_events],
  );

  const pendingRefunds = useMemo(
    () =>
      ledger.transactions.filter(
        (row) => row.transaction_type === "refund" && row.status === "pending",
      ),
    [ledger.transactions],
  );

  const attentionCount =
    attentionAttempts.length + attentionEvents.length + pendingRefunds.length;

  const collectingRequests = useMemo(
    () =>
      ledger.requests.filter(
        (request) => request.status === "active" || request.status === "partially_paid",
      ),
    [ledger.requests],
  );
  const collectedRequests = useMemo(
    () => ledger.requests.filter((request) => request.status === "paid"),
    [ledger.requests],
  );
  const closedRequests = useMemo(
    () =>
      ledger.requests.filter((request) =>
        ["cancelled", "expired", "draft"].includes(request.status),
      ),
    [ledger.requests],
  );

  const visibleRequests =
    listTab === "collecting"
      ? collectingRequests
      : listTab === "collected"
        ? collectedRequests
        : closedRequests;

  const txnCountByRequest = useMemo(() => {
    const counts = new Map<string, number>();
    for (const transaction of ledger.transactions) {
      if (!transaction.payment_request_id) continue;
      counts.set(
        transaction.payment_request_id,
        (counts.get(transaction.payment_request_id) ?? 0) + 1,
      );
    }
    return counts;
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

  function focusRequest(requestId: string | null) {
    if (!requestId) return;
    const request = requestById.get(requestId);
    if (!request) return;
    if (request.status === "paid") setListTab("collected");
    else if (["cancelled", "expired", "draft"].includes(request.status)) setListTab("closed");
    else setListTab("collecting");
    setHighlightRequestId(requestId);
    window.setTimeout(() => {
      document.getElementById(`pay-req-${requestId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 50);
  }

  async function createRequest() {
    setBusy(true);
    setError("");
    setFlash("");
    try {
      const response = await fetch("/api/ops/payments/requests", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: bookingId || null,
          payer_name: payerName,
          payer_email: payerEmail || null,
          payer_phone: payerPhone || null,
          description,
          purpose,
          amount,
          currency,
          allowed_methods: methods,
        }),
      });
      const body = await response.json() as { error?: string; request?: RequestView };
      if (!response.ok || !body.request) {
        setError(body.error ?? "Could not create the payment link.");
        return;
      }
      setShowCreate(false);
      setFlash("Payment link created. It is ready to copy and send.");
      setBookingId("");
      setPayerName("");
      setPayerEmail("");
      setPayerPhone("");
      setDescription("");
      setAmount("");
      setListTab("collecting");
      await load();
    } catch {
      setError("Could not reach Oraya. Nothing was created.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(link: string | null) {
    if (!link) {
      setError("This link could not be decrypted. Check the server secret before sending it.");
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      setFlash("Payment link copied.");
    } catch {
      setError("The browser could not copy the link. Open it and copy it from the address bar.");
    }
  }

  async function cancelRequest(id: string) {
    if (!window.confirm("Cancel this payment link? Guests will no longer be able to pay with it.")) {
      return;
    }
    setBusy(true);
    setError("");
    const response = await fetch(`/api/ops/payments/requests/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    const body = await response.json() as { error?: string };
    if (!response.ok) setError(body.error ?? "Could not cancel that request.");
    else {
      setFlash("Payment link cancelled. Find it under Closed.");
      setListTab("closed");
      await load();
    }
    setBusy(false);
  }

  async function deleteRequest(id: string) {
    if (!window.confirm("Permanently remove this unused link from the list?")) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/ops/payments/requests/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const body = await response.json() as { error?: string };
    if (!response.ok) setError(body.error ?? "Could not delete that link.");
    else {
      setFlash("Payment link removed.");
      await load();
    }
    setBusy(false);
  }

  function openReceipt(request: RequestView) {
    setReceiptFor(request);
    setReceiptAmount(
      String(remainingRequestAmount(Number(request.amount), Number(request.amount_paid))),
    );
    setReceiptReference("");
    setReceiptMethod("Cash");
    setReceiptIdempotencyKey(crypto.randomUUID());
    setError("");
  }

  async function recordReceipt() {
    if (!receiptFor) return;
    setBusy(true);
    setError("");
    const booking = bookings.find((item) => item.id === receiptFor.booking_id);
    const response = await fetch("/api/ops/payments/transactions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payment_request_id: receiptFor.id,
        booking_id: receiptFor.booking_id,
        amount: receiptAmount,
        applied_amount: receiptAmount,
        currency: receiptFor.currency,
        method: receiptMethod,
        reference: receiptReference,
        expected_booking_amount_paid: booking?.amount_paid ?? null,
        idempotency_key: receiptIdempotencyKey,
      }),
    });
    const body = await response.json() as { error?: string; email_sent?: boolean };
    if (!response.ok) setError(body.error ?? "Could not record that receipt.");
    else {
      setReceiptFor(null);
      setFlash(
        `Receipt recorded${body.email_sent ? " and the guest email was sent" : ""}.`,
      );
      await load();
    }
    setBusy(false);
  }

  async function reverseReceipt() {
    if (!reverseFor) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/ops/payments/transactions/${reverseFor.id}/reverse`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reverseReason }),
    });
    const body = await response.json() as { error?: string };
    if (!response.ok) setError(body.error ?? "Could not reverse that receipt.");
    else {
      setReverseFor(null);
      setReverseReason("");
      setFlash("Receipt reversed. The original entry remains in the audit history.");
      await load();
    }
    setBusy(false);
  }

  function refundedAgainst(transactionId: string) {
    return ledger.transactions
      .filter(
        (row) =>
          row.reverses_transaction_id === transactionId &&
          row.transaction_type === "refund" &&
          (row.status === "confirmed" || row.status === "pending"),
      )
      .reduce((sum, row) => sum + Number(row.amount), 0);
  }

  function pendingRefundFor(transactionId: string) {
    return (
      ledger.transactions.find(
        (row) =>
          row.reverses_transaction_id === transactionId &&
          row.transaction_type === "refund" &&
          row.status === "pending",
      ) ?? null
    );
  }

  function openCardRefund(transaction: PaymentTransactionRow, preferFail = false) {
    const pending = pendingRefundFor(transaction.id);
    const remaining = remainingRefundableAmount({
      payment_amount: Number(transaction.amount),
      already_refunded: refundedAgainst(transaction.id),
    });
    setRefundFor(transaction);
    setRefundAmount(String(pending ? Number(pending.amount) : remaining));
    setRefundMax(pending ? Number(pending.amount) : remaining);
    setRefundNotes("");
    setRefundReference("");
    setRefundIdempotencyKey(
      pending?.idempotency_key ||
        `oraya-rfnd-${transaction.id.slice(0, 8)}-${Date.now().toString(36)}`.slice(0, 50),
    );
    setRefundPendingId(pending?.id ?? "");
    setRefundProviderBlocked(Boolean(pending));
    setRefundMode(preferFail ? "fail" : pending ? "record" : "provider");
    setError("");
  }

  function openPendingRefund(refund: PaymentTransactionRow) {
    const original = ledger.transactions.find((row) => row.id === refund.reverses_transaction_id);
    if (original) {
      openCardRefund(original);
      return;
    }
    setError("Could not find the original card payment for that refund.");
  }

  async function submitCardRefund() {
    if (!refundFor) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/ops/payments/transactions/${refundFor.id}/refund`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(refundAmount),
        mode: refundMode,
        notes: refundNotes || null,
        reason: refundMode === "fail" ? refundNotes : undefined,
        provider_reference: refundMode === "record" ? refundReference : undefined,
        idempotency_key: refundIdempotencyKey,
        refund_transaction_id:
          (refundMode === "record" || refundMode === "fail") && refundPendingId
            ? refundPendingId
            : undefined,
      }),
    });
    const body = await response.json() as {
      error?: string;
      can_record_manual?: boolean;
      provider_blocked?: boolean;
      provider_reference?: string;
      refund_transaction_id?: string;
      idempotency_key?: string;
      amount?: number;
      currency?: PaymentCurrency;
    };
    if (!response.ok) {
      setError(body.error ?? "Could not refund that card payment.");
      if (body.can_record_manual || body.provider_blocked) {
        if (refundMode !== "fail") setRefundMode("record");
        if (body.provider_reference) setRefundReference(body.provider_reference);
        if (body.refund_transaction_id) setRefundPendingId(body.refund_transaction_id);
        if (body.idempotency_key) setRefundIdempotencyKey(body.idempotency_key);
        if (body.provider_blocked) setRefundProviderBlocked(true);
      }
      setBusy(false);
      return;
    }
    setRefundFor(null);
    setRefundProviderBlocked(false);
    setFlash(
      refundMode === "provider"
        ? `Card refund sent. ${formatPaymentAmount(Number(body.amount ?? refundAmount), body.currency ?? refundFor.currency)} is returning to the guest.`
        : refundMode === "fail"
          ? "Refund attempt released. You may try Refund card again if Business Center still shows no refund."
          : `Refund recorded. ${formatPaymentAmount(Number(body.amount ?? refundAmount), body.currency ?? refundFor.currency)} noted against this payment.`,
    );
    await load();
    setBusy(false);
  }

  async function submitAttemptAction() {
    if (!attemptActionFor) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/ops/payments/attempts/${attemptActionFor.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: attemptAction, reason: attemptReason }),
    });
    const body = await response.json() as { error?: string };
    if (!response.ok) {
      setError(body.error ?? "Could not update that payment attempt.");
      setBusy(false);
      return;
    }
    setAttemptActionFor(null);
    setAttemptReason("");
    setFlash(
      attemptAction === "mark_failed"
        ? "Marked as no charge. Guests can try paying again on that link."
        : "Unclear attempt cleared — matching receipt already on file.",
    );
    await load();
    setBusy(false);
  }

  function labelForAttempt(attempt: AttemptView) {
    const request = attempt.payment_request_id
      ? requestById.get(attempt.payment_request_id)
      : null;
    const booking = attempt.booking_id
      ? bookings.find((item) => item.id === attempt.booking_id)
      : null;
    if (request) return `${request.payer_name} · ${request.description}`;
    if (booking) return `${booking.guest_name ?? "Guest"} · ${booking.villa}`;
    return "Unlinked card attempt";
  }

  function labelForRefund(refund: PaymentTransactionRow) {
    const original = ledger.transactions.find((row) => row.id === refund.reverses_transaction_id);
    const request = original?.payment_request_id
      ? requestById.get(original.payment_request_id)
      : null;
    if (request) return `${request.payer_name} · ${request.description}`;
    return "Card refund";
  }

  return (
    <section style={{ marginBottom: 30 }}>
      {flash && (
        <Banner tone="ok" title="Done" onDismiss={() => setFlash("")}>
          {flash}
        </Banner>
      )}
      {error && (
        <Banner tone="bad" title="Payments need attention" onDismiss={() => setError("")}>
          {error}
        </Banner>
      )}

      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ fontFamily: T.serif, fontWeight: 400, margin: 0, fontSize: 24 }}>
              Collect money
            </h2>
            <p style={{ color: T.muted, margin: "5px 0 0", fontSize: 13 }}>
              Create a link, send it, record cash, or refund a card — one place.
            </p>
          </div>
          <Button variant="primary" onClick={() => setShowCreate((value) => !value)}>
            {showCreate ? "Close" : "New payment link"}
          </Button>
        </div>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: 15 }}>Card checkout</p>
            <p style={{ color: T.muted, fontSize: 12, margin: "6px 0 0", maxWidth: 520 }}>
              {ledger.checkout?.checkout_ready
                ? "Guests can pay by card through NetCommerce."
                : (ledger.checkout?.admin_message ?? "Card checkout is not ready yet.")}
            </p>
          </div>
          <Badge tone={ledger.checkout?.checkout_ready ? "ok" : "warn"}>
            {ledger.checkout?.checkout_ready ? "Live" : "Not ready"}
          </Badge>
        </div>

        {attentionCount > 0 && (
          <div
            style={{
              borderTop: `1px solid ${T.borderFaint}`,
              marginTop: 14,
              paddingTop: 12,
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <p style={{ margin: 0, fontSize: 14 }}>Needs your attention</p>
              <Badge tone="bad">{attentionCount}</Badge>
            </div>
            <p style={{ color: T.muted, fontSize: 12, margin: "6px 0 10px" }}>
              Check CyberSource Business Center first. Do not charge or refund twice.
            </p>

            {pendingRefunds.map((refund) => (
              <div
                key={refund.id}
                style={{
                  borderTop: `1px solid ${T.borderFaint}`,
                  paddingTop: 10,
                  marginTop: 10,
                }}
              >
                <Badge tone="bad">Refund unfinished</Badge>
                <p style={{ color: T.muted, fontSize: 13, margin: "8px 0 4px" }}>
                  {labelForRefund(refund)}
                </p>
                <p style={{ color: T.muted, fontSize: 12, margin: "0 0 10px" }}>
                  {formatPaymentAmount(Number(refund.amount), refund.currency)} ·{" "}
                  {new Date(refund.created_at).toLocaleString()}
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button
                    small
                    variant="primary"
                    onClick={() => openPendingRefund(refund)}
                  >
                    Resolve refund
                  </Button>
                  {refund.reverses_transaction_id && (
                    <Button
                      small
                      onClick={() => {
                        const original = ledger.transactions.find(
                          (row) => row.id === refund.reverses_transaction_id,
                        );
                        if (original?.payment_request_id) {
                          focusRequest(original.payment_request_id);
                        }
                      }}
                    >
                      Show payment
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {attentionAttempts.map((attempt) => (
              <div
                key={attempt.id}
                style={{
                  borderTop: `1px solid ${T.borderFaint}`,
                  paddingTop: 10,
                  marginTop: 10,
                }}
              >
                <Badge tone="bad">
                  {attempt.status === "ambiguous"
                    ? "Unclear card outcome"
                    : attempt.status === "authorized"
                      ? "Authorized — finish check"
                      : "Stuck card attempt"}
                </Badge>
                <p style={{ color: T.muted, fontSize: 13, margin: "8px 0 4px" }}>
                  {labelForAttempt(attempt)}
                </p>
                <p style={{ color: T.muted, fontSize: 12, margin: "0 0 6px" }}>
                  {formatPaymentAmount(Number(attempt.amount), attempt.currency)} ·{" "}
                  {new Date(attempt.updated_at).toLocaleString()}
                </p>
                <p style={{ color: T.muted, fontSize: 12, margin: "0 0 10px" }}>
                  Business Center reference:{" "}
                  {attempt.provider_reference ?? attempt.idempotency_key}
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button
                    small
                    variant="danger"
                    onClick={() => {
                      setAttemptActionFor(attempt);
                      setAttemptAction("mark_failed");
                      setAttemptReason("");
                    }}
                  >
                    No charge in BC
                  </Button>
                  <Button
                    small
                    variant="primary"
                    onClick={() => {
                      setAttemptActionFor(attempt);
                      setAttemptAction("mark_cleared");
                      setAttemptReason("");
                    }}
                  >
                    Charge already in Oraya
                  </Button>
                  {attempt.payment_request_id && (
                    <Button small onClick={() => focusRequest(attempt.payment_request_id)}>
                      Show link
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {attentionEvents.map((event) => (
              <div
                key={event.id}
                style={{
                  borderTop: `1px solid ${T.borderFaint}`,
                  paddingTop: 10,
                  marginTop: 10,
                }}
              >
                <Badge tone="bad">Bank message unfinished</Badge>
                <p style={{ color: T.muted, fontSize: 12, margin: "6px 0" }}>
                  {event.provider.replaceAll("_", " ")} ·{" "}
                  {new Date(event.received_at).toLocaleString()}
                  {event.error_code ? ` · ${event.error_code}` : ""}
                </p>
                {event.payment_request_id && (
                  <Button small onClick={() => focusRequest(event.payment_request_id)}>
                    Show link
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {showCreate && (
        <Card title="New payment request" style={{ marginTop: 14 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
              gap: 14,
            }}
          >
            <label style={{ fontSize: 12, color: T.muted }}>
              Link to a booking (optional)
              <select
                style={{ ...inputStyle, marginTop: 6 }}
                value={bookingId}
                onChange={(event) => chooseBooking(event.target.value)}
              >
                <option value="">Standalone — no booking</option>
                {bookings.map((booking) => (
                  <option key={booking.id} value={booking.id}>
                    {booking.guest_name ?? "Guest"} · {booking.villa} ·{" "}
                    {booking.id.slice(0, 8).toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Payer name"
              value={payerName}
              onChange={(event) => setPayerName(event.target.value)}
            />
            <Field
              label="Email (optional)"
              type="email"
              value={payerEmail}
              onChange={(event) => setPayerEmail(event.target.value)}
            />
            <Field
              label="Phone (optional)"
              value={payerPhone}
              onChange={(event) => setPayerPhone(event.target.value)}
            />
            <Field
              label="What is this for?"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="e.g. Villa deposit"
            />
            <label style={{ fontSize: 12, color: T.muted }}>
              Purpose
              <select
                style={{ ...inputStyle, marginTop: 6 }}
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
              >
                {["deposit", "balance", "full", "addon", "event", "damage", "other"].map(
                  (value) => (
                    <option key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </option>
                  ),
                )}
              </select>
            </label>
            <Field
              label="Amount"
              type="number"
              min="0"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <label style={{ fontSize: 12, color: T.muted }}>
              Currency
              <select
                style={{ ...inputStyle, marginTop: 6 }}
                value={currency}
                disabled={Boolean(chosenBooking)}
                onChange={(event) => setCurrency(event.target.value as PaymentCurrency)}
              >
                <option>USD</option>
                <option>LBP</option>
              </select>
            </label>
          </div>
          <p style={{ color: T.muted, fontSize: 12, margin: "8px 0" }}>
            Ways this person may pay
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
            {activeRequestMethods.map((method) => {
              const on = methods.includes(method);
              return (
                <Button
                  small
                  key={method}
                  variant={on ? "primary" : "secondary"}
                  onClick={() =>
                    setMethods((current) =>
                      on ? current.filter((item) => item !== method) : [...current, method],
                    )
                  }
                >
                  {methodLabels[method]}
                </Button>
              );
            })}
          </div>
          <Button
            variant="primary"
            disabled={
              busy || !payerName.trim() || !description.trim() || !amount || methods.length === 0
            }
            onClick={() => void createRequest()}
          >
            {busy ? "Creating…" : "Create secure link"}
          </Button>
        </Card>
      )}

      <div
        style={{
          marginTop: 18,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {(
          [
            ["collecting", `Collecting (${collectingRequests.length})`],
            ["collected", `Collected (${collectedRequests.length})`],
            ["closed", `Closed (${closedRequests.length})`],
          ] as const
        ).map(([tab, label]) => (
          <Button
            key={tab}
            small
            variant={listTab === tab ? "primary" : "secondary"}
            onClick={() => setListTab(tab)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
        {loading ? (
          <Card>Loading the payment ledger…</Card>
        ) : visibleRequests.length === 0 ? (
          <Card>
            {listTab === "collecting"
              ? "No open payment links. Create one to collect money."
              : listTab === "collected"
                ? "No fully paid links yet."
                : "No cancelled or expired links."}
          </Card>
        ) : (
          visibleRequests.map((request) => {
            const requestTransactions = ledger.transactions.filter(
              (transaction) => transaction.payment_request_id === request.id,
            );
            const canReceive =
              request.status === "active" || request.status === "partially_paid";
            const isClosed = ["cancelled", "expired", "draft"].includes(request.status);
            const hasMoneyHistory = (txnCountByRequest.get(request.id) ?? 0) > 0;
            const canDelete = isClosed && !hasMoneyHistory;
            const remaining = remainingRequestAmount(
              Number(request.amount),
              Number(request.amount_paid),
            );
            const highlighted = highlightRequestId === request.id;
            const booking = request.booking_id
              ? bookings.find((item) => item.id === request.booking_id)
              : null;

            return (
              <div key={request.id} id={`pay-req-${request.id}`}>
              <Card
                style={
                  highlighted
                    ? { outline: `1px solid ${T.gold}`, outlineOffset: 2 }
                    : undefined
                }
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 14,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <p style={{ margin: 0, fontSize: 17 }}>{request.description}</p>
                    <p style={{ margin: "4px 0 0", color: T.muted, fontSize: 13 }}>
                      {request.payer_name}
                      {booking ? ` · ${booking.villa}` : ""}
                      {" · "}
                      {formatPaymentAmount(Number(request.amount), request.currency)}
                    </p>
                    <p style={{ margin: "6px 0 0", color: T.muted, fontSize: 12 }}>
                      Paid {formatPaymentAmount(Number(request.amount_paid), request.currency)}
                      {remaining > 0
                        ? ` · Remaining ${formatPaymentAmount(remaining, request.currency)}`
                        : ""}
                      {Number(request.amount_refunded) > 0
                        ? ` · Refunded ${formatPaymentAmount(Number(request.amount_refunded), request.currency)}`
                        : ""}
                    </p>
                  </div>
                  <Badge tone={paymentTone(request.status)}>
                    {statusLabel(request.status)}
                  </Badge>
                </div>

                <div
                  style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 15 }}
                >
                  {canReceive && (
                    <Button small onClick={() => void copyLink(request.payment_url)}>
                      Copy link
                    </Button>
                  )}
                  {canReceive && (
                    <Button small variant="primary" onClick={() => openReceipt(request)}>
                      Record receipt
                    </Button>
                  )}
                  {canReceive && (
                    <Button
                      small
                      variant="danger"
                      disabled={busy}
                      onClick={() => void cancelRequest(request.id)}
                    >
                      Cancel link
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      small
                      variant="danger"
                      disabled={busy}
                      onClick={() => void deleteRequest(request.id)}
                    >
                      Delete link
                    </Button>
                  )}
                  {isClosed && hasMoneyHistory && (
                    <p
                      style={{
                        margin: 0,
                        color: T.muted,
                        fontSize: 12,
                        alignSelf: "center",
                      }}
                    >
                      Kept for money history — cannot delete.
                    </p>
                  )}
                </div>

                {requestTransactions.length > 0 && (
                  <div
                    style={{
                      marginTop: 16,
                      borderTop: `1px solid ${T.borderFaint}`,
                      paddingTop: 12,
                    }}
                  >
                    {requestTransactions.map((transaction) => {
                      const label =
                        transaction.transaction_type === "reversal"
                          ? "Reversal"
                          : transaction.transaction_type === "refund"
                            ? "Refund"
                            : "Received";
                      const isCardPayment =
                        transaction.transaction_type === "payment" &&
                        transaction.provider === "credit_libanais" &&
                        Boolean(transaction.provider_reference) &&
                        ["confirmed", "refunded", "reversed"].includes(transaction.status);
                      const remainingCardRefund = isCardPayment
                        ? remainingRefundableAmount({
                            payment_amount: Number(transaction.amount),
                            already_refunded: refundedAgainst(transaction.id),
                          })
                        : 0;
                      const pendingCardRefund = isCardPayment
                        ? pendingRefundFor(transaction.id)
                        : null;
                      const showRefundCard =
                        remainingCardRefund > 0 || Boolean(pendingCardRefund);

                      return (
                        <div
                          key={transaction.id}
                          style={{
                            display: "flex",
                            gap: 10,
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <p style={{ margin: "5px 0", color: T.muted, fontSize: 12 }}>
                            {label} ·{" "}
                            {formatPaymentAmount(
                              Number(transaction.amount),
                              transaction.currency,
                            )}{" "}
                            ·{" "}
                            {transaction.provider === "credit_libanais"
                              ? "Card"
                              : transaction.provider === "manual"
                                ? "Manual"
                                : transaction.provider.replaceAll("_", " ")}{" "}
                            ·{" "}
                            {transaction.provider_reference ??
                              transaction.receipt_reference ??
                              "—"}
                            {transaction.status === "reversed" &&
                            transaction.provider === "credit_libanais"
                              ? " · ledger reversed (card not refunded)"
                              : ""}
                            {pendingCardRefund ? " · refund pending review" : ""}
                            {transaction.status === "pending" &&
                            transaction.transaction_type === "refund"
                              ? " · unfinished"
                              : ""}
                          </p>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {showRefundCard && (
                              <Button
                                small
                                variant="primary"
                                onClick={() => openCardRefund(transaction)}
                              >
                                {pendingCardRefund ? "Resolve refund" : "Refund card"}
                              </Button>
                            )}
                            {transaction.transaction_type === "payment" &&
                              transaction.status === "confirmed" &&
                              transaction.provider === "manual" && (
                                <Button
                                  small
                                  variant="danger"
                                  onClick={() => {
                                    setReverseFor(transaction);
                                    setReverseReason("");
                                  }}
                                >
                                  Reverse
                                </Button>
                              )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
              </div>
            );
          })
        )}
      </div>

      {receiptFor && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(10,15,20,.75)",
            display: "grid",
            placeItems: "center",
            padding: 18,
          }}
        >
          <Card
            title="Record money already received"
            style={{ width: "min(500px,100%)", background: T.navyLift }}
          >
            <Banner tone="warn" title="This does not move money">
              Use this only after cash or a transfer has actually arrived.
            </Banner>
            <Field
              label="Amount received"
              type="number"
              min="0"
              value={receiptAmount}
              onChange={(event) => setReceiptAmount(event.target.value)}
            />
            <label style={{ fontSize: 12, color: T.muted }}>
              Method
              <select
                style={{ ...inputStyle, margin: "6px 0 16px" }}
                value={receiptMethod}
                onChange={(event) => setReceiptMethod(event.target.value)}
              >
                {["Cash", "Bank transfer", "Whish", "OMT", "Western Union", "Suyool"].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </select>
            </label>
            <Field
              label="Receipt or transfer reference"
              required
              value={receiptReference}
              onChange={(event) => setReceiptReference(event.target.value)}
              placeholder="e.g. CASH-2026-0042"
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button onClick={() => setReceiptFor(null)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={busy || !receiptReference.trim() || Number(receiptAmount) <= 0}
                onClick={() => void recordReceipt()}
              >
                {busy ? "Recording…" : "Record receipt"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {reverseFor && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(10,15,20,.75)",
            display: "grid",
            placeItems: "center",
            padding: 18,
          }}
        >
          <Card
            title="Reverse a receipt"
            style={{ width: "min(500px,100%)", background: T.navyLift }}
          >
            <Banner tone="warn" title="This is not a card refund">
              Reverse only corrects a cash/manual receipt in Oraya. It does not return money
              to a guest card — use Refund card for NetCommerce charges.
            </Banner>
            <Field
              label="Reason for reversal"
              required
              value={reverseReason}
              onChange={(event) => setReverseReason(event.target.value)}
              placeholder="e.g. Duplicate cash receipt"
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button onClick={() => setReverseFor(null)}>Cancel</Button>
              <Button
                variant="danger"
                disabled={busy || !reverseReason.trim()}
                onClick={() => void reverseReceipt()}
              >
                {busy ? "Reversing…" : "Reverse receipt"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {refundFor && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(10,15,20,.75)",
            display: "grid",
            placeItems: "center",
            padding: 18,
          }}
        >
          <Card
            title="Refund card payment"
            style={{ width: "min(520px,100%)", background: T.navyLift }}
          >
            {refundMode === "fail" ? (
              <Banner tone="bad" title="Release only if Business Center shows no refund">
                This clears the unfinished refund lock so you can try again later. If money
                already returned, switch to Record instead.
              </Banner>
            ) : refundProviderBlocked ? (
              <Banner tone="bad" title="Do not retry the card refund">
                A refund attempt may already have moved money. Check Business Center, then
                record the refund reference — or release if BC shows no refund.
              </Banner>
            ) : refundMode === "provider" ? (
              <Banner tone="warn" title="This returns money to the guest">
                Owner-only. Oraya claims the refund, calls NetCommerce / CyberSource, then
                records it. If the outcome is unclear, Oraya will block another card retry.
              </Banner>
            ) : (
              <Banner tone="warn" title="Record only — money already moved">
                Use this only when the refund already completed in Business Center and you
                need Oraya to catch up.
              </Banner>
            )}
            <p style={{ color: T.muted, fontSize: 12, margin: "0 0 12px" }}>
              Original payment reference: {refundFor.provider_reference ?? "—"}
              {refundMax > 0
                ? ` · Max refundable ${formatPaymentAmount(refundMax, refundFor.currency)}`
                : ""}
            </p>
            {refundMode !== "fail" && (
              <Field
                label="Refund amount"
                type="number"
                min="0"
                value={refundAmount}
                onChange={(event) => setRefundAmount(event.target.value)}
                disabled={refundProviderBlocked && Boolean(refundPendingId)}
              />
            )}
            <Field
              label={
                refundMode === "fail"
                  ? "What did Business Center show?"
                  : "Note (optional)"
              }
              value={refundNotes}
              onChange={(event) => setRefundNotes(event.target.value)}
              placeholder={
                refundMode === "fail"
                  ? "e.g. No refund found for this payment id"
                  : "e.g. Activation test refund"
              }
            />
            {refundMode === "record" && (
              <Field
                label="Business Center refund reference"
                required
                value={refundReference}
                onChange={(event) => setRefundReference(event.target.value)}
                placeholder="Paste the CyberSource refund id"
              />
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                flexWrap: "wrap",
                marginTop: 8,
              }}
            >
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {!refundProviderBlocked && refundMode !== "fail" && (
                  <Button
                    small
                    onClick={() =>
                      setRefundMode((current) =>
                        current === "provider" ? "record" : "provider",
                      )
                    }
                  >
                    {refundMode === "provider"
                      ? "Already refunded in Business Center?"
                      : "Back to one-click card refund"}
                  </Button>
                )}
                {(refundProviderBlocked || refundPendingId) && (
                  <Button
                    small
                    onClick={() =>
                      setRefundMode((current) => (current === "fail" ? "record" : "fail"))
                    }
                  >
                    {refundMode === "fail"
                      ? "Back to record BC refund"
                      : "No refund in Business Center"}
                  </Button>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button
                  onClick={() => {
                    setRefundFor(null);
                    setRefundProviderBlocked(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  disabled={
                    busy ||
                    (refundMode === "provider" && Number(refundAmount) <= 0) ||
                    (refundMode === "record" &&
                      (Number(refundAmount) <= 0 || !refundReference.trim())) ||
                    (refundMode === "fail" && refundNotes.trim().length < 8)
                  }
                  onClick={() => void submitCardRefund()}
                >
                  {busy
                    ? "Working…"
                    : refundMode === "provider"
                      ? "Refund now"
                      : refundMode === "fail"
                        ? "Release refund lock"
                        : "Record refund"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {attemptActionFor && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(10,15,20,.75)",
            display: "grid",
            placeItems: "center",
            padding: 18,
          }}
        >
          <Card
            title={
              attemptAction === "mark_failed"
                ? "Mark as no charge"
                : "Clear attempt — charge already recorded"
            }
            style={{ width: "min(520px,100%)", background: T.navyLift }}
          >
            <Banner
              tone={attemptAction === "mark_failed" ? "warn" : "ok"}
              title="Owner confirmation"
            >
              {attemptAction === "mark_failed"
                ? "Only continue if Business Center shows no successful charge for this reference. This unblocks another guest payment attempt."
                : "Only continue if Oraya already shows a matching Received/card receipt for this payment. This does not create a new receipt."}
            </Banner>
            <p style={{ color: T.muted, fontSize: 12, margin: "0 0 12px" }}>
              {labelForAttempt(attemptActionFor)} ·{" "}
              {formatPaymentAmount(
                Number(attemptActionFor.amount),
                attemptActionFor.currency,
              )}
              <br />
              Reference:{" "}
              {attemptActionFor.provider_reference ?? attemptActionFor.idempotency_key}
            </p>
            <Field
              label="What did you see in Business Center?"
              required
              value={attemptReason}
              onChange={(event) => setAttemptReason(event.target.value)}
              placeholder="e.g. No AUTH/SETTLE for this merchant reference"
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button
                onClick={() => {
                  setAttemptActionFor(null);
                  setAttemptReason("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant={attemptAction === "mark_failed" ? "danger" : "primary"}
                disabled={busy || attemptReason.trim().length < 8}
                onClick={() => void submitAttemptAction()}
              >
                {busy ? "Saving…" : "Confirm"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </section>
  );
}
