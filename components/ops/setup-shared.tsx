"use client";
import { useCallback, useEffect, useState } from "react";
import type { VillaBasePricing } from "@/lib/admin-pricing";
import type { AddonOperationalFields } from "@/lib/addon-operations";
import type { PaymentPublicSettings } from "@/lib/payments/settings";
import { Banner, Button, EmptyState, T } from "@/components/ops/ui";

/**
 * Shared plumbing for the owner-only Setup screens (Pricing, Extras,
 * Payments): one load of GET /api/ops/setup, an explicit owner-refused state
 * (the API enforces the role; the screen just says so honestly), and the
 * prototype's pending-changes bar — edits accumulate into named, human
 * sentences and nothing is saved until "Save".
 */

export interface SetupAddon {
  id: string;
  label: string;
  enabled: boolean;
  currency: string;
  price: number | null;
  pricing_model: "flat_fee" | "per_night" | "per_person_per_day" | "per_unit";
  operational: AddonOperationalFields;
}

export interface SiteSettings {
  whatsapp_number: string;
  notification_emails: string;
  butler_checkin_guidance: string;
  instant_mechmech: boolean;
  instant_byblos: boolean;
  /** Master switch: a fully paid, add-on-free instant stay confirms itself. */
  instant_auto_confirm: boolean;
}

export interface SetupData {
  pricing: VillaBasePricing[];
  pricing_raw: string | null;
  addons: SetupAddon[];
  payment_settings: PaymentPublicSettings;
  payment_settings_raw: string | null;
  site: SiteSettings;
  readiness: {
    provider_display_name: string | null;
    configured: boolean;
    implemented: boolean;
    checkout_ready: boolean;
    environment: string | null;
    admin_message: string | null;
    missing_requirements: string[];
  };
  payments_live: boolean | null;
}

export function useSetupData() {
  const [data, setData] = useState<SetupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [ownerOnly, setOwnerOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const r = await fetch("/api/ops/setup", { credentials: "include", cache: "no-store" });
      const body = (await r.json().catch(() => ({}))) as SetupData & { ok?: boolean; error?: string; code?: string };
      if (r.status === 403) {
        setOwnerOnly(true);
        return;
      }
      if (!r.ok || !body.ok) {
        setLoadError(body.error ?? "Could not load the setup data.");
        return;
      }
      setData(body);
    } catch {
      setLoadError("Couldn't reach Oraya.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { data, loading, loadError, ownerOnly, reload: load };
}

/** The honest states every setup screen shares. Returns null when data is ready. */
export function SetupGate({ loading, loadError, ownerOnly, onRetry }: {
  loading: boolean; loadError: string; ownerOnly: boolean; onRetry: () => void;
}) {
  if (ownerOnly) {
    return (
      <EmptyState
        reason="clear"
        message="This screen changes what guests are charged, so it belongs to the owner account."
      />
    );
  }
  if (loadError) {
    return (
      <EmptyState
        reason="load-failed"
        message="We couldn't load this, so nothing here is to be trusted."
        onRetry={onRetry}
      />
    );
  }
  if (loading) {
    return <p style={{ color: T.faint, fontSize: "13px" }}>Loading…</p>;
  }
  return null;
}

export function LiveBanner({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap",
      background: T.okBg, border: `1px solid ${T.okBr}`, borderRadius: T.r,
      padding: "13px 16px", marginBottom: "22px", fontSize: "13px",
    }}>
      <span style={{ width: "8px", height: "8px", borderRadius: "999px", background: T.ok, flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: "min(100%,260px)", lineHeight: 1.6 }}>{children}</span>
      {right && <span style={{ color: T.muted, fontSize: "12px" }}>{right}</span>}
    </div>
  );
}

/**
 * The prototype's signature: every unsaved edit is a named sentence, and the
 * bar owns Discard / Save. Reading "Villa Byblos weekend night: $700 → $750"
 * is a better check than "are you sure?".
 */
export function PendingBar({ changes, busy, error, onDiscard, onSave, onDismissError }: {
  changes: string[];
  busy: boolean;
  error: string;
  onDiscard: () => void;
  onSave: () => void;
  onDismissError: () => void;
}) {
  if (changes.length === 0 && !error) return null;
  return (
    <div style={{ position: "sticky", bottom: "14px", marginTop: "22px", zIndex: 40 }}>
      {error && <Banner tone="bad" title="Not saved" onDismiss={onDismissError}>{error}</Banner>}
      {changes.length > 0 && (
        <div style={{
          background: T.navyLift, border: `1px solid ${T.border}`, borderRadius: T.rLg,
          padding: "16px 20px", boxShadow: "0 12px 40px rgba(0,0,0,.45)",
          display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap",
        }}>
          <div style={{ flex: 1, minWidth: "min(100%,260px)" }}>
            <p style={{ margin: "0 0 6px", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.warn }}>
              {changes.length} change{changes.length === 1 ? "" : "s"}, not saved yet
            </p>
            <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: T.ink2, lineHeight: 1.7 }}>
              {changes.slice(0, 6).map((c) => <li key={c}>{c}</li>)}
              {changes.length > 6 && <li>…and {changes.length - 6} more</li>}
            </ul>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <Button onClick={onDiscard} disabled={busy}>Discard</Button>
            <Button variant="primary" disabled={busy} onClick={onSave}>
              {busy ? "Saving…" : `Save ${changes.length} change${changes.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Uppercase field caption + dark input, matching the prototype tables. */
export function CellInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.05)",
        border: `1px solid ${T.borderStrong}`, borderRadius: T.rSm, padding: "10px 12px",
        color: T.ink, fontSize: "14px", fontFamily: T.sans, outline: "none",
        opacity: props.disabled ? 0.5 : 1,
        ...props.style,
      }}
    />
  );
}

export function CellSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      style={{
        width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.05)",
        border: `1px solid ${T.borderStrong}`, borderRadius: T.rSm, padding: "10px 12px",
        color: T.ink, fontSize: "14px", fontFamily: T.sans, outline: "none",
        opacity: props.disabled ? 0.5 : 1,
        ...props.style,
      }}
    />
  );
}

export function ColHead({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: T.gold }}>
      {children}
    </span>
  );
}

/** Numeric input helper: "" ↔ null, digits ↔ number. */
export function numFromInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function numToInput(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}
