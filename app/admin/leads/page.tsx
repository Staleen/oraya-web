"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { BORDER, GOLD, LATO, MUTED, PLAYFAIR, SURFACE, WHITE } from "@/components/admin/theme";
import { adminApiFetchInit } from "@/lib/admin-auth";
import type { FollowUpStatus, WhatsappLeadAdminRow } from "@/lib/butler/leads";
import LeadKpis, { type KpiKey } from "@/components/admin/leads/LeadKpis";
import LeadFilters from "@/components/admin/leads/LeadFilters";
import LeadList from "@/components/admin/leads/LeadList";
import LeadDetail from "@/components/admin/leads/LeadDetail";
import {
  INITIAL_FILTER_STATE,
  applyClientFilters,
  computeKpiCounts,
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
    // Each KPI maps to ONE filter slot. Clicking the active KPI clears that slot.
    const isActive = activeKpiKey === key;
    if (key === "new") {
      setFilters((f) => ({ ...f, status: isActive ? "all" : "new" }));
      return;
    }
    if (key === "needsAction") {
      setFilters((f) => ({ ...f, status: isActive ? "all" : "needs_action" }));
      return;
    }
    if (key === "converted") {
      setFilters((f) => ({ ...f, status: isActive ? "all" : "converted" }));
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

  const hasFiltersActive = useMemo(() => {
    return (
      filters.status !== "all" ||
      filters.type !== "all" ||
      filters.priority !== "all" ||
      filters.villa !== "all" ||
      filters.search.trim() !== ""
    );
  }, [filters]);

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

  function handleStatusChange(id: string, next: FollowUpStatus) {
    void patchLead(id, { follow_up_status: next });
  }

  function handleSaveNote(id: string, next: string | null) {
    void patchLead(id, { admin_notes: next });
  }

  function clearAllFilters() {
    setFilters(INITIAL_FILTER_STATE);
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
                onStatusChange={handleStatusChange}
                onSaveNote={handleSaveNote}
                onBack={isMobile ? () => setSelectedLeadId(null) : undefined}
                hiddenByFilter={hiddenByFilter}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
