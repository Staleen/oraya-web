"use client";
import { useMemo, useState } from "react";
import { Banner, Button, Card, PageHead, T } from "@/components/ops/ui";
import {
  CellInput, CellSelect, ColHead, LiveBanner, PendingBar, SetupGate,
  numFromInput, numToInput, useSetupData, type SetupAddon,
} from "@/components/ops/setup-shared";

/**
 * Owner add-ons over the real addons table + operational rules — prototype
 * faithful: inline table, strike-through removal with "Keep it", and the
 * pending-changes bar naming consequences before anything is live.
 *
 * The Extras screen edits name, price, price type, shown-to-guests, and
 * needs-approval. The deeper operational rules (categories, per-villa
 * applicability, preparation times, event pricing) keep their stored values
 * untouched and remain editable in the legacy admin until they get a screen.
 */

const MODEL_LABELS: Record<SetupAddon["pricing_model"], string> = {
  flat_fee: "Per booking",
  per_night: "Per night",
  per_person_per_day: "Per person per day",
  per_unit: "Per unit",
};

const VILLAS = ["Villa Mechmech", "Villa Byblos"] as const;
const CATEGORIES = ["comfort", "experience", "logistics", "service", "essentials"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  comfort: "Comfort", experience: "Experience", logistics: "Logistics",
  service: "Service", essentials: "Essentials",
};
const ENFORCEMENT_LABELS: Record<string, string> = {
  strict: "Strict — block the booking if the rule isn't met",
  soft: "Soft — warn, but allow",
  none: "None",
};
const APPLIES_TO_LABELS: Record<string, string> = {
  stay: "Stays only", event: "Events only", both: "Stays and events",
};
const EVENT_UNIT_LABELS: Record<string, string> = {
  fixed: "Fixed", per_guest: "Per guest", per_unit: "Per unit",
  per_hour: "Per hour", percentage: "Percentage",
};

/** Shared caption style for the rules panel. */
const LBL: React.CSSProperties = {
  fontSize: "10px", letterSpacing: "1.6px", textTransform: "uppercase", color: T.muted,
};

type Rules = {
  requires_approval: boolean;
  recommended: boolean;
  quantity_enabled: boolean;
  applies_to: string;
  preparation_time_hours: number | null;
  cutoff_type: string | null;
  enforcement_mode: string | null;
  category: string | null;
  description: string | null;
  unit_label: string | null;
  display_order: number | null;
  pricing_type: string | null;
  percentage_value: number | null;
  pricing_unit: string | null;
  min_quantity: number | null;
  max_quantity: number | null;
  applicable_villas: string[];
};

interface DraftAddon {
  id: string;
  label: string;
  enabled: boolean;
  currency: string;
  price: number | null;
  pricing_model: SetupAddon["pricing_model"];
  rules: Rules;
  /** Marked for removal — struck through until saved (prototype pattern). */
  removed: boolean;
  isNew: boolean;
}

function toDraft(a: SetupAddon): DraftAddon {
  const o = a.operational;
  return {
    id: a.id,
    label: a.label,
    enabled: a.enabled,
    currency: a.currency,
    price: a.price,
    pricing_model: a.pricing_model,
    rules: {
      requires_approval: o.requires_approval === true,
      recommended: o.recommended === true,
      quantity_enabled: o.quantity_enabled === true,
      applies_to: o.applies_to ?? "stay",
      preparation_time_hours: o.preparation_time_hours ?? null,
      cutoff_type: o.cutoff_type ?? null,
      enforcement_mode: o.enforcement_mode ?? null,
      category: o.category ?? null,
      description: o.description ?? null,
      unit_label: o.unit_label ?? null,
      display_order: o.display_order ?? null,
      pricing_type: o.pricing_type ?? null,
      percentage_value: o.percentage_value ?? null,
      pricing_unit: o.pricing_unit ?? null,
      min_quantity: o.min_quantity ?? null,
      max_quantity: o.max_quantity ?? null,
      applicable_villas: Array.isArray(o.applicable_villas) ? [...o.applicable_villas] : [],
    },
    removed: false,
    isNew: false,
  };
}

function money(n: number | null): string {
  return n === null ? "on request" : `$${n.toLocaleString("en-US")}`;
}

