"use client";
import { useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { formatBookingRef, type QueueBooking } from "@/lib/ops-queue";
import { useOps } from "@/components/ops/OpsProvider";
import MoneyDialog from "@/components/ops/MoneyDialog";
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

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { bookings, loading, loadError, refresh, pausePolling } = useOps();
  const [dialog, setDialog] = useState<"payment" | "refund" | null>(
    search.get("do") === "payment" ? "payment" : search.get("do") === "refund" ? "refund" : null,
  );
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
  const total = booking.amount_total ?? 0;
  const paid = booking.amount_paid ?? 0;
  const outstanding = Math.max(0, total - paid);
  const refunded = booking.refund_amount ?? 0;
  const owedBack = status === "cancelled" ? Math.max(0, paid - refunded) : 0;
  const step = currentStep(booking, Date.now());
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

  async function afterAction(message: string) {
    setFlash(message);
    setDialog(null);
    await refresh();
  }

  return (
    <>
      <Button variant="ghost" small onClick={() => router.push("/ops/bookings")}>← All bookings</Button>

      <div style={{ marginTop: "14px" }}>
        <PageHead
          title={booking.guest_name ?? "Guest"}
          sub={`${booking.villa ?? "—"} · ${day(booking.check_in)} → ${day(booking.check_out)}`}
        />
      </div>
      <div style={{ marginTop: "-18px", marginBottom: "22px" }}><Ref id={formatBookingRef(booking.id)} /></div>

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
              <Row k="Phone" v={booking.guest_phone ?? "—"} />
              <Row k="Email" v={booking.guest_email ?? "—"} />
              <Row k="Coming from" v={booking.guest_country ?? "—"} />
              <Row k="Guests" v={`${booking.sleeping_guests ?? "?"} sleeping${booking.day_visitors ? ` · ${booking.day_visitors} day visitors` : ""}`} />
              {booking.message && <Row k="Their message" v={<span style={{ display: "inline-block", maxWidth: "280px" }}>&ldquo;{booking.message}&rdquo;</span>} />}
            </Rows>
          </Card>

          <Card title="Approving, declining and messaging">
            <p style={{ margin: 0, fontSize: "14px", color: T.muted, lineHeight: 1.6 }}>
              These move next, together with the message previews from the prototype. They send real email and
              WhatsApp, so they reuse the existing sending code rather than a second copy of it.
            </p>
          </Card>
        </div>

        <Card title="Money">
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px", margin: "2px 0 18px" }}>
            <span style={{ fontFamily: T.serif, fontSize: "34px" }}>{money(total)}</span>
            <span style={{ fontSize: "12px", letterSpacing: "1.6px", textTransform: "uppercase", color: T.muted }}>total</span>
          </div>
          <div style={{ height: "6px", borderRadius: "999px", background: "rgba(255,255,255,.09)", overflow: "hidden", marginBottom: "8px" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: T.ok, borderRadius: "999px" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: T.muted, marginBottom: "20px" }}>
            <span>{money(paid)} received</span>
            <span>{outstanding > 0 ? `${money(outstanding)} outstanding` : "nothing outstanding"}</span>
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
    </>
  );
}
