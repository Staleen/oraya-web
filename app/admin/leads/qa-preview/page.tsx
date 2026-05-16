"use client";

// TEMPORARY QA-ONLY PAGE — used by the Phase 16A.2.h Cloud Agent run to
// visually verify LeadCard quick-delete states without real Supabase data.
// This file is deleted before the final commit and is NOT part of the
// production surface. If you are reading this in master, that is a bug —
// please remove it.

import { useState } from "react";
import LeadList from "@/components/admin/leads/LeadList";
import type { WhatsappLeadAdminRow } from "@/lib/butler/leads";

const MIDNIGHT = "#1F2B38";

function mockLead(overrides: Partial<WhatsappLeadAdminRow>): WhatsappLeadAdminRow {
  return {
    id: overrides.id ?? "11111111-1111-1111-1111-111111111111",
    created_at: overrides.created_at ?? new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    updated_at: overrides.updated_at ?? new Date().toISOString(),
    source: "qa_fixture",
    phone: "+96170000000",
    name: "Test Lead",
    request_type: "stay",
    villa: "Villa Byblos",
    check_in_text: "Jun 14, 2026",
    check_out_text: "Jun 17, 2026",
    normalized_check_in: "2026-06-14",
    normalized_check_out: "2026-06-17",
    guest_count: "4",
    addons_interest: null,
    special_requests: null,
    follow_up_status: "new",
    labels: [],
    linked_booking_id: null,
    admin_notes: null,
    ...overrides,
  };
}

export default function LeadCardQAPreview() {
  const [leads, setLeads] = useState<WhatsappLeadAdminRow[]>([
    mockLead({ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", name: "Plain Stay Lead", follow_up_status: "new" }),
    mockLead({
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      name: "Linked Booking Lead",
      follow_up_status: "converted",
      linked_booking_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      villa: "Villa Mechmech",
    }),
    mockLead({
      id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      name: "Failing Delete Lead",
      follow_up_status: "needs_action",
      labels: ["oraya_needs_human"],
    }),
    mockLead({
      id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
      name: "Spam Lead",
      follow_up_status: "spam",
    }),
  ]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteErrorId, setDeleteErrorId] = useState<string | null>(null);
  const [eventLog, setEventLog] = useState<string[]>([]);

  function log(msg: string) {
    setEventLog((prev) => [`${new Date().toISOString().slice(11, 19)}  ${msg}`, ...prev].slice(0, 20));
  }

  function onSelect(id: string) {
    log(`SELECT  ${id}`);
    setSelectedLeadId(id);
  }

  async function onDeleteLead(id: string) {
    log(`DELETE  ${id}`);
    setDeletingId(id);
    setDeleteError(null);
    setDeleteErrorId(null);
    await new Promise((r) => setTimeout(r, 600));
    // Lead dddd...dddd intentionally fails to surface the inline error.
    if (id === "dddddddd-dddd-dddd-dddd-dddddddddddd") {
      setDeleteError("server_error");
      setDeleteErrorId(id);
      setDeletingId(null);
      log(`FAIL    ${id} (mock)`);
      return;
    }
    setLeads((prev) => prev.filter((l) => l.id !== id));
    if (selectedLeadId === id) setSelectedLeadId(null);
    setDeletingId(null);
    log(`OK      ${id}`);
  }

  return (
    <div style={{ backgroundColor: MIDNIGHT, minHeight: "100vh", padding: "16px", color: "#fff", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 18, marginBottom: 12 }}>LeadCard QA preview (mock data)</h1>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <div style={{ width: 360 }}>
          <LeadList
            leads={leads}
            selectedLeadId={selectedLeadId}
            onSelect={onSelect}
            loading={false}
            totalLoaded={leads.length}
            hasFiltersActive={false}
            onClearFilters={() => {}}
            isOpenInbox={false}
            onShowAllLeads={() => {}}
            deletingId={deletingId}
            deleteError={deleteError}
            deleteErrorId={deleteErrorId}
            onDeleteLead={onDeleteLead}
          />
        </div>
        <pre style={{ fontSize: 11, color: "#9c9", whiteSpace: "pre-wrap", maxWidth: 480 }} data-testid="qa-event-log">
{eventLog.length === 0 ? "(no events yet)" : eventLog.join("\n")}
        </pre>
      </div>
    </div>
  );
}
