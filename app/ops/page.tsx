"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { buildQueue, groupQueue, type QueueItem } from "@/lib/ops-queue";
import { useOps } from "@/components/ops/OpsProvider";
import { Button, EmptyState, Kicker, PageHead, QueueRow } from "@/components/ops/ui";

function accentFor(item: QueueItem): "bad" | "gold" | "info" {
  if (item.group === "money") return "gold";
  if (
    item.kind === "booking_request" ||
    item.kind === "addon_approval" ||
    item.kind === "event_accepted_unconfirmed" ||
    item.kind === "event_proposal_needed"
  ) return "bad";
  return "info";
}

export default function TodayPage() {
  const { bookings, leads, loading, loadError, refresh } = useOps();
  const router = useRouter();

  // Recomputed per render from live arrays — never a click-time copy, so the
  // 45s refresh is reflected immediately.
  const items = useMemo(() => buildQueue(bookings, leads, Date.now()), [bookings, leads]);
  const groups = useMemo(() => groupQueue(items), [items]);

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Beirut",
  });

  function actionsFor(item: QueueItem) {
    if (item.leadId) {
      return <Button variant="primary" small onClick={() => router.push(`/ops/enquiries?lead=${item.leadId}`)}>Review</Button>;
    }
    if (!item.bookingId) return null;
    const open = () => router.push(`/ops/bookings/${item.bookingId}`);
    switch (item.kind) {
      case "deposit_overdue":
      case "payment_expected":
        return (
          <>
            <Button small onClick={open}>Open</Button>
            <Button variant="primary" small onClick={() => router.push(`/ops/bookings/${item.bookingId}?do=payment`)}>Record payment</Button>
          </>
        );
      case "refund_owed":
        return <Button variant="primary" small onClick={() => router.push(`/ops/bookings/${item.bookingId}?do=refund`)}>Record refund</Button>;
      case "arrival_guide_unsent":
        return <Button variant="primary" small onClick={() => router.push(`/ops/bookings/${item.bookingId}?do=guide`)}>Send arrival guide</Button>;
      case "event_proposal_needed":
        return <Button variant="primary" small onClick={open}>Build the proposal</Button>;
      case "event_accepted_unconfirmed":
        return <Button variant="primary" small onClick={open}>Confirm the event</Button>;
      default:
        return <Button variant="primary" small onClick={open}>Open</Button>;
    }
  }

  const section = (label: string, list: QueueItem[]) =>
    list.length === 0 ? null : (
      <div style={{ marginBottom: "34px" }} key={label}>
        <Kicker count={list.length}>{label}</Kicker>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {list.map((item) => (
            <QueueRow
              key={item.id}
              accent={accentFor(item)}
              title={item.title}
              detail={item.detail}
              actions={actionsFor(item)}
            />
          ))}
        </div>
      </div>
    );

  const total = items.length;

  return (
    <>
      <PageHead
        title="Today"
        sub={loading && total === 0 ? today : `${today} · ${total === 0 ? "nothing needs you" : `${total} thing${total === 1 ? "" : "s"} need${total === 1 ? "s" : ""} you`}`}
      />

      {total === 0 && !loading && (
        <EmptyState
          // The distinction that stops a failed fetch reading as a free day.
          reason={loadError ? "load-failed" : "clear"}
          message={
            loadError
              ? "We couldn't load your work, so this list is not to be trusted."
              : "Nothing needs you right now. New enquiries and requests will appear here."
          }
          onRetry={loadError ? () => void refresh() : undefined}
        />
      )}

      {section("Needs you now", groups.attention)}
      {section("Money", groups.money)}
      {section("Arriving soon", groups.arriving)}
    </>
  );
}
