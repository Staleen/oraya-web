// Phase 16A.2.f — pure helpers for the WhatsApp leads operator console.
// Framework-free (no React, no Next, no Supabase) so each consumer is easy
// to reason about and test. Reused by every component under
// `components/admin/leads/` and by `app/admin/leads/page.tsx`.

import type { FollowUpStatus, WhatsappLeadAdminRow } from "@/lib/butler/leads";

// Priority labels are emitted by the AI Butler / WhatChimp side. The exact
// strings are documented in the 16A.2.f task prompt; keep these in lock-step
// with the WhatChimp custom-field map.
export const PRIORITY_LABELS = {
  VIP: "oraya_vip_lead",
  NEEDS_HUMAN: "oraya_needs_human",
  EVENT: "oraya_lead_event",
  PENDING_FOLLOWUP: "oraya_pending_followup",
} as const;

function hasLabelCi(labels: string[] | null | undefined, target: string): boolean {
  if (!Array.isArray(labels)) return false;
  const needle = target.toLowerCase();
  return labels.some((l) => typeof l === "string" && l.trim().toLowerCase() === needle);
}

export function isVip(lead: WhatsappLeadAdminRow): boolean {
  return hasLabelCi(lead.labels, PRIORITY_LABELS.VIP);
}

export function needsHuman(lead: WhatsappLeadAdminRow): boolean {
  return hasLabelCi(lead.labels, PRIORITY_LABELS.NEEDS_HUMAN);
}

export function isPendingFollowup(lead: WhatsappLeadAdminRow): boolean {
  return hasLabelCi(lead.labels, PRIORITY_LABELS.PENDING_FOLLOWUP);
}

export function isEventLead(lead: WhatsappLeadAdminRow): boolean {
  if (hasLabelCi(lead.labels, PRIORITY_LABELS.EVENT)) return true;
  const rt = (lead.request_type ?? "").trim().toLowerCase();
  return rt === "event" || rt === "events";
}

export function isStayLead(lead: WhatsappLeadAdminRow): boolean {
  if (isEventLead(lead)) return false;
  const rt = (lead.request_type ?? "").trim().toLowerCase();
  return rt === "stay" || rt === "stays";
}

export function isVipOrNeedsHuman(lead: WhatsappLeadAdminRow): boolean {
  return isVip(lead) || needsHuman(lead);
}

export interface PriorityFlags {
  vip: boolean;
  needsHuman: boolean;
  event: boolean;
  pendingFollowup: boolean;
}

export function priorityFlagsFor(lead: WhatsappLeadAdminRow): PriorityFlags {
  return {
    vip: isVip(lead),
    needsHuman: needsHuman(lead),
    event: isEventLead(lead),
    pendingFollowup: isPendingFollowup(lead),
  };
}

export interface LeadKpiCounts {
  new: number;
  needsAction: number;
  events: number;
  vipOrNeedsHuman: number;
  converted: number;
}

export function computeKpiCounts(leads: WhatsappLeadAdminRow[]): LeadKpiCounts {
  let n = 0;
  let na = 0;
  let ev = 0;
  let vp = 0;
  let cv = 0;
  for (const l of leads) {
    if (l.follow_up_status === "new") n++;
    if (l.follow_up_status === "needs_action") na++;
    if (isEventLead(l)) ev++;
    if (isVipOrNeedsHuman(l)) vp++;
    if (l.follow_up_status === "converted") cv++;
  }
  return { new: n, needsAction: na, events: ev, vipOrNeedsHuman: vp, converted: cv };
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "just now";
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  return formatDateTime(iso);
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mi}`;
}

// `YYYY-MM-DD` only — never goes through JS Date parsing.
export function computeNights(checkIn: string | null, checkOut: string | null): number | null {
  if (!checkIn || !checkOut) return null;
  const a = checkIn.split("-").map(Number);
  const b = checkOut.split("-").map(Number);
  if (a.length !== 3 || b.length !== 3) return null;
  if (a.some((n) => !Number.isFinite(n)) || b.some((n) => !Number.isFinite(n))) return null;
  const ms1 = Date.UTC(a[0], a[1] - 1, a[2]);
  const ms2 = Date.UTC(b[0], b[1] - 1, b[2]);
  if (!Number.isFinite(ms1) || !Number.isFinite(ms2)) return null;
  const nights = Math.round((ms2 - ms1) / 86_400_000);
  if (nights < 0) return null;
  return nights;
}

export function digitsOnly(value: string | null): string {
  if (!value) return "";
  return value.replace(/[^\d]/g, "");
}

export function whatsappHref(phone: string | null): string | null {
  const digits = digitsOnly(phone);
  return digits ? `https://wa.me/${digits}` : null;
}

