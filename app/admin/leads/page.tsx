"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { BORDER, GOLD, LATO, MUTED, PLAYFAIR, SURFACE, WHITE } from "@/components/admin/theme";
import { adminApiFetchInit } from "@/lib/admin-auth";
import type { FollowUpStatus, WhatsappLeadAdminRow } from "@/lib/butler/leads";
import LeadKpis, { type KpiKey } from "@/components/admin/leads/LeadKpis";
import LeadFilters from "@/components/admin/leads/LeadFilters";
import LeadList from "@/components/admin/leads/LeadList";
import LeadDetail from "@/components/admin/leads/LeadDetail";
import LeadConversionModal from "@/components/admin/leads/LeadConversionModal";
import {
  INITIAL_FILTER_STATE,
  applyClientFilters,
  applyStatusWithScopeRelax,
  computeKpiCounts,
  hasAnyFiltersActive,
  hasNonScopeFiltersActive,
  isPlainOpenView,
  uniqueVillas,
  type LeadFilterState,
} from "@/components/admin/leads/leadHelpers";

/**
 * Phase 16A.2.f — WhatsApp leads operator console.
 *
 * UI rewrite of the wide table into a two-pane (list + detail) layout. Uses
 * the existing /api/admin/leads GET + PATCH contract unchanged. No booking
 * creation, no availability hold, no payment, no access details surfaced.
 *
 * All filters are applied client-side over the loaded list so KPI counts stay
 * stable when the operator toggles status. Default limit=500 (server max).
 */

const MOBILE_BREAKPOINT = 900;
const FETCH_LIMIT = 500;

function useViewportWidth(): number {
  const [w, setW] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return w;
}

const H1_STYLE: CSSProperties = {
  fontFamily: PLAYFAIR,
  fontSize: "24px",
  color: WHITE,
  margin: 0,
};

const SUBTITLE_STYLE: CSSProperties = {
  fontFamily: LATO,
  fontSize: "11px",
  letterSpacing: "1.5px",
  color: MUTED,
  margin: "4px 0 0",
};

const ERROR_BANNER: CSSProperties = {
  fontFamily: LATO,
  fontSize: "12px",
  color: "#e07070",
  backgroundColor: "rgba(224,112,112,0.06)",
  border: "0.5px solid rgba(224,112,112,0.35)",
  padding: "10px 14px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
};

const RETRY_BUTTON: CSSProperties = {
  fontFamily: LATO,
  fontSize: "10px",
  letterSpacing: "2px",
  textTransform: "uppercase",
  color: GOLD,
  backgroundColor: "transparent",
  border: `0.5px solid ${GOLD}`,
  padding: "6px 12px",
  cursor: "pointer",
};

const SUCCESS_BANNER: CSSProperties = {
  fontFamily: LATO,
  fontSize: "12px",
  color: "#7fc99a",
  backgroundColor: "rgba(127,201,154,0.08)",
  border: "0.5px solid rgba(127,201,154,0.35)",
  padding: "10px 14px",
  lineHeight: 1.5,
};

const PAGE_WRAPPER_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  overflowX: "hidden",
  boxSizing: "border-box",
};

const FILTERS_WRAPPER: CSSProperties = {
  border: `0.5px solid ${BORDER}`,
  backgroundColor: SURFACE,
  padding: "14px 16px",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  overflowX: "hidden",
};

// Detail content is capped so it stays comfortable on huge monitors — the
// flex parent can be 1400px wide, but the reading column inside stays sane.
const DETAIL_CONTENT_MAX_WIDTH = 820;

