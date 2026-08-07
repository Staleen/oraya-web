"use client";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatBookingRef, type QueueLead } from "@/lib/ops-queue";
import { useOps } from "@/components/ops/OpsProvider";
import ConvertLeadDialog from "@/components/ops/ConvertLeadDialog";
import { Badge, Banner, Button, Card, EmptyState, Kicker, PageHead, QueueRow, Ref, Row, Rows, T } from "@/components/ops/ui";

/**
 * WhatsApp enquiries, organised by what needs doing rather than by column
 * values: answer it, keep talking, or turn it into a booking request.
 *
 * Lessons carried in from the audit: the guest's own words for their dates are
 * always shown next to the normalised dates (L-5 — a mis-read date can be
 * checked against what they actually typed), conversion cannot create
 * duplicate bookings on retry (L-1), and a lead converted by someone else
 * surfaces as exactly that (L-6).
 */

const TABS = ["To answer", "In conversation", "Converted"] as const;
type Tab = (typeof TABS)[number];

function isEventLead(lead: QueueLead): boolean {
  const rt = (lead.request_type ?? "").trim().toLowerCase();
  return rt === "event" || rt === "events";
}

function isStayLead(lead: QueueLead): boolean {
  const rt = (lead.request_type ?? "").trim().toLowerCase();
  return rt === "stay" || rt === "stays";
}

function leadStatus(lead: QueueLead): "new" | "contacted" | "converted" {
  if (lead.linked_booking_id) return "converted";
  const s = (lead.follow_up_status ?? "new").trim().toLowerCase();
  if (s === "converted") return "converted";
  if (s === "contacted") return "contacted";
  return "new";
}

function leadDates(lead: QueueLead): string {
  if (lead.normalized_check_in && lead.normalized_check_out) {
    return `${lead.normalized_check_in} → ${lead.normalized_check_out}`;
  }
  const words = [lead.check_in_text?.trim(), lead.check_out_text?.trim()].filter(Boolean).join(" → ");
  return words ? `“${words}”` : "dates not given";
}

