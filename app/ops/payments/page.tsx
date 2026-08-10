"use client";
import { useMemo, useState } from "react";
import {
  GUEST_MANUAL_PAYMENT_RAILS,
  PAYMENT_MODE_VALUES,
  getManualRailLabel,
  type GuestManualPaymentRail,
  type PaymentMode,
  type PaymentPublicSettings,
} from "@/lib/payments/settings";
import { Badge, Banner, Button, Card, PageHead, Row, Rows, T } from "@/components/ops/ui";
import {
  CellInput, CellSelect, LiveBanner, PendingBar, SetupGate, useSetupData,
} from "@/components/ops/setup-shared";
import PaymentWorkspace from "@/components/ops/PaymentWorkspace";
import LivePaymentsSwitch from "@/components/ops/LivePaymentsSwitch";

/**
 * Owner view of how guests pay — prototype faithful: card-payment status up
 * top, readiness on the left, manual rails on the right, pending-changes bar.
 *
 * The fail-closed LIVE switch is shown, never flipped here: its only writer
 * is the dedicated password-confirmed endpoint behind the legacy admin
 * Settings (DECISIONS_LOG 2026-07-25). One writer, one ritual.
 */

const MODE_LABELS: Record<PaymentMode, string> = {
  request_only: "Booking requests only — no payment asked on the website",
  manual_payment: "Manual payment — guests get your payment instructions",
  online_payment: "Online payment — hosted card checkout when ready",
  hybrid: "Hybrid — card checkout plus the manual ways to pay",
};

function describeChanges(before: PaymentPublicSettings, after: PaymentPublicSettings): string[] {
  const out: string[] = [];
  if (before.active_payment_mode !== after.active_payment_mode) {
    out.push(`Payment mode: ${MODE_LABELS[after.active_payment_mode].split(" — ")[0]}`);
  }
  if (before.deposit_minimum_percentage !== after.deposit_minimum_percentage) {
    out.push(`Minimum deposit: ${before.deposit_minimum_percentage}% → ${after.deposit_minimum_percentage}%`);
  }
  if (before.allow_full_payment !== after.allow_full_payment) {
    out.push(after.allow_full_payment ? "Guests may pay in full" : "Full payment option removed");
  }
  if (before.allow_custom_deposit !== after.allow_custom_deposit) {
    out.push(after.allow_custom_deposit ? "Guests may choose a custom deposit" : "Custom deposit option removed");
  }
  const beforeRails = new Set(before.manual_payment_rails);
  const afterRails = new Set(after.manual_payment_rails);
  for (const rail of afterRails) if (!beforeRails.has(rail)) out.push(`${getManualRailLabel(rail)} switched on`);
  for (const rail of beforeRails) if (!afterRails.has(rail)) out.push(`${getManualRailLabel(rail)} switched off — guests will no longer be offered it`);
  if (before.payment_instructions !== after.payment_instructions) out.push("Guest payment instructions updated");
  if (before.bank_transfer_public_details !== after.bank_transfer_public_details) out.push("Bank transfer details updated");
  if (before.provider_display_name !== after.provider_display_name) out.push(`Card provider shown as “${after.provider_display_name}”`);
  if (before.online_payment_enabled !== after.online_payment_enabled) {
    out.push(after.online_payment_enabled
      ? "Card payment will be OFFERED to guests (when the gateway is ready)"
      : "Card payment will not be offered to guests");
  }
  return out;
}

type PaymentsView = "collect" | "settings";