export default function AdminLeadsPage() {
  const viewportWidth = useViewportWidth();
  const isMobile = viewportWidth < MOBILE_BREAKPOINT;
  const isNarrowDesktop = viewportWidth >= MOBILE_BREAKPOINT && viewportWidth < 1200;

  const [leads, setLeads] = useState<WhatsappLeadAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [filters, setFilters] = useState<LeadFilterState>(INITIAL_FILTER_STATE);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  // 16A.2.h — deletion state. deletingId is the lead currently being
  // DELETEd; deleteError is the most recent failure code, and deleteErrorId
  // pins that error to a specific lead row so the inline message renders on
  // the right card (left list quick-delete) or right pane (danger zone)
  // instead of leaking onto an unrelated lead. The error clears automatically
  // when the operator switches leads (see effect below).
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteErrorId, setDeleteErrorId] = useState<string | null>(null);
  const [conversionLead, setConversionLead] = useState<WhatsappLeadAdminRow | null>(null);
  const [successMessage, setSuccessMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/leads?limit=${FETCH_LIMIT}`, adminApiFetchInit);
      if (!res.ok) {
        setError(res.status === 401 ? "Not authenticated. Sign in again." : "Failed to load leads.");
        setLeads([]);
        return;
      }
      const data = (await res.json()) as { ok?: boolean; leads?: WhatsappLeadAdminRow[]; error?: string };
      if (!data.ok || !Array.isArray(data.leads)) {
        setError(data.error ?? "Failed to load leads.");
        setLeads([]);
        return;
      }
      setLeads(data.leads);
    } catch {
      setError("Failed to load leads.");
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => computeKpiCounts(leads), [leads]);
  const villaOptions = useMemo(() => uniqueVillas(leads), [leads]);
  const filtered = useMemo(() => applyClientFilters(leads, filters), [leads, filters]);

  // Selected lead — derived from the source-of-truth `leads` array so PATCH
  // results flow through automatically.
  const selectedLead = useMemo(
    () => (selectedLeadId ? leads.find((l) => l.id === selectedLeadId) ?? null : null),
    [leads, selectedLeadId],
  );

  // On desktop, if nothing is selected and there's something to show, auto-select
  // the first lead in the filtered list so the right pane is never empty by accident.
  useEffect(() => {
    if (isMobile) return;
    if (selectedLeadId) return;
    if (filtered.length === 0) return;
    setSelectedLeadId(filtered[0].id);
  }, [isMobile, selectedLeadId, filtered]);

  const hiddenByFilter =
    !!selectedLead && !filtered.some((l) => l.id === selectedLead.id);

  const activeKpiKey: KpiKey | null = useMemo(() => {
    if (filters.status === "new") return "new";
    if (filters.status === "needs_action") return "needsAction";
    if (filters.status === "converted") return "converted";
    if (filters.type === "event") return "events";
    if (filters.priority === "vip_or_human") return "vipOrNeedsHuman";
    return null;
  }, [filters]);

  function applyKpiShortcut(key: KpiKey) {
    // Each KPI maps to ONE filter slot. Clicking the active KPI clears that
    // slot. Status-targeting KPIs route through applyStatusWithScopeRelax so a
    // shortcut like "Converted" relaxes the Open scope to All instead of
    // producing zero results.
    const isActive = activeKpiKey === key;
    if (key === "new") {
      setFilters((f) => applyStatusWithScopeRelax(f, isActive ? "all" : "new"));
      return;
    }
    if (key === "needsAction") {
      setFilters((f) => applyStatusWithScopeRelax(f, isActive ? "all" : "needs_action"));
      return;
    }
    if (key === "converted") {
      setFilters((f) => applyStatusWithScopeRelax(f, isActive ? "all" : "converted"));
      return;
    }
    if (key === "events") {
      setFilters((f) => ({ ...f, type: isActive ? "all" : "event" }));
      return;
    }
    if (key === "vipOrNeedsHuman") {
      setFilters((f) => ({ ...f, priority: isActive ? "all" : "vip_or_human" }));
      return;
    }
  }

  const hasFiltersActive = useMemo(() => hasAnyFiltersActive(filters), [filters]);
  const hasSubFiltersActive = useMemo(() => hasNonScopeFiltersActive(filters), [filters]);
  const isOpenInbox = useMemo(() => isPlainOpenView(filters), [filters]);

  // Contextual count text for the filter row.
  //   open + no other filters → "Showing N open leads"
  //   closed + no other filters → "Showing N closed leads"
  //   any other state → "Showing N of M leads"
  const countText = useMemo(() => {
    const n = filtered.length;
    const m = leads.length;
    if (isOpenInbox) {
      return n === 0 ? "No open leads" : `Showing ${n} open lead${n === 1 ? "" : "s"}`;
    }
    if (filters.scope === "closed" && !hasSubFiltersActive) {
      return n === 0 ? "No closed leads" : `Showing ${n} closed lead${n === 1 ? "" : "s"}`;
    }
    return `Showing ${n} of ${m} lead${m === 1 ? "" : "s"}`;
  }, [filtered.length, leads.length, isOpenInbox, filters.scope, hasSubFiltersActive]);

  async function patchLead(id: string, patch: Record<string, unknown>) {
    setSavingId(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/leads/${id}`, {
        ...adminApiFetchInit,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        lead?: WhatsappLeadAdminRow;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.lead) {
        setError(data.error ?? "Failed to update lead.");
        return;
      }
      setLeads((prev) => prev.map((l) => (l.id === id ? data.lead! : l)));
    } catch {
      setError("Failed to update lead.");
    } finally {
      setSavingId(null);
    }
  }

  function handleLeadConverted(nextLead: WhatsappLeadAdminRow) {
    setLeads((prev) => prev.map((l) => (l.id === nextLead.id ? nextLead : l)));
    setSelectedLeadId(nextLead.id);
    setConversionLead(null);
    setSuccessMessage("Booking request created and linked. Pending review.");
  }

  function handleStatusChange(id: string, next: FollowUpStatus) {
    void patchLead(id, { follow_up_status: next });
  }

  function handleSaveNote(id: string, next: string | null) {
    void patchLead(id, { admin_notes: next });
  }

  // 16A.2.h — permanent delete of a single whatsapp_leads row. On success
  // the lead is removed from local state and we auto-select the next visible
  // lead so the operator can keep triaging without a click. The API guards
  // linked_booking_id; the UI surfaces that as an inline error rather than a
  // generic failure.
  async function deleteLead(id: string) {
    setDeletingId(id);
    setDeleteError(null);
    setDeleteErrorId(null);
    try {
      const res = await fetch(`/api/admin/leads/${id}`, {
        ...adminApiFetchInit,
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setDeleteError(data.error ?? "server_error");
        setDeleteErrorId(id);
        return;
      }

      // Pick the next lead to auto-select before mutating `leads` so the
      // ordering matches what the operator saw on screen. We only re-target
      // selection if the deleted lead was actually the selected one — a
      // quick-delete from the left list on a non-selected card should not
      // hijack the operator's current detail pane.
      const visible = filtered;
      const idx = visible.findIndex((l) => l.id === id);
      let nextSelectedId: string | null = selectedLeadId;
      if (selectedLeadId === id && idx !== -1) {
        const next = visible[idx + 1] ?? visible[idx - 1] ?? null;
        nextSelectedId = next ? next.id : null;
      }

      setLeads((prev) => prev.filter((l) => l.id !== id));
      setSelectedLeadId(nextSelectedId);
    } catch {
      setDeleteError("server_error");
      setDeleteErrorId(id);
    } finally {
      setDeletingId(null);
    }
  }

  // Reset the inline delete error whenever the operator switches leads so
  // an old failure doesn't haunt a different lead's detail pane.
  useEffect(() => {
    setDeleteError(null);
    setDeleteErrorId(null);
  }, [selectedLeadId]);

  function clearAllFilters() {
    setSuccessMessage("");
    setFilters(INITIAL_FILTER_STATE);
  }

  // "Show all leads" from the empty Open inbox — flips scope to "all" while
  // leaving the (already-default) sub-filters alone.
  function showAllLeads() {
    setSuccessMessage("");
    setFilters((f) => ({ ...f, scope: "all" }));
  }

  const showList = !isMobile || !selectedLead;
  const showDetail = !isMobile || !!selectedLead;

  // Sticky list on desktop so it remains visible while the detail scrolls.
  // No fixed two-pane height — the page itself scrolls naturally, which
  // avoids brittle vh math that produced layout overflow on some viewports.
  const listPaneStyle: CSSProperties = isMobile
    ? {
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
      }
    : {
        flex: isNarrowDesktop ? "0 0 320px" : "0 0 360px",
        width: isNarrowDesktop ? "320px" : "360px",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        position: "sticky",
        top: "16px",
        alignSelf: "flex-start",
        maxHeight: "calc(100vh - 180px)",
        overflowY: "auto",
        overflowX: "hidden",
        paddingRight: "4px",
      };

  const detailPaneStyle: CSSProperties = isMobile
    ? {
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
      }
    : {
        flex: 1,
        minWidth: 0,
        maxWidth: "100%",
        boxSizing: "border-box",
        overflowX: "hidden",
      };

  const twoPaneStyle: CSSProperties = isMobile
    ? {
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
      }
    : {
        display: "flex",
        gap: "20px",
        alignItems: "flex-start",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
      };

  return (
    <div style={PAGE_WRAPPER_STYLE}>
      <header style={{ minWidth: 0 }}>
        <h1 style={H1_STYLE}>WhatsApp leads</h1>
        <p style={SUBTITLE_STYLE}>WhatsApp leads — not bookings.</p>
      </header>

      <LeadKpis
        counts={counts}
        activeKey={activeKpiKey}
        onSelect={applyKpiShortcut}
        compact={isMobile}
      />

      <div style={FILTERS_WRAPPER}>
        <LeadFilters
          filters={filters}
          onChange={setFilters}
          villaOptions={villaOptions}
          totalLoaded={leads.length}
          totalShown={filtered.length}
          countText={countText}
        />
      </div>

      {error ? (
        <div style={ERROR_BANNER} role="alert">
          <span>Error: {error}</span>
          <button type="button" onClick={() => void load()} style={RETRY_BUTTON}>
            Retry
          </button>
        </div>
      ) : null}

      {successMessage ? (
        <div style={SUCCESS_BANNER} role="status">
          {successMessage}
        </div>
      ) : null}

      <div style={twoPaneStyle}>
        {showList ? (
          <div style={listPaneStyle}>
            <LeadList
              leads={filtered}
              selectedLeadId={selectedLeadId}
              onSelect={setSelectedLeadId}
              loading={loading}
              totalLoaded={leads.length}
              hasFiltersActive={hasFiltersActive}
              onClearFilters={clearAllFilters}
              isOpenInbox={isOpenInbox}
              onShowAllLeads={showAllLeads}
              deletingId={deletingId}
              deleteError={deleteError}
              deleteErrorId={deleteErrorId}
              onDeleteLead={(id) => void deleteLead(id)}
            />
          </div>
        ) : null}

        {showDetail ? (
          <div style={detailPaneStyle}>
            <div
              style={{
                width: "100%",
                maxWidth: `${DETAIL_CONTENT_MAX_WIDTH}px`,
                minWidth: 0,
                boxSizing: "border-box",
              }}
            >
              <LeadDetail
                lead={selectedLead}
                saving={!!selectedLead && savingId === selectedLead.id}
                deleting={!!selectedLead && deletingId === selectedLead.id}
                deleteError={
                  selectedLead && deleteErrorId === selectedLead.id
                    ? deleteError
                    : null
                }
                onStatusChange={handleStatusChange}
                onSaveNote={handleSaveNote}
                onDeleteLead={(id) => void deleteLead(id)}
                onPrepareBookingRequest={(lead) => {
                  setSuccessMessage("");
                  setConversionLead(lead);
                }}
                onBack={isMobile ? () => setSelectedLeadId(null) : undefined}
                hiddenByFilter={hiddenByFilter}
              />
            </div>
          </div>
        ) : null}
      </div>

      {conversionLead ? (
        <LeadConversionModal
          lead={conversionLead}
          onClose={() => setConversionLead(null)}
          onConverted={handleLeadConverted}
        />
      ) : null}
    </div>
  );
}
