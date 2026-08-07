"use client";
import { useMemo, useState } from "react";
import type { VillaBasePricing } from "@/lib/admin-pricing";
import type { SeasonalOverride } from "@/lib/pricing/types";
import { validatePricing } from "@/lib/pricing/validation";
import { Banner, Button, Card, PageHead, T } from "@/components/ops/ui";
import {
  CellInput, ColHead, LiveBanner, PendingBar, SetupGate,
  numFromInput, numToInput, useSetupData,
} from "@/components/ops/setup-shared";

/**
 * Owner pricing over the same settings row the website quotes from —
 * prototype-faithful: per-villa rate cards, a Live-now banner, and the
 * pending-changes bar naming every unsaved edit.
 *
 * Honest deviations from the prototype, because the real pricing engine has
 * no such concepts: there is no cleaning fee, and minimum nights is per villa
 * (plus per season), not per rate row.
 */

const RATE_ROWS: Array<{ key: "weekday_price" | "weekend_price" | "base_price"; label: string; sub: string }> = [
  { key: "weekday_price", label: "Weeknight", sub: "Sunday to Thursday" },
  { key: "weekend_price", label: "Weekend", sub: "Friday and Saturday" },
  { key: "base_price", label: "Any night fallback", sub: "Used when a weeknight/weekend price is empty" },
];

function money(n: number | null): string {
  return n === null ? "—" : `$${n.toLocaleString("en-US")}`;
}

function seasonLabel(s: SeasonalOverride): string {
  return `${s.start_date} → ${s.end_date}`;
}

function clone(pricing: VillaBasePricing[]): VillaBasePricing[] {
  return pricing.map((v) => ({ ...v, seasonal_overrides: v.seasonal_overrides.map((s) => ({ ...s })) }));
}

/** Human sentences for the pending bar — the diff IS the confirmation. */
function describeChanges(before: VillaBasePricing[], after: VillaBasePricing[]): string[] {
  const out: string[] = [];
  for (const next of after) {
    const prev = before.find((v) => v.villa === next.villa);
    if (!prev) continue;
    for (const row of RATE_ROWS) {
      if (prev[row.key] !== next[row.key]) {
        out.push(`${next.villa} ${row.label.toLowerCase()}: ${money(prev[row.key])} → ${money(next[row.key])}`);
      }
    }
    if (prev.minimum_stay !== next.minimum_stay) {
      out.push(`${next.villa} minimum nights: ${prev.minimum_stay ?? "—"} → ${next.minimum_stay ?? "—"}`);
    }
    const prevSeasons = new Map(prev.seasonal_overrides.map((s) => [s.id, s]));
    const nextSeasons = new Map(next.seasonal_overrides.map((s) => [s.id, s]));
    for (const [id, season] of nextSeasons) {
      const old = prevSeasons.get(id);
      if (!old) {
        out.push(`${next.villa}: new season ${seasonLabel(season)}`);
      } else if (JSON.stringify(old) !== JSON.stringify(season)) {
        out.push(`${next.villa}: season ${seasonLabel(season)} changed`);
      }
    }
    for (const [id, season] of prevSeasons) {
      if (!nextSeasons.has(id)) out.push(`${next.villa}: season ${seasonLabel(season)} removed — those dates fall back to normal rates`);
    }
  }
  return out;
}