export default function PaymentsPage() {
  const { data, loading, loadError, ownerOnly, reload } = useSetupData();
  const [view, setView] = useState<PaymentsView>("collect");
  const [draft, setDraft] = useState<PaymentPublicSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [flash, setFlash] = useState("");

  const original = data?.payment_settings ?? null;
  const working = draft ?? original;

  const changes = useMemo(
    () => (original && draft ? describeChanges(original, draft) : []),
    [original, draft],
  );

  function update(patch: Partial<PaymentPublicSettings>) {
    setFlash("");
    setDraft((current) => ({ ...(current ?? original!), ...patch }));
  }

  function toggleRail(rail: GuestManualPaymentRail) {
    const base = draft ?? original;
    if (!base) return;
    const has = base.manual_payment_rails.includes(rail);
    update({
      manual_payment_rails: has
        ? base.manual_payment_rails.filter((r) => r !== rail)
        : [...base.manual_payment_rails, rail],
    });
  }

  async function save() {
    if (!draft || !data) return;
    setBusy(true);
    setSaveError("");
    try {
      const r = await fetch("/api/ops/setup/payments", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: draft, expected_raw: data.payment_settings_raw }),
      });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string };
      if (!r.ok || !body.ok) {
        setSaveError(body.error ?? "That didn't save.");
        if (body.code === "changed_elsewhere") await reload();
        return;
      }
      setDraft(null);
      await reload();
      setFlash("Saved — guests see this payment behavior from now on.");
    } catch {
      setSaveError("Couldn't reach Oraya. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  const gate = SetupGate({ loading: loading && !data, loadError: data ? "" : loadError, ownerOnly, onRetry: reload });
  const readiness = data?.readiness;
  const live = data?.payments_live;

  return (
    <>
      <PageHead
        title="Payments"
        sub={view === "collect" ? "Collect and track money" : "How guests pay on the website"}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        <Button
          small
          variant={view === "collect" ? "primary" : "secondary"}
          onClick={() => setView("collect")}
        >
          Collect money
        </Button>
        <Button
          small
          variant={view === "settings" ? "primary" : "secondary"}
          onClick={() => setView("settings")}
        >
          Website settings
        </Button>
      </div>

      {view === "collect" && <PaymentWorkspace />}

      {view === "settings" && flash && (
        <Banner tone="ok" title="Live" onDismiss={() => setFlash("")}>{flash}</Banner>
      )}

      {view === "settings" && (gate ?? (working && data && (
        <>
          {/* The switch itself, not a description of where the switch lives.
              /admin keeps its own copy while it is dormant — both write the
              same settings row, so the row stays the single source of truth. */}
          <LivePaymentsSwitch live={live ?? null} onChanged={reload} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "20px", alignItems: "start" }}>
            <Card title="Ready to take card payments?">
              <Rows>
                <Row k="Provider" v={readiness?.provider_display_name ?? "Not configured"} />
                <Row k="Configured" v={<Badge tone={readiness?.configured ? "ok" : "warn"}>{readiness?.configured ? "Yes" : "Not yet"}</Badge>} />
                <Row k="Checkout ready" v={<Badge tone={readiness?.checkout_ready ? "ok" : "warn"}>{readiness?.checkout_ready ? "Yes" : "Not yet"}</Badge>} />
                {readiness?.environment && <Row k="Environment" v={readiness.environment} />}
                <Row k="Live switch" v={
                  <Badge tone={live === true ? "ok" : live === false ? "neutral" : "bad"}>
                    {live === true ? "ON" : live === false ? "OFF" : "UNKNOWN — blocked"}
                  </Badge>
                } />
              </Rows>
              {(readiness?.missing_requirements?.length ?? 0) > 0 && (
                <div style={{ marginTop: "12px" }}>
                  <p style={{ margin: "0 0 6px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: T.gold }}>Still missing</p>
                  <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: T.muted, lineHeight: 1.7 }}>
                    {readiness!.missing_requirements.slice(0, 6).map((m) => <li key={m}>{m}</li>)}
                  </ul>
                </div>
              )}
            </Card>

            <Card title="Manual ways to pay">
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px" }}>
                {GUEST_MANUAL_PAYMENT_RAILS.map((rail) => {
                  const on = working.manual_payment_rails.includes(rail);
                  return (
                    <div key={rail} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", padding: "6px 0", borderBottom: `1px solid ${T.borderFaint}` }}>
                      <span style={{ fontSize: "14px" }}>{getManualRailLabel(rail)}</span>
                      <Button small variant={on ? "primary" : "secondary"} onClick={() => toggleRail(rail)}>
                        {on ? "On" : "Off"}
                      </Button>
                    </div>
                  );
                })}
              </div>

              <label style={{ display: "block", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted, marginBottom: "6px" }}>
                Payment mode
              </label>
              <CellSelect value={working.active_payment_mode} style={{ marginBottom: "16px" }}
                onChange={(e) => update({ active_payment_mode: e.target.value as PaymentMode })}>
                {PAYMENT_MODE_VALUES.map((mode) => <option key={mode} value={mode}>{MODE_LABELS[mode]}</option>)}
              </CellSelect>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: "12px", marginBottom: "16px" }}>
                <label style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted }}>
                  Minimum deposit %
                  <CellInput inputMode="numeric" style={{ marginTop: "6px" }}
                    value={String(working.deposit_minimum_percentage)}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n)) update({ deposit_minimum_percentage: n });
                    }} />
                </label>
                <label style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted }}>
                  Full payment
                  <CellSelect style={{ marginTop: "6px" }} value={working.allow_full_payment ? "yes" : "no"}
                    onChange={(e) => update({ allow_full_payment: e.target.value === "yes" })}>
                    <option value="yes">Allowed</option>
                    <option value="no">Not offered</option>
                  </CellSelect>
                </label>
                <label style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted }}>
                  Custom deposit
                  <CellSelect style={{ marginTop: "6px" }} value={working.allow_custom_deposit ? "yes" : "no"}
                    onChange={(e) => update({ allow_custom_deposit: e.target.value === "yes" })}>
                    <option value="yes">Allowed</option>
                    <option value="no">Not offered</option>
                  </CellSelect>
                </label>
              </div>

              <label style={{ display: "block", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted, marginBottom: "6px" }}>
                Payment instructions guests see
              </label>
              <textarea
                value={working.payment_instructions}
                onChange={(e) => update({ payment_instructions: e.target.value })}
                rows={3}
                style={{
                  width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.05)",
                  border: `1px solid ${T.borderStrong}`, borderRadius: T.rSm, padding: "10px 12px",
                  fontFamily: T.sans, fontSize: "14px", color: T.ink, outline: "none", resize: "vertical", marginBottom: "16px",
                }}
              />

              <label style={{ display: "block", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted, marginBottom: "6px" }}>
                Bank transfer details (public)
              </label>
              <textarea
                value={working.bank_transfer_public_details}
                onChange={(e) => update({ bank_transfer_public_details: e.target.value })}
                rows={3}
                style={{
                  width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.05)",
                  border: `1px solid ${T.borderStrong}`, borderRadius: T.rSm, padding: "10px 12px",
                  fontFamily: T.sans, fontSize: "14px", color: T.ink, outline: "none", resize: "vertical", marginBottom: "16px",
                }}
              />

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "12px" }}>
                <label style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted }}>
                  Card provider shown to guests
                  <CellInput style={{ marginTop: "6px" }} value={working.provider_display_name}
                    onChange={(e) => update({ provider_display_name: e.target.value })} />
                </label>
                <label style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted }}>
                  Offer card payment
                  <CellSelect style={{ marginTop: "6px" }} value={working.online_payment_enabled ? "yes" : "no"}
                    onChange={(e) => update({ online_payment_enabled: e.target.value === "yes" })}>
                    <option value="yes">Yes, when the gateway is ready</option>
                    <option value="no">No</option>
                  </CellSelect>
                </label>
              </div>
            </Card>
          </div>

          <PendingBar
            changes={changes}
            busy={busy}
            error={saveError}
            onDiscard={() => { setDraft(null); setSaveError(""); }}
            onSave={() => void save()}
            onDismissError={() => setSaveError("")}
          />
        </>
      )))}
    </>
  );
}