export function initialFor(name: string | null, phone: string | null): string {
  if (name) {
    const trimmed = name.trim();
    if (trimmed) return trimmed.charAt(0).toUpperCase();
  }
  const digits = digitsOnly(phone);
  if (digits) return digits.charAt(digits.length - 1);
  return "?";
}

export function displayName(lead: WhatsappLeadAdminRow): string {
  const n = lead.name?.trim();
  if (n) return n;
  const p = lead.phone?.trim();
  if (p) return p;
  return "Unknown guest";
}

export function requestKind(lead: WhatsappLeadAdminRow): "stay" | "event" | "other" {
  if (isEventLead(lead)) return "event";
  if (isStayLead(lead)) return "stay";
  return "other";
}

export function nonEmpty(value: string | null | undefined): string {
  if (typeof value !== "string") return "—";
  const t = value.trim();
  return t === "" ? "—" : t;
}

// Deterministic narrative from structured fields — NO AI generation.
export function buildGuestSummary(lead: WhatsappLeadAdminRow): string {
  const who = lead.name?.trim() || "An anonymous guest";
  const kind = requestKind(lead);
  let intent: string;
  if (kind === "stay") intent = "is asking about a stay";
  else if (kind === "event") intent = "is asking about an event";
  else if (lead.request_type?.trim()) intent = `is asking about ${lead.request_type.trim()}`;
  else intent = "reached out";

  const parts: string[] = [`${who} ${intent}`];
  if (lead.villa?.trim()) parts.push(`at ${lead.villa.trim()}`);

  const ci = lead.check_in_text?.trim() ?? "";
  const co = lead.check_out_text?.trim() ?? "";
  if (ci && co) parts.push(`for ${ci} → ${co}`);
  else if (ci) parts.push(`from ${ci}`);
  else if (co) parts.push(`until ${co}`);

  if (lead.guest_count?.trim()) parts.push(`for ${lead.guest_count.trim()} guests`);

  let main = `${parts.join(" ")}.`;
  const extras: string[] = [];
  if (lead.addons_interest?.trim()) extras.push(`Interested in: ${lead.addons_interest.trim()}`);
  if (lead.special_requests?.trim()) extras.push(`Special requests: ${lead.special_requests.trim()}`);
  if (extras.length > 0) main += ` ${extras.join(" ")}`;
  return main;
}

export interface LeadFilterState {
  status: FollowUpStatus | "all";
  type: "all" | "stay" | "event";
  priority: "all" | "vip_or_human";
  villa: "all" | string;
  search: string;
}

export const INITIAL_FILTER_STATE: LeadFilterState = {
  status: "all",
  type: "all",
  priority: "all",
  villa: "all",
  search: "",
};

export function applyClientFilters(
  leads: WhatsappLeadAdminRow[],
  filters: LeadFilterState,
): WhatsappLeadAdminRow[] {
  let out = leads;
  if (filters.status !== "all") {
    out = out.filter((l) => l.follow_up_status === filters.status);
  }
  if (filters.type === "stay") out = out.filter(isStayLead);
  if (filters.type === "event") out = out.filter(isEventLead);
  if (filters.priority === "vip_or_human") out = out.filter(isVipOrNeedsHuman);
  if (filters.villa !== "all") {
    const v = filters.villa.toLowerCase();
    out = out.filter((l) => (l.villa ?? "").trim().toLowerCase() === v);
  }
  const q = filters.search.trim().toLowerCase();
  if (q) {
    out = out.filter((l) => {
      const haystack: Array<string | null> = [
        l.name,
        l.phone,
        l.villa,
        l.request_type,
        ...(Array.isArray(l.labels) ? l.labels : []),
      ];
      return haystack.some(
        (h) => typeof h === "string" && h.toLowerCase().includes(q),
      );
    });
  }
  return out;
}

export function uniqueVillas(leads: WhatsappLeadAdminRow[]): string[] {
  const set = new Set<string>();
  for (const l of leads) {
    const v = l.villa?.trim();
    if (v) set.add(v);
  }
  return Array.from(set).sort();
}

export const STATUS_LABEL: Record<FollowUpStatus, string> = {
  new: "New",
  contacted: "Contacted",
  needs_action: "Needs action",
  converted: "Converted",
  lost: "Lost",
  spam: "Spam",
};

export const STATUS_COLOR: Record<FollowUpStatus, string> = {
  new: "#7fb3e0",
  contacted: "#c9b27f",
  needs_action: "#e07070",
  converted: "#7fc99a",
  lost: "#8a8a8a",
  spam: "#5a5a5a",
};
