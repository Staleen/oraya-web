"use client";
import { useMemo, useState } from "react";
import { buildBusinessSummary } from "@/lib/ops-business";
import { useOps } from "@/components/ops/OpsProvider";
import { Badge, Card, EmptyState, Kicker, PageHead, Row, Rows, T } from "@/components/ops/ui";
import { Button } from "@/components/ops/ui";

/**
 * The owner's numbers. Every metric states its population, and cancelled
 * bookings are excluded everywhere except the refunds-owed line (audit D-8:
 * the legacy dashboard mixed populations inside one panel).
 *
 * Revenue is money RECORDED. Expected revenue is contracted-but-unpaid and is
 * labelled as such — an estimate never masquerades as money in the bank.
 */

const WINDOWS = [
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "365", label: "Last year", days: 365 },
] as const;

function money(n: number) { return `$${Math.round(n).toLocaleString("en-US")}`; }

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export default function BusinessPage() {
  const { bookings, leads, me, loading, loadError, refresh } = useOps();
  const [windowKey, setWindowKey] = useState<(typeof WINDOWS)[number]["key"]>("30");

  const win = WINDOWS.find((w) => w.key === windowKey)!;
  const summary = useMemo(
    () => buildBusinessSummary(bookings, leads, daysAgo(win.days), new Date().toISOString().slice(0, 10)),
    [bookings, leads, win.days],
  );

  if (me && me.role !== "owner") {
    return (
      <>
        <PageHead title="Business" sub="How the villas are doing" />
        <EmptyState reason="clear" message="These numbers are for the owner." />
      </>
    );
  }

  if (loadError && bookings.length === 0) {
    return (
      <>
        <PageHead title="Business" sub="How the villas are doing" />
        <EmptyState reason="load-failed" message="We couldn't load the data, so these numbers would be wrong." onRetry={() => void refresh()} />
      </>
    );
  }

  return (
    <>
      <PageHead title="Business" sub="How the villas are doing" />

      <div style={{ display: "flex", gap: "6px", marginBottom: "22px", flexWrap: "wrap" }}>
        {WINDOWS.map((w) => (
          <Button key={w.key} small variant={w.key === windowKey ? "primary" : "ghost"} onClick={() => setWindowKey(w.key)}>
            {w.label}
          </Button>
        ))}
      </div>

      {loading && bookings.length === 0 ? (
        <p style={{ color: T.faint, fontSize: "13px" }}>Loading…</p>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "14px", marginBottom: "28px" }}>
            {[
              { label: "Money received", value: money(summary.revenue_received), note: "Recorded payments, cancelled stays excluded" },
              { label: "Still expected", value: money(summary.revenue_expected), note: "Confirmed but not yet paid" },
              { label: "Refunds owed", value: money(summary.refunds_owed), note: "Taken and not returned" },
            ].map((tile) => (
              <div key={tile.label} style={{
                background: T.surface, border: `1px solid ${T.borderFaint}`, borderRadius: T.r, padding: "18px 20px",
              }}>
                <p style={{ margin: "0 0 4px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: T.gold }}>
                  {tile.label}
                </p>
                <p style={{ margin: "0 0 6px", fontFamily: T.serif, fontSize: "30px" }}>{tile.value}</p>
                <p style={{ margin: 0, fontSize: "12px", color: T.faint, lineHeight: 1.5 }}>{tile.note}</p>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "20px", alignItems: "start" }}>
            <Card title="Occupancy">
              <Rows>
                {Object.entries(summary.nights_by_villa).map(([villa, nights]) => (
                  <Row key={villa} k={villa} v={
                    <>
                      {nights} night{nights === 1 ? "" : "s"}{" "}
                      <Badge tone={summary.occupancy_pct_by_villa[villa] >= 50 ? "ok" : "neutral"}>
                        {summary.occupancy_pct_by_villa[villa]}%
                      </Badge>
                    </>
                  } />
                ))}
              </Rows>
              <p style={{ margin: "12px 0 0", fontSize: "12px", color: T.faint, lineHeight: 1.6 }}>
                Nights of confirmed stays falling inside {win.label.toLowerCase()} ({summary.window.days} days).
                Cancelled and pending stays are not counted.
              </p>
            </Card>

            <Card title="Bookings">
              <Rows>
                <Row k="Confirmed" v={summary.confirmed_count} />
                <Row k="Waiting for you" v={summary.pending_count} />
                <Row k="Cancelled" v={summary.cancelled_count} />
              </Rows>
              <div style={{ marginTop: "18px" }}>
                <Kicker>Enquiries</Kicker>
                <Rows>
                  <Row k="WhatsApp enquiries" v={summary.leads_total} />
                  <Row k="Became bookings" v={<>{summary.leads_converted} <Badge tone={summary.lead_conversion_pct >= 30 ? "ok" : "neutral"}>{summary.lead_conversion_pct}%</Badge></>} />
                </Rows>
              </div>
            </Card>

            <Card title="Extras guests choose">
              {summary.addon_uptake.length === 0 ? (
                <p style={{ margin: 0, fontSize: "13px", color: T.faint }}>No extras on confirmed stays yet.</p>
              ) : (
                <Rows>
                  {summary.addon_uptake.slice(0, 8).map((a) => (
                    <Row key={a.label} k={a.label} v={`${a.count}× · ${money(a.revenue)}`} />
                  ))}
                </Rows>
              )}
              <p style={{ margin: "12px 0 0", fontSize: "12px", color: T.faint, lineHeight: 1.6 }}>
                Counted on confirmed stays; declined extras and cancelled stays excluded.
              </p>
            </Card>
          </div>

          <p style={{ margin: "22px 0 0", fontSize: "12px", color: T.faint, lineHeight: 1.7 }}>
            All figures cover bookings currently in Oraya. &ldquo;Money received&rdquo; is what has been recorded as paid —
            not what the website quoted.
          </p>
        </>
      )}
    </>
  );
}
