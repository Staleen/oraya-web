"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBookingRef } from "@/lib/ops-queue";
import { useOps } from "@/components/ops/OpsProvider";
import { Badge, Button, EmptyState, Field, PageHead, QueueRow, Ref, type Tone } from "@/components/ops/ui";

const TABS = ["Needs attention", "Upcoming", "Staying now", "Past", "Cancelled"] as const;

function money(n: number | null) { return n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`; }

export default function BookingsPage() {
  const { bookings, loadError, loading, refresh } = useOps();
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Needs attention");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const now = Date.now();
    const term = q.trim().toLowerCase();
    return bookings.filter((b) => {
      const status = (b.status ?? "").toLowerCase();
      const paid = b.amount_paid ?? 0;
      const inFuture = b.check_in ? Date.parse(b.check_in) > now : false;
      const staying = b.check_in && b.check_out
        ? Date.parse(b.check_in) <= now && Date.parse(b.check_out) >= now : false;
      const needs =
        status === "pending" ||
        (status === "cancelled" && paid > 0 && !b.refunded_at) ||
        (status === "confirmed" && (b.amount_total ?? 0) - paid > 0 && b.payment_due_at
          ? Date.parse(b.payment_due_at) < now : false);

      const inTab =
        tab === "Needs attention" ? needs
        : tab === "Upcoming" ? status === "confirmed" && inFuture
        : tab === "Staying now" ? status === "confirmed" && staying
        : tab === "Cancelled" ? status === "cancelled"
        : status === "confirmed" && !inFuture && !staying;
      if (!inTab) return false;
      if (!term) return true;
      // B-1: reference, name, email and phone are all searchable — the old
      // admin could not find a booking by the reference it emails to guests.
      return [
        formatBookingRef(b.id).toLowerCase(), b.id.toLowerCase(),
        (b.guest_name ?? "").toLowerCase(), (b.guest_email ?? "").toLowerCase(),
        (b.guest_phone ?? "").replace(/\D/g, ""),
      ].some((h) => h.includes(term) || (/^\d+$/.test(term) && h.includes(term)));
    });
  }, [bookings, tab, q]);

  function statusBadge(b: (typeof bookings)[number]): { tone: Tone; label: string } {
    const s = (b.status ?? "").toLowerCase();
    if (s === "pending") return { tone: "warn", label: "Awaiting your approval" };
    if (s === "cancelled") return (b.amount_paid ?? 0) > 0 && !b.refunded_at
      ? { tone: "bad", label: "Refund owed" } : { tone: "neutral", label: "Cancelled" };
    const outstanding = (b.amount_total ?? 0) - (b.amount_paid ?? 0);
    if (outstanding <= 0) return { tone: "ok", label: "Paid in full" };
    return { tone: "info", label: `${money(outstanding)} outstanding` };
  }

  return (
    <>
      <PageHead title="Bookings" sub={`${bookings.length} stays`} />

      <div style={{ display: "flex", gap: "6px", overflowX: "auto", marginBottom: "18px" }}>
        {TABS.map((t) => (
          <Button key={t} small variant={t === tab ? "primary" : "ghost"} onClick={() => setTab(t)}>{t}</Button>
        ))}
      </div>

      <Field
        label="Search"
        placeholder="Guest name, phone, email, or the reference they were emailed"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {filtered.length === 0 ? (
        <EmptyState
          reason={loadError ? "load-failed" : "clear"}
          message={loadError
            ? "We couldn't load bookings, so this list is not to be trusted."
            : loading ? "Loading…" : q ? `Nothing matches “${q}”.` : "Nothing here."}
          onRetry={loadError ? () => void refresh() : undefined}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {filtered.map((b) => {
            const s = statusBadge(b);
            return (
              <QueueRow
                key={b.id}
                accent={s.tone === "bad" ? "bad" : s.tone === "warn" ? "bad" : "info"}
                title={<><b>{b.guest_name ?? "Guest"}</b> <Ref id={formatBookingRef(b.id)} /></>}
                detail={<>{b.villa ?? "—"} · {b.check_in?.slice(0, 10)} → {b.check_out?.slice(0, 10)} · {money(b.amount_paid)} of {money(b.amount_total)} · <Badge tone={s.tone}>{s.label}</Badge></>}
                actions={<Button small variant="primary" onClick={() => router.push(`/ops/bookings/${b.id}`)}>Open</Button>}
              />
            );
          })}
        </div>
      )}
    </>
  );
}
