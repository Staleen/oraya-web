"use client";
import { Suspense, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { bookingGuestName, formatBookingRef, type QueueBooking } from "@/lib/ops-queue";
import { bookingMoneyView, parseStaySetupMessage } from "@/lib/ops-booking-display";
import { useOps } from "@/components/ops/OpsProvider";
import MoneyDialog from "@/components/ops/MoneyDialog";
import MessagePreviewDialog, { type PreviewAction } from "@/components/ops/MessagePreviewDialog";
import { Badge, Banner, Button, Card, EmptyState, PageHead, Ref, Row, Rows, T } from "@/components/ops/ui";

const STEPS = ["Requested", "Your approval", "Deposit", "Paid", "Staying", "Done"] as const;

function money(n: number | null | undefined) {
  return n == null ? "$0" : `$${Math.round(n).toLocaleString("en-US")}`;
}
function day(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("T")[0].split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
}

/** Which step the stay has actually reached — derived, never stored. */
function currentStep(b: QueueBooking, now: number): number {
  const status = (b.status ?? "").toLowerCase();
  if (status === "pending") return 1;
  if (status === "cancelled") return 5;
  const paid = b.amount_paid ?? 0;
  const total = b.amount_total ?? 0;
  if (b.check_out && Date.parse(b.check_out) < now) return 5;
  if (b.check_in && Date.parse(b.check_in) <= now) return 4;
  if (total > 0 && paid >= total) return 3;
  if (paid > 0) return 2;
  return 2;
}

/**
 * Next 16 requires useSearchParams() to sit inside a Suspense boundary, or the
 * build fails. The ?do=payment / ?do=refund deep link from the Today queue is
 * what needs it, so the reading component is wrapped rather than dropped.
 */
export default function BookingDetailPage() {
  return (
    <Suspense fallback={<p style={{ color: T.faint, fontSize: "13px" }}>Loading…</p>}>
      <BookingDetail />
    </Suspense>
  );
}

interface AddonRow {
  id: string | null;
  label: string;
  price: number | null;
  status: string;
  requiresApproval: boolean;
}

function addonRows(snapshot: unknown): AddonRow[] {
  if (!Array.isArray(snapshot)) return [];
  return snapshot
    .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === "object")
    .map((a) => ({
      id: typeof a.id === "string" ? a.id : null,
      label: typeof a.label === "string" ? a.label : typeof a.name === "string" ? a.name : "Add-on",
      price: typeof a.price === "number" ? a.price : null,
      status: typeof a.status === "string" ? a.status : "confirmed",
      requiresApproval: a.requires_approval === true,
    }));
}

/**
 * The add-ons the guest asked for, with approve/decline where a decision is
 * pending — previously only visible in the legacy admin. A resolved add-on
 * keeps a "Change" affordance (audit B-14: a mis-click must be reversible).
 */