function ago(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function phoneDigits(lead: QueueLead): string | null {
  const digits = (lead.phone ?? "").replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

export default function EnquiriesPage() {
  return (
    <Suspense fallback={<p style={{ color: T.faint, fontSize: "13px" }}>Loading…</p>}>
      <Enquiries />
    </Suspense>
  );
}

function Enquiries() {
  const { leads, loading, loadError, refresh, pausePolling } = useOps();
  const router = useRouter();
  const search = useSearchParams();

  const [tab, setTab] = useState<Tab>("To answer");
  const [selectedId, setSelectedId] = useState<string | null>(search.get("lead"));
  const [converting, setConverting] = useState(false);
  const [flash, setFlash] = useState<{ message: string; undo?: () => Promise<void> } | null>(null);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notesDraft, setNotesDraft] = useState<string | null>(null);

  const selected = useMemo(
    () => (selectedId ? leads.find((l) => l.id === selectedId) ?? null : null),
    [leads, selectedId],
  );

  const inTab = useMemo(() => {
    const wanted: Record<Tab, "new" | "contacted" | "converted"> = {
      "To answer": "new", "In conversation": "contacted", Converted: "converted",
    };
    return leads.filter((l) => leadStatus(l) === wanted[tab]);
  }, [leads, tab]);

  const counts = useMemo(() => ({
    "To answer": leads.filter((l) => leadStatus(l) === "new").length,
    "In conversation": leads.filter((l) => leadStatus(l) === "contacted").length,
    Converted: leads.filter((l) => leadStatus(l) === "converted").length,
  }), [leads]);

  async function patchLead(id: string, body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setActionError("");
    try {
      const r = await fetch(`/api/ops/leads/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const resBody = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !resBody.ok) {
        setActionError(resBody.error ?? "That didn't save.");
        return false;
      }
      await refresh();
      return true;
    } catch {
      setActionError("Couldn't reach Oraya. Nothing was saved.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function open(lead: QueueLead) {
    setSelectedId(lead.id);
    setNotesDraft(null);
    setActionError("");
    // Keep the deep link shareable without a full navigation.
    window.history.replaceState(null, "", `/ops/enquiries?lead=${lead.id}`);
  }

  function backToList() {
    setSelectedId(null);
    setNotesDraft(null);
    setActionError("");
    window.history.replaceState(null, "", "/ops/enquiries");
  }

  /* ─────────────────────────────────────────────────────── detail view ── */
  if (selected) {
    const status = leadStatus(selected);
    const digits = phoneDigits(selected);
    const event = isEventLead(selected);
    const convertible = isStayLead(selected) && !selected.linked_booking_id;

    return (
      <>
        <Button variant="ghost" small onClick={backToList}>← All enquiries</Button>

        <div style={{ marginTop: "14px" }}>
          <PageHead
            title={selected.name?.trim() || "Someone on WhatsApp"}
            sub={`Enquired ${ago(selected.created_at)} · ${leadDates(selected)}`}
          />
        </div>
        <div style={{ marginTop: "-18px", marginBottom: "22px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Badge tone={status === "new" ? "warn" : status === "converted" ? "ok" : "info"}>
            {status === "new" ? "Waiting for a reply" : status === "converted" ? "Converted" : "In conversation"}
          </Badge>
          {event && <Badge tone="gold">Event</Badge>}
        </div>

        {flash && (
          <Banner tone="ok" title="Done" onDismiss={() => setFlash(null)}>
            {flash.message}
            {flash.undo && (
              <span style={{ marginLeft: "10px" }}>
                <Button small onClick={() => { const u = flash.undo; setFlash(null); if (u) void u(); }}>Undo</Button>
              </span>
            )}
          </Banner>
        )}
        {actionError && <Banner tone="bad" title="Not saved" onDismiss={() => setActionError("")}>{actionError}</Banner>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "20px", alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <Card title="What they asked for">
              <Rows>
                <Row k="Villa" v={selected.villa?.trim() || "Not said"} />
                <Row k="Dates" v={
                  selected.normalized_check_in && selected.normalized_check_out
                    ? `${selected.normalized_check_in} → ${selected.normalized_check_out}`
                    : "Not settled yet"
                } />
                {(selected.check_in_text?.trim() || selected.check_out_text?.trim()) && (
                  <Row k="In their words" v={
                    <span style={{ color: T.muted }}>
                      {[selected.check_in_text?.trim(), selected.check_out_text?.trim()].filter(Boolean).map((w) => `“${w}”`).join(" → ")}
                    </span>
                  } />
                )}
                <Row k="Guests" v={selected.guest_count != null && String(selected.guest_count).trim() !== "" ? String(selected.guest_count) : "Not said"} />
                <Row k="Phone" v={selected.phone?.trim() || "—"} />
                {selected.special_requests?.trim() && (
                  <Row k="Their message" v={<span style={{ display: "inline-block", maxWidth: "280px" }}>&ldquo;{selected.special_requests.trim()}&rdquo;</span>} />
                )}
                {selected.addons_interest?.trim() && <Row k="Extras they asked about" v={selected.addons_interest.trim()} />}
              </Rows>
            </Card>

            <Card title="Notes">
              <textarea
                value={notesDraft ?? selected.admin_notes ?? ""}
                onChange={(e) => setNotesDraft(e.target.value)}
                rows={4}
                placeholder="Anything the next person should know."
                style={{
                  width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.05)",
                  border: `1px solid ${T.borderStrong}`, borderRadius: T.rSm, padding: "12px 13px",
                  fontFamily: T.sans, fontSize: "14px", color: T.ink, outline: "none", resize: "vertical",
                }}
              />
              {notesDraft !== null && notesDraft !== (selected.admin_notes ?? "") && (
                <div style={{ marginTop: "10px", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                  <Button small onClick={() => setNotesDraft(null)}>Discard</Button>
                  <Button small variant="primary" disabled={busy} onClick={() => {
                    void patchLead(selected.id, { admin_notes: notesDraft }).then((ok) => { if (ok) setNotesDraft(null); });
                  }}>Save notes</Button>
                </div>
              )}
            </Card>
          </div>

          <Card title="Next step">
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {digits && (
                <Button wide onClick={() => window.open(`https://wa.me/${digits}`, "_blank", "noopener")}>
                  Reply on WhatsApp
                </Button>
              )}

              {status === "new" && (
                <Button wide disabled={busy} onClick={() => {
                  void patchLead(selected.id, { follow_up_status: "contacted" }).then((ok) => {
                    if (ok) setFlash({
                      message: "Marked as in conversation.",
                      undo: async () => { await patchLead(selected.id, { follow_up_status: "new" }); },
                    });
                  });
                }}>
                  Mark as in conversation
                </Button>
              )}

              {selected.linked_booking_id ? (
                <div style={{ fontSize: "13px", color: T.muted, lineHeight: 1.7 }}>
                  Became booking{" "}
                  <button
                    onClick={() => router.push(`/ops/bookings/${selected.linked_booking_id}`)}
                    style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }}
                  >
                    <Ref id={formatBookingRef(selected.linked_booking_id)} />
                  </button>
                  {" "}— open it to approve, decline, or record money.
                </div>
              ) : event ? (
                <p style={{ margin: 0, fontSize: "13px", color: T.muted, lineHeight: 1.7 }}>
                  Event enquiries are planned through a proposal, which lives in the legacy admin for now.
                  This screen keeps the conversation and notes.
                </p>
              ) : convertible ? (
                <Button wide variant="primary" onClick={() => { pausePolling(true); setConverting(true); }}>
                  Turn into a booking request…
                </Button>
              ) : null}
            </div>
          </Card>
        </div>

        {converting && (
          <ConvertLeadDialog
            lead={selected}
            onClose={() => { pausePolling(false); setConverting(false); }}
            onOpen={() => pausePolling(true)}
            onDone={async (message, bookingId) => {
              pausePolling(false);
              setConverting(false);
              setFlash({ message });
              await refresh();
              router.push(`/ops/bookings/${bookingId}`);
            }}
          />
        )}
      </>
    );
  }

  /* ───────────────────────────────────────────────────────── list view ── */
  return (
    <>
      <PageHead title="Enquiries" sub="WhatsApp conversations that may become stays" />

      {flash && (
        <Banner tone="ok" title="Done" onDismiss={() => setFlash(null)}>{flash.message}</Banner>
      )}

      <div style={{ display: "flex", gap: "6px", overflowX: "auto", marginBottom: "22px" }}>
        {TABS.map((t) => (
          <Button key={t} small variant={t === tab ? "primary" : "ghost"} onClick={() => setTab(t)}>
            {t}{counts[t] > 0 ? ` · ${counts[t]}` : ""}
          </Button>
        ))}
      </div>

      {inTab.length === 0 ? (
        <EmptyState
          reason={loadError ? "load-failed" : "clear"}
          message={loadError
            ? "We couldn't load enquiries, so this list is not to be trusted."
            : loading ? "Loading…"
            : tab === "To answer" ? "No one is waiting for a reply."
            : tab === "In conversation" ? "No open conversations."
            : "Nothing converted yet."}
          onRetry={loadError ? () => void refresh() : undefined}
        />
      ) : (
        <div>
          <Kicker count={inTab.length}>{tab}</Kicker>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {inTab.map((lead) => (
              <QueueRow
                key={lead.id}
                accent={leadStatus(lead) === "new" ? "bad" : leadStatus(lead) === "converted" ? "gold" : "info"}
                title={<>
                  <b>{lead.name?.trim() || "Someone on WhatsApp"}</b>
                  {isEventLead(lead) && <span style={{ marginLeft: "8px" }}><Badge tone="gold">Event</Badge></span>}
                </>}
                detail={`${lead.villa?.trim() || "Villa not said"} · ${leadDates(lead)} · enquired ${ago(lead.created_at)}`}
                actions={<Button small variant="primary" onClick={() => open(lead)}>Review</Button>}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
