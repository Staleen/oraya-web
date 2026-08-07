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

interface DraftAddon {
  id: string;
  label: string;
  enabled: boolean;
  currency: string;
  price: number | null;
  pricing_model: SetupAddon["pricing_model"];
  requires_approval: boolean;
  /** Marked for removal — struck through until saved (prototype pattern). */
  removed: boolean;
  isNew: boolean;
}

function toDraft(a: SetupAddon): DraftAddon {
  return {
    id: a.id,
    label: a.label,
    enabled: a.enabled,
    currency: a.currency,
    price: a.price,
    pricing_model: a.pricing_model,
    requires_approval: a.operational.requires_approval === true,
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
    if (prev.requires_approval !== a.requires_approval) {
      out.push(a.requires_approval ? `${a.label} will need your approval per booking` : `${a.label} no longer needs approval`);
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
        requires_approval: true,
        removed: false,
        isNew: true,
      },
    ]);
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
            requires_approval: a.requires_approval,
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
            <b>Live now</b> — shown on the booking page. Deeper rules (villas, preparation time,
            categories) keep their current values and are edited in the legacy admin for now.
          </LiveBanner>

          <Card title="For stays and events">
            <div style={{ display: "grid", gridTemplateColumns: "minmax(140px,1.6fr) minmax(90px,1fr) minmax(130px,1.2fr) minmax(90px,1fr) minmax(90px,1fr) auto", gap: "10px 12px", alignItems: "center" }}>
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
                  <CellSelect disabled={a.removed} value={a.requires_approval ? "yes" : "no"}
                    onChange={(e) => update(a.id, { requires_approval: e.target.value === "yes" })}>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </CellSelect>
                  {a.removed ? (
                    <Button small onClick={() => update(a.id, { removed: false })}>Keep it</Button>
                  ) : (
                    <Button small variant="ghost" onClick={() => update(a.id, { removed: true })}>Remove</Button>
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