export default function PricingPage() {
  const { data, loading, loadError, ownerOnly, reload } = useSetupData();
  const [draft, setDraft] = useState<VillaBasePricing[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [flash, setFlash] = useState("");

  const original = data?.pricing ?? null;
  const working = draft ?? original;

  const changes = useMemo(
    () => (original && draft ? describeChanges(original, draft) : []),
    [original, draft],
  );

  const blockingIssues = useMemo(() => {
    if (!working) return [];
    return working.flatMap((villa) =>
      validatePricing(villa)
        .filter((issue) => issue.level === "error")
        .map((issue) => `${villa.villa}: ${issue.message}`),
    );
  }, [working]);

  function update(villa: string, patch: Partial<VillaBasePricing>) {
    setFlash("");
    setDraft((current) => {
      const base = current ?? (original ? clone(original) : null);
      if (!base) return current;
      return base.map((v) => (v.villa === villa ? { ...v, ...patch } : v));
    });
  }

  function updateSeason(villa: string, seasonId: string, patch: Partial<SeasonalOverride>) {
    setFlash("");
    setDraft((current) => {
      const base = current ?? (original ? clone(original) : null);
      if (!base) return current;
      return base.map((v) =>
        v.villa === villa
          ? { ...v, seasonal_overrides: v.seasonal_overrides.map((s) => (s.id === seasonId ? { ...s, ...patch } : s)) }
          : v,
      );
    });
  }

  function addSeason(villa: string) {
    setFlash("");
    setDraft((current) => {
      const base = current ?? (original ? clone(original) : null);
      if (!base) return current;
      const today = new Date().toISOString().slice(0, 10);
      return base.map((v) =>
        v.villa === villa
          ? {
              ...v,
              seasonal_overrides: [
                ...v.seasonal_overrides,
                {
                  id: `s_${Math.random().toString(36).slice(2, 10)}`,
                  start_date: today,
                  end_date: today,
                  base_price: null,
                  weekday_price: null,
                  weekend_price: null,
                  minimum_stay: null,
                },
              ],
            }
          : v,
      );
    });
  }

  function removeSeason(villa: string, seasonId: string) {
    setFlash("");
    setDraft((current) => {
      const base = current ?? (original ? clone(original) : null);
      if (!base) return current;
      return base.map((v) =>
        v.villa === villa
          ? { ...v, seasonal_overrides: v.seasonal_overrides.filter((s) => s.id !== seasonId) }
          : v,
      );
    });
  }

  async function save() {
    if (!draft || !data) return;
    if (blockingIssues.length > 0) {
      setSaveError(`Fix these before saving: ${blockingIssues.join(" · ")}`);
      return;
    }
    setBusy(true);
    setSaveError("");
    try {
      const r = await fetch("/api/ops/setup/pricing", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pricing: draft, expected_raw: data.pricing_raw }),
      });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; code?: string };
      if (!r.ok || !body.ok) {
        setSaveError(body.error ?? "That didn't save.");
        if (body.code === "changed_elsewhere") await reload();
        return;
      }
      setDraft(null);
      await reload();
      setFlash("Saved — the website quotes these prices from now on.");
    } catch {
      setSaveError("Couldn't reach Oraya. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  const gate = SetupGate({ loading: loading && !data, loadError: data ? "" : loadError, ownerOnly, onRetry: reload });

  return (
    <>
      <PageHead title="Pricing" sub="What guests are quoted on stayoraya.com" />

      {flash && <Banner tone="ok" title="Live" onDismiss={() => setFlash("")}>{flash}</Banner>}

      {gate ?? (working && (
        <>
          <LiveBanner>
            <b>Live now</b> — these prices are what the website quotes and what new bookings are charged.
          </LiveBanner>

          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {working.map((villa) => (
            <Card key={villa.villa} title={villa.villa}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(150px,1.4fr) minmax(110px,1fr)", gap: "10px 16px", alignItems: "center" }}>
                <ColHead>Rate</ColHead>
                <ColHead>Per night</ColHead>
                {RATE_ROWS.map((row) => (
                  <div key={row.key} style={{ display: "contents" }}>
                    <div>
                      <p style={{ margin: 0, fontSize: "14px" }}>{row.label}</p>
                      <p style={{ margin: "2px 0 0", fontSize: "12px", color: T.faint }}>{row.sub}</p>
                    </div>
                    <CellInput
                      inputMode="numeric"
                      value={numToInput(villa[row.key])}
                      onChange={(e) => update(villa.villa, { [row.key]: numFromInput(e.target.value) } as Partial<VillaBasePricing>)}
                    />
                  </div>
                ))}
                <div>
                  <p style={{ margin: 0, fontSize: "14px" }}>Minimum nights</p>
                  <p style={{ margin: "2px 0 0", fontSize: "12px", color: T.faint }}>For every stay at this villa</p>
                </div>
                <CellInput
                  inputMode="numeric"
                  value={numToInput(villa.minimum_stay)}
                  onChange={(e) => update(villa.villa, { minimum_stay: numFromInput(e.target.value) })}
                />
              </div>

              <div style={{ marginTop: "20px", borderTop: `1px solid ${T.borderFaint}`, paddingTop: "16px" }}>
                <p style={{ margin: "0 0 10px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: T.gold }}>
                  Seasons — override the rates between two dates
                </p>
                {villa.seasonal_overrides.length === 0 && (
                  <p style={{ margin: "0 0 10px", fontSize: "13px", color: T.faint }}>No seasons — the rates above apply all year.</p>
                )}
                {villa.seasonal_overrides.map((s) => (
                  <div key={s.id} style={{
                    display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))",
                    gap: "8px 12px", alignItems: "end", padding: "10px 0", borderBottom: `1px solid ${T.borderFaint}`,
                  }}>
                    <label style={{ fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: T.muted }}>
                      From
                      <CellInput type="date" value={s.start_date} style={{ colorScheme: "dark", marginTop: "4px" }}
                        onChange={(e) => updateSeason(villa.villa, s.id, { start_date: e.target.value })} />
                    </label>
                    <label style={{ fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: T.muted }}>
                      To
                      <CellInput type="date" value={s.end_date} style={{ colorScheme: "dark", marginTop: "4px" }}
                        onChange={(e) => updateSeason(villa.villa, s.id, { end_date: e.target.value })} />
                    </label>
                    <label style={{ fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: T.muted }}>
                      Per night
                      <CellInput inputMode="numeric" value={numToInput(s.base_price)} style={{ marginTop: "4px" }}
                        onChange={(e) => updateSeason(villa.villa, s.id, { base_price: numFromInput(e.target.value) })} />
                    </label>
                    <label style={{ fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: T.muted }}>
                      Weeknight
                      <CellInput inputMode="numeric" value={numToInput(s.weekday_price)} style={{ marginTop: "4px" }}
                        onChange={(e) => updateSeason(villa.villa, s.id, { weekday_price: numFromInput(e.target.value) })} />
                    </label>
                    <label style={{ fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: T.muted }}>
                      Weekend
                      <CellInput inputMode="numeric" value={numToInput(s.weekend_price)} style={{ marginTop: "4px" }}
                        onChange={(e) => updateSeason(villa.villa, s.id, { weekend_price: numFromInput(e.target.value) })} />
                    </label>
                    <label style={{ fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: T.muted }}>
                      Min nights
                      <CellInput inputMode="numeric" value={numToInput(s.minimum_stay)} style={{ marginTop: "4px" }}
                        onChange={(e) => updateSeason(villa.villa, s.id, { minimum_stay: numFromInput(e.target.value) })} />
                    </label>
                    <Button small variant="ghost" onClick={() => removeSeason(villa.villa, s.id)}>Remove</Button>
                  </div>
                ))}
                <div style={{ marginTop: "12px" }}>
                  <Button small onClick={() => addSeason(villa.villa)}>Add a season</Button>
                </div>
              </div>
            </Card>
          ))}
          </div>

          {blockingIssues.length > 0 && changes.length > 0 && (
            <Banner tone="warn" title="Something to fix before saving">
              {blockingIssues.join(" · ")}
            </Banner>
          )}

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
