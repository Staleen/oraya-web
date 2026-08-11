"use client";
import { useMemo, useState } from "react";
import { Banner, Button, Card, PageHead, T } from "@/components/ops/ui";
import {
  CellInput, CellSelect, PendingBar, SetupGate, useSetupData, type SiteSettings,
} from "@/components/ops/setup-shared";

/**
 * The small site switches that used to live in /admin/settings: the WhatsApp
 * number guests are sent to, who gets notified of new bookings, whether
 * instant booking is offered per villa, and the Butler's check-in guidance.
 *
 * Same pending-changes discipline as the other Setup screens — every edit is
 * named before it goes live.
 */

function describeChanges(before: SiteSettings, after: SiteSettings): string[] {
  const out: string[] = [];
  if (before.whatsapp_number !== after.whatsapp_number) {
    out.push(`WhatsApp number: ${before.whatsapp_number || "none"} → ${after.whatsapp_number || "none"}`);
  }
  if (before.notification_emails !== after.notification_emails) {
    out.push("Who gets notified of new bookings changed");
  }
  if (before.butler_checkin_guidance !== after.butler_checkin_guidance) {
    out.push("Check-in guidance the WhatsApp assistant gives changed");
  }
  if (before.instant_mechmech !== after.instant_mechmech) {
    out.push(after.instant_mechmech ? "Villa Mechmech offers instant booking" : "Villa Mechmech no longer offers instant booking");
  }
  if (before.instant_byblos !== after.instant_byblos) {
    out.push(after.instant_byblos ? "Villa Byblos offers instant booking" : "Villa Byblos no longer offers instant booking");
  }
  if (before.instant_auto_confirm !== after.instant_auto_confirm) {
    out.push(after.instant_auto_confirm
      ? "Fully paid instant stays will CONFIRM THEMSELVES — no approval from you"
      : "Instant stays go back to needing your approval");
  }
  return out;
}

export default function SitePage() {
  const { data, loading, loadError, ownerOnly, reload } = useSetupData();
  const [draft, setDraft] = useState<SiteSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [flash, setFlash] = useState("");

  const original = data?.site ?? null;
  const working = draft ?? original;
  const changes = useMemo(
    () => (original && draft ? describeChanges(original, draft) : []),
    [original, draft],
  );

  function update(patch: Partial<SiteSettings>) {
    setFlash("");
    setDraft((cur) => ({ ...(cur ?? original!), ...patch }));
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setSaveError("");
    try {
      const r = await fetch("/api/ops/setup/site", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !body.ok) { setSaveError(body.error ?? "That didn't save."); return; }
      setDraft(null);
      await reload();
      setFlash("Saved — live on the website now.");
    } catch {
      setSaveError("Couldn't reach Oraya. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  const gate = SetupGate({ loading: loading && !data, loadError: data ? "" : loadError, ownerOnly, onRetry: reload });

  return (
    <>
      <PageHead title="Site" sub="How guests reach you, and what the website offers" />

      {flash && <Banner tone="ok" title="Live" onDismiss={() => setFlash("")}>{flash}</Banner>}

      {gate ?? (working && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "20px", alignItems: "start" }}>
            <Card title="Contact">
              <label style={{ display: "block", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted, marginBottom: "6px" }}>
                WhatsApp number guests message
              </label>
              <CellInput
                value={working.whatsapp_number}
                inputMode="tel"
                placeholder="9613123456"
                onChange={(e) => update({ whatsapp_number: e.target.value })}
              />
              <p style={{ margin: "6px 0 18px", fontSize: "12px", color: T.faint }}>
                Full number with country code, digits only. Every &ldquo;chat with us&rdquo; button uses it.
              </p>

              <label style={{ display: "block", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted, marginBottom: "6px" }}>
                Who gets emailed about new bookings
              </label>
              <CellInput
                value={working.notification_emails}
                placeholder="you@example.com, someone@example.com"
                onChange={(e) => update({ notification_emails: e.target.value })}
              />
              <p style={{ margin: "6px 0 0", fontSize: "12px", color: T.faint }}>
                Separate several with commas.
              </p>
            </Card>

            <Card title="What the website offers">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "12px", marginBottom: "18px" }}>
                <label style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted }}>
                  Villa Mechmech
                  <CellSelect style={{ marginTop: "6px" }} value={working.instant_mechmech ? "yes" : "no"}
                    onChange={(e) => update({ instant_mechmech: e.target.value === "yes" })}>
                    <option value="no">Standard — &ldquo;request to book&rdquo;</option>
                    <option value="yes">Show the instant-booking lane</option>
                  </CellSelect>
                </label>
                <label style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted }}>
                  Villa Byblos
                  <CellSelect style={{ marginTop: "6px" }} value={working.instant_byblos ? "yes" : "no"}
                    onChange={(e) => update({ instant_byblos: e.target.value === "yes" })}>
                    <option value="no">Standard — &ldquo;request to book&rdquo;</option>
                    <option value="yes">Show the instant-booking lane</option>
                  </CellSelect>
                </label>
              </div>
              <p style={{ margin: "-6px 0 18px", fontSize: "12px", color: T.muted, lineHeight: 1.6 }}>
                This changes which lane the booking page <b>shows</b> for each villa. Whether a paid
                stay confirms itself is the separate switch below.
              </p>

              <label style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted, display: "block", marginBottom: "10px" }}>
                Confirm instant stays automatically
                <CellSelect style={{ marginTop: "6px" }} value={working.instant_auto_confirm ? "yes" : "no"}
                  onChange={(e) => update({ instant_auto_confirm: e.target.value === "yes" })}>
                  <option value="no">No — every booking waits for my approval</option>
                  <option value="yes">Yes — a stay paid in full confirms itself</option>
                </CellSelect>
              </label>
              <p style={{ margin: "-6px 0 18px", fontSize: "12px", color: working.instant_auto_confirm ? T.warn : T.faint, lineHeight: 1.6 }}>
                {working.instant_auto_confirm ? (
                  <>
                    <b>On.</b> A guest who books an instant villa with <b>no add-ons</b>, <b>no special
                    request</b>, and pays <b>the full amount</b> is confirmed the moment the money lands,
                    and immediately receives the confirmation email and the WhatsApp arrival guide —
                    without you seeing it first. Availability is re-checked at the moment of payment, so
                    two guests paying for the same nights cannot both be confirmed. Anything with add-ons,
                    a special request, a deposit-only payment, or an event still waits for you.
                  </>
                ) : (
                  <>Off. Every booking arrives here for your approval, however it was paid.</>
                )}
              </p>

              <label style={{ display: "block", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted, marginBottom: "6px" }}>
                Check-in guidance the WhatsApp assistant gives
              </label>
              <textarea
                value={working.butler_checkin_guidance}
                onChange={(e) => update({ butler_checkin_guidance: e.target.value })}
                rows={4}
                placeholder="e.g. Check-in is from 3pm. Someone meets you at the gate."
                style={{
                  width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.05)",
                  border: `1px solid ${T.borderStrong}`, borderRadius: T.rSm, padding: "12px 13px",
                  fontFamily: T.sans, fontSize: "14px", color: T.ink, outline: "none", resize: "vertical",
                }}
              />
              <p style={{ margin: "6px 0 0", fontSize: "12px", color: T.faint }}>
                Sent to confirmed guests who ask on WhatsApp. Never include gate codes or PINs.
              </p>
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
      ))}
    </>
  );
}