function describeChanges(before: Map<string, DraftAddon>, after: DraftAddon[]): string[] {
  const out: string[] = [];
  for (const a of after) {
    if (a.removed) {
      if (!a.isNew) out.push(`Removing ${a.label || a.id} — guests will no longer see it`);
      continue;
    }
    if (a.isNew) {
      out.push(`New extra ${a.label || "(unnamed)"} at ${money(a.price)}`);
      continue;
    }
    const prev = before.get(a.id);
    if (!prev) continue;
    if (prev.label !== a.label) out.push(`${prev.label} renamed to ${a.label}`);
    if (prev.price !== a.price) out.push(`${a.label}: ${money(prev.price)} → ${money(a.price)}`);
    if (prev.pricing_model !== a.pricing_model) out.push(`${a.label} is now charged ${MODEL_LABELS[a.pricing_model].toLowerCase()}`);
    if (prev.enabled !== a.enabled) out.push(a.enabled ? `${a.label} will appear on the booking page` : `${a.label} will be hidden from guests`);

    const p = prev.rules;
    const n = a.rules;
    if (p.requires_approval !== n.requires_approval) {
      out.push(n.requires_approval ? `${a.label} will need your approval per booking` : `${a.label} no longer needs approval`);
    }
    if (p.recommended !== n.recommended) out.push(n.recommended ? `${a.label} will be highlighted to guests` : `${a.label} no longer highlighted`);
    if (p.applies_to !== n.applies_to) out.push(`${a.label} now applies to ${APPLIES_TO_LABELS[n.applies_to].toLowerCase()}`);
    if (JSON.stringify(p.applicable_villas) !== JSON.stringify(n.applicable_villas)) {
      out.push(n.applicable_villas.length === 0
        ? `${a.label} is offered at every villa`
        : `${a.label} is offered at ${n.applicable_villas.join(" and ")} only`);
    }
    if (p.preparation_time_hours !== n.preparation_time_hours) {
      out.push(n.preparation_time_hours === null
        ? `${a.label} no longer needs advance notice`
        : `${a.label} needs ${n.preparation_time_hours}h advance notice`);
    }
    if (p.cutoff_type !== n.cutoff_type) out.push(`${a.label} notice is counted ${n.cutoff_type === "before_booking" ? "before booking" : "before check-in"}`);
    if (p.enforcement_mode !== n.enforcement_mode) out.push(`${a.label} enforcement: ${n.enforcement_mode ?? "default"}`);
    if (p.category !== n.category) out.push(`${a.label} category: ${n.category ? CATEGORY_LABELS[n.category] ?? n.category : "none"}`);
    if (p.description !== n.description) out.push(`${a.label} description updated`);
    if (p.display_order !== n.display_order) out.push(`${a.label} display order: ${n.display_order ?? "default"}`);
    if (p.pricing_type !== n.pricing_type || p.percentage_value !== n.percentage_value) {
      out.push(n.pricing_type === "percentage"
        ? `${a.label} priced as ${n.percentage_value ?? 0}% of the stay — this reprices live guest quotes`
        : `${a.label} priced as a fixed amount`);
    }
    if (p.quantity_enabled !== n.quantity_enabled) out.push(n.quantity_enabled ? `${a.label} lets guests choose a quantity` : `${a.label} no longer has a quantity`);
    if (p.unit_label !== n.unit_label) out.push(`${a.label} unit name: ${n.unit_label ?? "none"}`);
    if (p.pricing_unit !== n.pricing_unit) out.push(`${a.label} event pricing: ${n.pricing_unit ? EVENT_UNIT_LABELS[n.pricing_unit] : "default"}`);
    if (p.min_quantity !== n.min_quantity || p.max_quantity !== n.max_quantity) {
      out.push(`${a.label} quantity range: ${n.min_quantity ?? "—"} to ${n.max_quantity ?? "—"}`);
    }
  }
  return out;
}

