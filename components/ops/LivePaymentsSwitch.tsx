"use client";
import { useState } from "react";
import { Badge, Banner, Button, Field, T } from "@/components/ops/ui";

/**
 * The switch that decides whether a real card is ever charged.
 *
 * The two directions are deliberately not symmetrical, and the screen shows
 * that rather than hiding it behind one toggle:
 *
 *   Turning it ON  — asks for your password, because starting to take real
 *                    money should require proving it is you at the keyboard.
 *   Turning it OFF — one click, no password. This is the kill switch. Anything
 *                    that slows it down is a bug at the moment it matters.
 *
 * An unknown state is shown as blocked rather than as "off", because the
 * underlying setting fails closed: if it cannot be read, no card is charged,
 * and pretending we know the answer would be the dangerous lie here.
 */
export default function LivePaymentsSwitch({
  live, onChanged,
}: {
  live: boolean | null;
  onChanged: () => void | Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  async function send(enabled: boolean, currentPassword?: string) {
    setBusy(true);
    setError("");
    setFlash("");
    try {
      const r = await fetch("/api/ops/setup/payments-live", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          enabled ? { enabled: true, current_password: currentPassword ?? "" } : { enabled: false },
        ),
      });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !body.ok) {
        setError(body.error ?? "That didn't change.");
        return;
      }
      setConfirming(false);
      setPassword("");
      setFlash(enabled
        ? "Card payments are ON. Guests can be charged for real from now on."
        : "Card payments are OFF. No card can be charged.");
      await onChanged();
    } catch {
      setError("Couldn't reach Oraya. Nothing changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      background: live === true ? T.okBg : T.warnBg,
      border: `1px solid ${live === true ? T.okBr : T.warnBr}`,
      borderRadius: T.r, padding: "16px 18px", marginBottom: "22px",
    }}>
      {flash && <Banner tone="ok" title="Live" onDismiss={() => setFlash("")}>{flash}</Banner>}
      {error && <Banner tone="bad" title="Not changed" onDismiss={() => setError("")}>{error}</Banner>}

      <div style={{ display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "min(100%,280px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <b style={{ fontSize: "14px" }}>Card payments on the website</b>
            <Badge tone={live === true ? "ok" : live === false ? "neutral" : "bad"}>
              {live === true ? "ON" : live === false ? "OFF" : "UNKNOWN — blocked"}
            </Badge>
          </div>
          <p style={{ margin: 0, fontSize: "13px", color: T.muted, lineHeight: 1.6 }}>
            {live === true
              ? "Guests can be charged for real."
              : live === false
                ? "No card is ever charged, whatever the rest of this screen says."
                : "The switch could not be read. Charging is blocked because it fails closed — that is the safe direction, but fix it before relying on card payments."}
          </p>
        </div>

        {live === true ? (
          <Button variant="danger" disabled={busy} onClick={() => void send(false)}>
            {busy ? "Turning off…" : "Turn off"}
          </Button>
        ) : (
          <Button variant="primary" disabled={busy} onClick={() => { setConfirming(true); setError(""); }}>
            Turn on
          </Button>
        )}
      </div>

      {confirming && live !== true && (
        <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: `1px solid ${T.borderFaint}` }}>
          <p style={{ margin: "0 0 12px", fontSize: "13px", color: T.ink2, lineHeight: 1.6 }}>
            After this, a guest paying by card is charged real money. Confirm with your own
            password — the one you signed in with.
          </p>
          <Field
            label="Your password" type="password" autoComplete="current-password"
            value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
          />
          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            <Button disabled={busy} onClick={() => { setConfirming(false); setPassword(""); setError(""); }}>
              Cancel
            </Button>
            <Button variant="primary" disabled={busy || !password} onClick={() => void send(true, password)}>
              {busy ? "Turning on…" : "Turn card payments on"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
