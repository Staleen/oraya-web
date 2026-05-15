"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BORDER,
  GOLD,
  LATO,
  MUTED,
  PLAYFAIR,
  SURFACE,
  WHITE,
  fmt,
  fieldStyle,
  tdStyle,
  thStyle,
} from "@/components/admin/theme";
import { adminApiFetchInit } from "@/lib/admin-auth";
import { FOLLOW_UP_STATUSES, type FollowUpStatus, type WhatsappLeadAdminRow } from "@/lib/butler/leads";

/**
 * Phase 16A.2.e — admin dashboard for WhatsApp / WhatChimp leads.
 *
 * Read-only by default; status + admin_notes can be updated inline. No
 * booking creation, no availability check, no payment, no token issuance,
 * no access-detail surface.
 */

type StatusFilter = FollowUpStatus | "all";

const STATUS_LABEL: Record<FollowUpStatus, string> = {
  new: "New",
  contacted: "Contacted",
  needs_action: "Needs action",
  converted: "Converted",
  lost: "Lost",
  spam: "Spam",
};

const STATUS_COLOR: Record<FollowUpStatus, string> = {
  new:          "#7fb3e0",
  contacted:    "#c9b27f",
  needs_action: "#e07070",
  converted:    "#7fc99a",
  lost:         "#8a8a8a",
  spam:         "#5a5a5a",
};

function statusBadgeStyle(status: FollowUpStatus): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: "999px",
    fontFamily: LATO,
    fontSize: "10px",
    letterSpacing: "1.5px",
    textTransform: "uppercase",
    color: WHITE,
    backgroundColor: STATUS_COLOR[status],
    whiteSpace: "nowrap",
  };
}