export default function ExtrasPage() {
  const { data, loading, loadError, ownerOnly, reload } = useSetupData();
  const [draft, setDraft] = useState<DraftAddon[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [flash, setFlash] = useState("");
  const [openRules, setOpenRules] = useState<string | null>(null);

  const originals = useMemo(
    () => new Map((data?.addons ?? []).map((a) => [a.id, toDraft(a)])),
    [data],
  );
  const working = draft ?? (data ? data.addons.map(toDraft) : null);

  const changes = useMemo(
    () => (draft ? describeChanges(originals, draft) : []),
    [originals, draft],
  );

  function mutate(updater: (rows: DraftAddon[]) => DraftAddon[]) {
    setFlash("");
    setDraft((current) => updater(current ?? (data ? data.addons.map(toDraft) : [])));
  }

  function update(id: string, patch: Partial<DraftAddon>) {
    mutate((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addExtra() {
    mutate((rows) => [
      ...rows,
      {
        id: `extra_${Math.random().toString(36).slice(2, 8)}`,
        label: "",
        enabled: true,
        currency: "USD",
        price: null,
        pricing_model: "flat_fee",
        rules: {
          requires_approval: true, recommended: false, quantity_enabled: false,
          applies_to: "stay", preparation_time_hours: null, cutoff_type: null,
          enforcement_mode: null, category: null, description: null, unit_label: null,
          display_order: null, pricing_type: null, percentage_value: null,
          pricing_unit: null, min_quantity: null, max_quantity: null, applicable_villas: [],
        },
        removed: false,
        isNew: true,
      },
    ]);
  }

  function updateRules(id: string, patch: Partial<Rules>) {
    mutate((rows) => rows.map((r) => (r.id === id ? { ...r, rules: { ...r.rules, ...patch } } : r)));
  }

  async function save() {
    if (!draft) return;
    const kept = draft.filter((a) => !a.removed);
    if (kept.some((a) => !a.label.trim())) {
      setSaveError("Every extra needs a name before saving.");
      return;
    }
    setBusy(true);
    setSaveError("");
    try {
      const r = await fetch("/api/ops/setup/addons", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addons: kept.map((a) => ({
            id: a.id,
            label: a.label.trim(),
            enabled: a.enabled,
            currency: a.currency,
            price: a.price,
            pricing_model: a.pricing_model,
            operational: a.rules,
          })),
          // Audit R-2: only ids the owner explicitly struck through.
          deleted_ids: draft.filter((a) => a.removed && !a.isNew).map((a) => a.id),
        }),
      });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !body.ok) {
        setSaveError(body.error ?? "That didn't save.");
        await reload();
        return;
      }
      setDraft(null);
      await reload();
      setFlash("Saved — the booking page shows these extras from now on.");
    } catch {
      setSaveError("Couldn't reach Oraya. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  const gate = SetupGate({ loading: loading && !data, loadError: data ? "" : loadError, ownerOnly, onRetry: reload });

  return (
    <>
      <PageHead title="Extras" sub="Add-ons guests can request when they book" />

      {flash && <Banner tone="ok" title="Live" onDismiss={() => setFlash("")}>{flash}</Banner>}

      {gate ?? (working && (
        <>
          <LiveBanner right={`${working.filter((a) => !a.removed).length} extras`}>
            <b>Live now</b> — shown on the booking page in this order. Open <b>Rules</b> on any row
            for villas, advance notice, categories and event pricing.
          </LiveBanner>

          <Card title="For stays and events">
            <div style={{ display: "grid", gridTemplateColumns: "minmax(140px,1.6fr) minmax(90px,1fr) minmax(130px,1.2fr) minmax(90px,1fr) minmax(90px,1fr) auto", gap: "10px 12px", alignItems: "center" }} suppressHydrationWarning>
              <ColHead>Extra</ColHead>
              <ColHead>Price</ColHead>
              <ColHead>Type</ColHead>
              <ColHead>Shown</ColHead>
              <ColHead>Needs approval</ColHead>
              <span />
              {working.map((a) => (
                <div key={a.id} style={{ display: "contents" }}>
                  {a.removed ? (
                    <div>
                      <p style={{ margin: 0, fontSize: "14px", textDecoration: "line-through", color: T.muted }}>{a.label || a.id}</p>
                      <p style={{ margin: "2px 0 0", fontSize: "11px", color: T.warn }}>Will be removed when you save</p>
                    </div>
                  ) : (
                    <CellInput value={a.label} placeholder="Name guests will see"
                      onChange={(e) => update(a.id, { label: e.target.value })} />
                  )}
                  <CellInput inputMode="numeric" disabled={a.removed} value={numToInput(a.price)} placeholder="on request"
                    onChange={(e) => update(a.id, { price: numFromInput(e.target.value) })} />
                  <CellSelect disabled={a.removed} value={a.pricing_model}
                    onChange={(e) => update(a.id, { pricing_model: e.target.value as DraftAddon["pricing_model"] })}>
                    {Object.entries(MODEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </CellSelect>
                  <CellSelect disabled={a.removed} value={a.enabled ? "yes" : "no"}
                    onChange={(e) => update(a.id, { enabled: e.target.value === "yes" })}>
                    <option value="yes">Yes</option>
                    <option value="no">Hidden</option>
                  </CellSelect>
                  <CellSelect disabled={a.removed} value={a.rules.requires_approval ? "yes" : "no"}
                    onChange={(e) => updateRules(a.id, { requires_approval: e.target.value === "yes" })}>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </CellSelect>
                  <span style={{ display: "flex", gap: "6px" }}>
                    {!a.removed && (
                      <Button small variant="ghost" onClick={() => setOpenRules((cur) => (cur === a.id ? null : a.id))}>
                        {openRules === a.id ? "Hide rules" : "Rules"}
                      </Button>
                    )}
                    {a.removed ? (
                      <Button small onClick={() => update(a.id, { removed: false })}>Keep it</Button>
                    ) : (
                      <Button small variant="ghost" onClick={() => update(a.id, { removed: true })}>Remove</Button>
                    )}
                  </span>

                  {openRules === a.id && !a.removed && (
                    <div style={{ gridColumn: "1 / -1", background: "rgba(0,0,0,.18)", border: `1px solid ${T.borderFaint}`, borderRadius: T.r, padding: "16px", margin: "4px 0 12px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: "14px" }}>
                        <label style={LBL}>Offered at
                          <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap" }}>
                            {VILLAS.map((v) => {
                              const on = a.rules.applicable_villas.includes(v);
                              return (
                                <Button key={v} small variant={on ? "primary" : "secondary"}
                                  onClick={() => updateRules(a.id, {
                                    applicable_villas: on
                                      ? a.rules.applicable_villas.filter((x) => x !== v)
                                      : [...a.rules.applicable_villas, v],
                                  })}>
                                  {v.replace("Villa ", "")}
                                </Button>
                              );
                            })}
                          </div>
                          <span style={{ display: "block", fontSize: "11px", color: T.faint, marginTop: "6px", textTransform: "none", letterSpacing: 0 }}>
                            {a.rules.applicable_villas.length === 0 ? "None selected = every villa." : ""}
                          </span>
                        </label>

                        <label style={LBL}>Applies to
                          <CellSelect style={{ marginTop: "6px" }} value={a.rules.applies_to}
                            onChange={(e) => updateRules(a.id, { applies_to: e.target.value })}>
                            {Object.entries(APPLIES_TO_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </CellSelect>
                        </label>

                        <label style={LBL}>Category
                          <CellSelect style={{ marginTop: "6px" }} value={a.rules.category ?? ""}
                            onChange={(e) => updateRules(a.id, { category: e.target.value || null })}>
                            <option value="">None</option>
                            {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                          </CellSelect>
                        </label>

                        <label style={LBL}>Advance notice (hours)
                          <CellInput style={{ marginTop: "6px" }} inputMode="numeric" value={numToInput(a.rules.preparation_time_hours)}
                            onChange={(e) => updateRules(a.id, { preparation_time_hours: numFromInput(e.target.value) })} />
                        </label>

                        <label style={LBL}>Notice counted
                          <CellSelect style={{ marginTop: "6px" }} value={a.rules.cutoff_type ?? ""}
                            onChange={(e) => updateRules(a.id, { cutoff_type: e.target.value || null })}>
                            <option value="">Default</option>
                            <option value="before_checkin">Before check-in</option>
                            <option value="before_booking">Before booking</option>
                          </CellSelect>
                        </label>

                        <label style={LBL}>If the notice isn&apos;t met
                          <CellSelect style={{ marginTop: "6px" }} value={a.rules.enforcement_mode ?? ""}
                            onChange={(e) => updateRules(a.id, { enforcement_mode: e.target.value || null })}>
                            <option value="">Default (soft)</option>
                            {Object.entries(ENFORCEMENT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </CellSelect>
                        </label>

                        <label style={LBL}>Price basis
                          <CellSelect style={{ marginTop: "6px" }} value={a.rules.pricing_type ?? ""}
                            onChange={(e) => updateRules(a.id, { pricing_type: e.target.value || null })}>
                            <option value="">Fixed amount</option>
                            <option value="fixed">Fixed amount</option>
                            <option value="percentage">Percentage of the stay</option>
                          </CellSelect>
                        </label>

                        {a.rules.pricing_type === "percentage" && (
                          <label style={LBL}>Percentage (0–100)
                            <CellInput style={{ marginTop: "6px" }} inputMode="numeric" value={numToInput(a.rules.percentage_value)}
                              onChange={(e) => updateRules(a.id, { percentage_value: numFromInput(e.target.value) })} />
                            <span style={{ display: "block", fontSize: "11px", color: T.warn, marginTop: "6px", textTransform: "none", letterSpacing: 0 }}>
                              Percentage pricing reprices live guest quotes.
                            </span>
                          </label>
                        )}

                        <label style={LBL}>Highlighted to guests
                          <CellSelect style={{ marginTop: "6px" }} value={a.rules.recommended ? "yes" : "no"}
                            onChange={(e) => updateRules(a.id, { recommended: e.target.value === "yes" })}>
                            <option value="no">No</option>
                            <option value="yes">Yes — shown first</option>
                          </CellSelect>
                        </label>

                        <label style={LBL}>Display order
                          <CellInput style={{ marginTop: "6px" }} inputMode="numeric" value={numToInput(a.rules.display_order)}
                            onChange={(e) => updateRules(a.id, { display_order: numFromInput(e.target.value) })} />
                        </label>

                        <label style={LBL}>Guest chooses a quantity
                          <CellSelect style={{ marginTop: "6px" }} value={a.rules.quantity_enabled ? "yes" : "no"}
                            onChange={(e) => updateRules(a.id, { quantity_enabled: e.target.value === "yes" })}>
                            <option value="no">No</option>
                            <option value="yes">Yes</option>
                          </CellSelect>
                        </label>

                        {a.rules.quantity_enabled && (
                          <>
                            <label style={LBL}>Unit name
                              <CellInput style={{ marginTop: "6px" }} value={a.rules.unit_label ?? ""} placeholder="e.g. bottle, hour"
                                onChange={(e) => updateRules(a.id, { unit_label: e.target.value || null })} />
                            </label>
                            <label style={LBL}>Min / max
                              <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                                <CellInput inputMode="numeric" value={numToInput(a.rules.min_quantity)}
                                  onChange={(e) => updateRules(a.id, { min_quantity: numFromInput(e.target.value) })} />
                                <CellInput inputMode="numeric" value={numToInput(a.rules.max_quantity)}
                                  onChange={(e) => updateRules(a.id, { max_quantity: numFromInput(e.target.value) })} />
                              </div>
                            </label>
                          </>
                        )}

                        {(a.rules.applies_to === "event" || a.rules.applies_to === "both") && (
                          <label style={LBL}>Event price unit
                            <CellSelect style={{ marginTop: "6px" }} value={a.rules.pricing_unit ?? ""}
                              onChange={(e) => updateRules(a.id, { pricing_unit: e.target.value || null })}>
                              <option value="">Default</option>
                              {Object.entries(EVENT_UNIT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </CellSelect>
                          </label>
                        )}
                      </div>

                      <label style={{ ...LBL, display: "block", marginTop: "14px" }}>Description guests see
                        <textarea
                          value={a.rules.description ?? ""} rows={2}
                          onChange={(e) => updateRules(a.id, { description: e.target.value || null })}
                          style={{
                            width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.05)",
                            border: `1px solid ${T.borderStrong}`, borderRadius: T.rSm, padding: "10px 12px",
                            fontFamily: T.sans, fontSize: "14px", color: T.ink, outline: "none",
                            resize: "vertical", marginTop: "6px", textTransform: "none", letterSpacing: 0,
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ marginTop: "16px" }}>
              <Button small onClick={addExtra}>Add an extra</Button>
            </div>
          </Card>

          <PendingBar
            changes={changes}
            busy={busy}
            error={saveError}
            onDiscard={() => { setDraft(null); setSaveError(""); }}
            onSave={() => void save()}
            onDismissError={() => setSaveError("")}
          />
        </>
      ))}
    </>
  );
}