function AddonsCard({ booking, onChanged }: { booking: QueueBooking; onChanged: () => Promise<void> }) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [changingId, setChangingId] = useState("");

  const rows = addonRows(booking.addons_snapshot);
  if (rows.length === 0) return null;

  async function resolve(addonId: string, decision: "approve" | "decline") {
    setBusyId(addonId);
    setError("");
    try {
      const r = await fetch(`/api/ops/bookings/${booking.id}/addons`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addon_id: addonId, decision }),
      });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !body.ok) {
        setError(body.error ?? "That decision didn't save.");
        return;
      }
      setChangingId("");
      await onChanged();
    } catch {
      setError("Couldn't reach Oraya. Nothing was changed.");
    } finally {
      setBusyId("");
    }
  }

  function badgeFor(status: string): { tone: "ok" | "bad" | "warn" | "neutral"; label: string } {
    if (status === "approved" || status === "confirmed") return { tone: "ok", label: status === "approved" ? "Approved" : "Included" };
    if (status === "declined") return { tone: "bad", label: "Declined" };
    if (status === "pending_approval") return { tone: "warn", label: "Needs your decision" };
    return { tone: "neutral", label: status };
  }

  return (
    <Card title="Add-ons">
      {error && <Banner tone="bad" title="Not saved" onDismiss={() => setError("")}>{error}</Banner>}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {rows.map((a) => {
          const b = badgeFor(a.status);
          const pending = a.status === "pending_approval";
          const changing = changingId === a.id;
          const busy = busyId === a.id;
          return (
            <div key={a.id ?? a.label} style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", paddingBottom: "12px", borderBottom: `1px solid ${T.borderFaint}` }}>
              <div style={{ flex: 1, minWidth: "min(100%,180px)", fontSize: "14px" }}>
                {a.label}
                <span style={{ display: "block", fontSize: "12px", color: T.muted }}>
                  {a.price === null ? "Price on request" : `$${a.price.toLocaleString("en-US")}`}
                </span>
              </div>
              <Badge tone={b.tone}>{b.label}</Badge>
              {a.id && (pending || changing) && (
                <div style={{ display: "flex", gap: "6px" }}>
                  <Button small disabled={busy} onClick={() => void resolve(a.id!, "approve")}>Approve</Button>
                  <Button small variant="danger" disabled={busy} onClick={() => void resolve(a.id!, "decline")}>Decline</Button>
                </div>
              )}
              {a.id && !pending && !changing && a.requiresApproval && (
                <Button small variant="ghost" onClick={() => setChangingId(a.id!)}>Change</Button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { bookings, loading, loadError, refresh, pausePolling } = useOps();
  const [dialog, setDialog] = useState<"payment" | "refund" | null>(
    search.get("do") === "payment" ? "payment" : search.get("do") === "refund" ? "refund" : null,
  );
  const [previewAction, setPreviewAction] = useState<PreviewAction | null>(null);
  const [flash, setFlash] = useState("");

  // Derived from the live array on every render, so the 45s refresh is
  // reflected immediately instead of freezing at click time (audit D-2).
  const booking = useMemo(() => bookings.find((b) => b.id === id), [bookings, id]);

  if (!booking) {
    return (
      <>
        <Button variant="ghost" small onClick={() => router.push("/ops/bookings")}>← All bookings</Button>
        <div style={{ marginTop: "18px" }}>
          <EmptyState
            reason={loadError ? "load-failed" : "clear"}
            message={loadError
              ? "We couldn't load bookings, so we can't show this one."
              : loading ? "Loading…" : "This booking is no longer in the list. It may have been removed."}
            onRetry={() => void refresh()}
          />
        </div>
      </>
    );
  }

  const status = (booking.status ?? "").toLowerCase();
  const isEvent = Boolean(
    booking.event_type && typeof booking.message === "string" && booking.message.includes("[Event Inquiry]"),
  );
  const staySetup = parseStaySetupMessage(booking.message);
  const moneyView = bookingMoneyView(booking);
  const total = booking.amount_total ?? 0;
  const paid = booking.amount_paid ?? 0;
  const outstanding = Math.max(0, total - paid);
  const refunded = booking.refund_amount ?? 0;
  const owedBack = status === "cancelled" ? Math.max(0, paid - refunded) : 0;
  const step = currentStep(booking, Date.now());
  const denominator = moneyView.amount ?? 0;
  const pct = denominator > 0 ? Math.min(100, Math.round((paid / denominator) * 100)) : 0;

  async function afterAction(message: string) {
    // The dialog paused polling while open; a success path that skips onClose
    // must unpause too, or the page silently stops refreshing.
    pausePolling(false);
    setFlash(message);
    setDialog(null);
    await refresh();
  }

  return (
    <>
      <Button variant="ghost" small onClick={() => router.push("/ops/bookings")}>← All bookings</Button>

      <div style={{ marginTop: "14px" }}>
        <PageHead
          title={bookingGuestName(booking)}
          sub={`${booking.villa ?? "—"} · ${day(booking.check_in)} → ${day(booking.check_out)}`}
        />
      </div>
      <div style={{ marginTop: "-18px", marginBottom: "22px", display: "flex", gap: "10px", alignItems: "center" }}>
        <Ref id={formatBookingRef(booking.id)} />
        {booking.member_id && <Badge tone="gold">Member</Badge>}
      </div>

      {flash && <Banner tone="ok" title="Done" onDismiss={() => setFlash("")}>{flash}</Banner>}

      <div style={{
        display: "flex", background: T.surface, border: `1px solid ${T.borderFaint}`,
        borderRadius: T.r, padding: "6px", overflowX: "auto", marginBottom: "26px",
      }}>
        {STEPS.map((label, i) => {
          const done = i < step;
          const now = i === step;
          return (
            <div key={label} style={{
              flex: 1, minWidth: "96px", textAlign: "center", padding: "10px 8px", fontSize: "12px",
              borderRadius: T.rSm, background: now ? T.gold : "transparent",
              color: now ? T.onGold : done ? T.ink2 : T.faint, fontWeight: now ? 700 : 400,
            }}>
              <div style={{
                width: "9px", height: "9px", borderRadius: "999px", margin: "0 auto 7px",
                background: now ? T.onGold : done ? T.ok : "rgba(255,255,255,.16)",
              }} />
              {status === "cancelled" && i === 5 ? "Cancelled" : label}
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "20px", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <Card title="Guest">
            <Rows>
              <Row k="Phone" v={booking.guest_phone ?? booking.member_contact?.phone ?? "—"} />
              <Row k="Email" v={booking.guest_email ?? booking.member_contact?.email ?? "—"} />
              <Row k="Coming from" v={booking.guest_country ?? "—"} />
              <Row k="Guests" v={`${booking.sleeping_guests ?? "?"} sleeping${booking.day_visitors ? ` · ${booking.day_visitors} day visitors` : ""}`} />
              {staySetup ? (
                <>
                  {staySetup.bedrooms && <Row k="Bedrooms" v={staySetup.bedrooms} />}
                  {staySetup.estimatedGuests && <Row k="Estimated guests" v={staySetup.estimatedGuests} />}
                  {staySetup.addonsInterest && <Row k="Extras they asked about" v={staySetup.addonsInterest} />}
                  {staySetup.guestNotes && (
                    <Row k="Their message" v={<span style={{ display: "inline-block", maxWidth: "280px", whiteSpace: "pre-line" }}>&ldquo;{staySetup.guestNotes}&rdquo;</span>} />
                  )}
                </>
              ) : booking.message ? (
                <Row k="Their message" v={<span style={{ display: "inline-block", maxWidth: "280px" }}>&ldquo;{booking.message}&rdquo;</span>} />
              ) : null}
            </Rows>
          </Card>

          <AddonsCard booking={booking} onChanged={refresh} />

          {isEvent ? (
            <Card title="Event enquiry">
              <p style={{ margin: 0, fontSize: "14px", color: T.muted, lineHeight: 1.6 }}>
                Events are agreed through a proposal, which lives in the legacy admin until the event screens
                are built here. Nothing on this page emails the guest.
              </p>
            </Card>
          ) : status === "pending" ? (
            <Card title="Your approval">
              <p style={{ margin: "0 0 16px", fontSize: "14px", color: T.muted, lineHeight: 1.6 }}>
                Both choices show you the exact messages before anything is sent.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <Button variant="primary" wide onClick={() => setPreviewAction({ kind: "approve" })}>
                  Approve this stay…
                </Button>
                <Button variant="danger" wide onClick={() => setPreviewAction({ kind: "decline", expectedStatus: "pending" })}>
                  Decline this request…
                </Button>
              </div>
            </Card>
          ) : status === "confirmed" ? (
            <Card title="Changing this stay">
              <p style={{ margin: "0 0 16px", fontSize: "14px", color: T.muted, lineHeight: 1.6 }}>
                Cancelling shows you the guest&apos;s cancellation email before it is sent.
                {paid > 0 && " Money already received will appear here as owed back afterwards."}
              </p>
              <Button variant="danger" wide onClick={() => setPreviewAction({ kind: "decline", expectedStatus: "confirmed" })}>
                Cancel this stay…
              </Button>
            </Card>
          ) : null}
        </div>

        <Card title="Money">
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px", margin: "2px 0 18px" }}>
            <span style={{ fontFamily: T.serif, fontSize: "34px" }}>{money(moneyView.amount)}</span>
            <span style={{ fontSize: "12px", letterSpacing: "1.6px", textTransform: "uppercase", color: T.muted }}>
              {moneyView.estimated ? "total · estimated" : "total"}
            </span>
          </div>
          {moneyView.estimated && (
            <p style={{ fontSize: "12px", color: T.faint, margin: "-12px 0 16px" }}>
              From the request&apos;s pricing — becomes recorded money once payments start.
            </p>
          )}
          <div style={{ height: "6px", borderRadius: "999px", background: "rgba(255,255,255,.09)", overflow: "hidden", marginBottom: "8px" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: T.ok, borderRadius: "999px" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: T.muted, marginBottom: "20px" }}>
            <span>{money(paid)} received</span>
            <span>
              {moneyView.estimated
                ? "nothing requested yet"
                : outstanding > 0 ? `${money(outstanding)} outstanding` : "nothing outstanding"}
            </span>
          </div>

          <Rows>
            {booking.deposit_amount != null && <Row k="Deposit" v={money(booking.deposit_amount)} />}
            {booking.payment_due_at && <Row k="Due" v={day(booking.payment_due_at)} />}
            {booking.payment_method && <Row k="Last method" v={booking.payment_method} />}
            {booking.payment_reference && <Row k="Reference" v={booking.payment_reference} />}
            {booking.payment_marked_by && <Row k="Recorded by" v={booking.payment_marked_by} />}
            {refunded > 0 && <Row k="Refunded" v={<>{money(refunded)} <Badge tone="ok">Returned</Badge></>} />}
            {booking.refund_provider_reference && <Row k="Refund reference" v={booking.refund_provider_reference} />}
          </Rows>

          <div style={{ marginTop: "22px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {status === "cancelled" ? (
              owedBack > 0 ? (
                <>
                  <Button variant="primary" wide onClick={() => setDialog("refund")}>Record a refund</Button>
                  <p style={{ margin: 0, fontSize: "12px", color: T.faint, textAlign: "center" }}>
                    {money(owedBack)} received and not yet returned
                  </p>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: "13px", color: T.muted, textAlign: "center" }}>
                  Cancelled · nothing owed back
                </p>
              )
            ) : status === "pending" ? (
              <>
                <Button wide disabled>Record a payment</Button>
                <p style={{ margin: 0, fontSize: "12px", color: T.faint, textAlign: "center" }}>
                  Available once the stay is approved
                </p>
              </>
            ) : (
              <Button variant="primary" wide onClick={() => setDialog("payment")}>Record a payment</Button>
            )}
          </div>
        </Card>
      </div>

      {dialog && (
        <MoneyDialog
          mode={dialog}
          booking={booking}
          onClose={() => { pausePolling(false); setDialog(null); }}
          onOpen={() => pausePolling(true)}
          onDone={afterAction}
        />
      )}

      {previewAction && (
        <MessagePreviewDialog
          action={previewAction}
          booking={booking}
          onClose={() => { pausePolling(false); setPreviewAction(null); }}
          onOpen={() => pausePolling(true)}
          onDone={async (message) => {
            pausePolling(false);
            setPreviewAction(null);
            setFlash(message);
            await refresh();
          }}
        />
      )}
    </>
  );
}