function digitsOnly(value: string | null): string {
  if (!value) return "";
  return value.replace(/[^\d]/g, "");
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function nonEmpty(v: string | null | undefined): string {
  if (typeof v !== "string") return "—";
  const t = v.trim();
  return t === "" ? "—" : t;
}

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<WhatsappLeadAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  const load = useCallback(async (filter: StatusFilter) => {
    setLoading(true);
    setError("");
    try {
      const qs = filter === "all" ? "" : `?follow_up_status=${encodeURIComponent(filter)}`;
      const res = await fetch(`/api/admin/leads${qs}`, adminApiFetchInit);
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
    load(statusFilter);
  }, [load, statusFilter]);

  async function updateLead(id: string, patch: Record<string, unknown>) {
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

  function onStatusChange(id: string, next: FollowUpStatus) {
    void updateLead(id, { follow_up_status: next });
  }

  function onSaveNote(id: string) {
    const draft = noteDraft[id] ?? "";
    void updateLead(id, { admin_notes: draft.trim() === "" ? null : draft });
  }

  const filterOptions = useMemo<Array<{ value: StatusFilter; label: string }>>(
    () => [
      { value: "all", label: "All" },
      ...FOLLOW_UP_STATUSES.map((s) => ({ value: s as StatusFilter, label: STATUS_LABEL[s] })),
    ],
    [],
  );

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        <h1 style={{ fontFamily: PLAYFAIR, fontSize: "24px", color: WHITE, margin: 0 }}>
          WhatsApp leads
        </h1>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {filterOptions.map((opt) => {
            const active = opt.value === statusFilter;
            return (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                style={{
                  fontFamily: LATO,
                  fontSize: "10px",
                  letterSpacing: "2px",
                  textTransform: "uppercase",
                  color: active ? GOLD : MUTED,
                  backgroundColor: active ? "rgba(197,164,109,0.08)" : "transparent",
                  border: `0.5px solid ${active ? GOLD : BORDER}`,
                  padding: "6px 12px",
                  cursor: "pointer",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", marginBottom: "1.25rem" }}>
          Error: {error}
        </p>
      )}

      {loading ? (
        <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED }}>Loading leads…</p>
      ) : leads.length === 0 ? (
        <div style={{ padding: "2rem", border: `0.5px solid ${BORDER}`, backgroundColor: SURFACE, textAlign: "center" }}>
          <p style={{ fontFamily: PLAYFAIR, fontSize: "18px", color: WHITE, margin: "0 0 0.5rem" }}>
            No leads yet
          </p>
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, margin: 0 }}>
            WhatsApp leads collected by the AI Butler will appear here.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: `0.5px solid ${BORDER}`, backgroundColor: SURFACE }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1100px" }}>
            <thead>
              <tr>
                <th style={thStyle}>Received</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Request</th>
                <th style={thStyle}>Villa</th>
                <th style={thStyle}>Dates</th>
                <th style={thStyle}>Guests</th>
                <th style={thStyle}>Add-ons interest</th>
                <th style={thStyle}>Special requests</th>
                <th style={thStyle}>Labels</th>
                <th style={thStyle}>Linked booking</th>
                <th style={thStyle}>Admin notes</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const phoneDigits = digitsOnly(lead.phone);
                const waHref = phoneDigits ? `https://wa.me/${phoneDigits}` : null;
                const currentNote = noteDraft[lead.id] ?? lead.admin_notes ?? "";
                const isSaving = savingId === lead.id;
                return (
                  <tr key={lead.id}>
                    <td style={tdStyle}>
                      <span style={{ fontFamily: LATO, fontSize: "12px", color: WHITE }}>
                        {formatDateTime(lead.created_at)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <span style={statusBadgeStyle(lead.follow_up_status)}>
                          {STATUS_LABEL[lead.follow_up_status]}
                        </span>
                        <select
                          aria-label="Update follow-up status"
                          disabled={isSaving}
                          value={lead.follow_up_status}
                          onChange={(e) => onStatusChange(lead.id, e.target.value as FollowUpStatus)}
                          style={{
                            ...fieldStyle,
                            padding: "6px 8px",
                            fontSize: "11px",
                            width: "auto",
                          }}
                        >
                          {FOLLOW_UP_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>
                    <td style={tdStyle}>{nonEmpty(lead.name)}</td>
                    <td style={tdStyle}>
                      {waHref ? (
                        <a
                          href={waHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: GOLD, textDecoration: "none", fontFamily: LATO, fontSize: "12px" }}
                        >
                          {lead.phone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={tdStyle}>{nonEmpty(lead.request_type)}</td>
                    <td style={tdStyle}>{nonEmpty(lead.villa)}</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <span style={{ fontFamily: LATO, fontSize: "12px", color: WHITE }}>
                          {nonEmpty(lead.check_in_text)} → {nonEmpty(lead.check_out_text)}
                        </span>
                        {(lead.normalized_check_in || lead.normalized_check_out) && (
                          <span style={{ fontFamily: LATO, fontSize: "10px", color: MUTED }}>
                            {lead.normalized_check_in ? fmt(lead.normalized_check_in) : "—"}
                            {" → "}
                            {lead.normalized_check_out ? fmt(lead.normalized_check_out) : "—"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={tdStyle}>{nonEmpty(lead.guest_count)}</td>
                    <td style={{ ...tdStyle, maxWidth: "200px", whiteSpace: "pre-wrap" }}>
                      {nonEmpty(lead.addons_interest)}
                    </td>
                    <td style={{ ...tdStyle, maxWidth: "240px", whiteSpace: "pre-wrap" }}>
                      {nonEmpty(lead.special_requests)}
                    </td>
                    <td style={tdStyle}>
                      {lead.labels.length === 0 ? (
                        "—"
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                          {lead.labels.map((label) => (
                            <span
                              key={label}
                              style={{
                                fontFamily: LATO,
                                fontSize: "10px",
                                color: MUTED,
                                border: `0.5px solid ${BORDER}`,
                                padding: "2px 6px",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, wordBreak: "break-all" }}>
                        {lead.linked_booking_id ?? "—"}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "200px" }}>
                        <textarea
                          aria-label="Admin notes"
                          value={currentNote}
                          disabled={isSaving}
                          onChange={(e) =>
                            setNoteDraft((prev) => ({ ...prev, [lead.id]: e.target.value }))
                          }
                          rows={2}
                          style={{ ...fieldStyle, padding: "8px", fontSize: "12px", resize: "vertical" }}
                        />
                        <button
                          onClick={() => onSaveNote(lead.id)}
                          disabled={isSaving || (noteDraft[lead.id] ?? lead.admin_notes ?? "") === (lead.admin_notes ?? "")}
                          style={{
                            fontFamily: LATO,
                            fontSize: "10px",
                            letterSpacing: "2px",
                            textTransform: "uppercase",
                            color: GOLD,
                            backgroundColor: "transparent",
                            border: `0.5px solid ${GOLD}`,
                            padding: "6px 10px",
                            cursor: "pointer",
                            opacity: isSaving ? 0.5 : 1,
                            alignSelf: "flex-start",
                          }}
                        >
                          {isSaving ? "Saving…" : "Save note"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
