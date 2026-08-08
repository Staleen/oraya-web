"use client";
import { useState } from "react";
import { Banner, Button, Field, T } from "@/components/ops/ui";
import { useOps, type Me } from "@/components/ops/OpsProvider";

export default function SignIn() {
  const { signIn } = useOps();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);

  /**
   * Owner recovery. The endpoint always answers the same way — it never says
   * whether a mail was sent, whether recovery is configured, or whether an
   * owner exists — so this button cannot be used to probe the account list.
   * The message below therefore describes what WOULD happen, and does not
   * claim an email went out.
   */
  async function requestRecovery() {
    setRecoveryBusy(true);
    setError("");
    try {
      await fetch("/api/ops/recovery/request", { method: "POST", cache: "no-store" });
    } catch {
      // Deliberately ignored: the response carries no information either way,
      // so a network failure must not be reported differently from success.
    } finally {
      setRecoveryBusy(false);
      setRecoverySent(true);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/ops/login", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await r.json()) as { error?: string; staff?: Me };
      if (!r.ok || !body.staff) {
        setError(body.error ?? "That email and password don't match.");
        return;
      }
      signIn(body.staff);
    } catch {
      setError("Couldn't reach Oraya. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ background: T.navyDeep, minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px" }}>
      <form onSubmit={submit} style={{ width: "min(400px,100%)" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontFamily: T.serif, fontSize: "26px", color: T.gold, letterSpacing: ".5px" }}>ORAYA</div>
          <div style={{ fontSize: "9px", letterSpacing: "2.6px", textTransform: "uppercase", color: T.faint, marginTop: "4px" }}>Operations</div>
        </div>
        <div style={{ background: T.surface, border: `1px solid ${T.borderFaint}`, borderRadius: T.rLg, padding: "28px" }}>
          {error && <Banner tone="bad" title="Couldn't sign you in">{error}</Banner>}
          <Field
            label="Email" type="email" autoComplete="username" required
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Password" type="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" variant="primary" wide disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>

          <div style={{ marginTop: "18px", paddingTop: "16px", borderTop: `1px solid ${T.borderFaint}`, textAlign: "center" }}>
            {recoverySent ? (
              <p style={{ margin: 0, fontSize: "12px", lineHeight: 1.7, color: T.muted }}>
                If the owner account can be recovered, a link is on its way to the recovery
                mailbox. It works once and expires in 30 minutes.
                <br />
                <b style={{ color: T.ink2 }}>Not the owner?</b> Ask the owner to reset you from the Team screen.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => void requestRecovery()}
                disabled={recoveryBusy}
                style={{
                  background: "none", border: 0, padding: 0,
                  color: T.muted, fontFamily: T.sans, fontSize: "12px",
                  textDecoration: "underline", textUnderlineOffset: "3px",
                  cursor: recoveryBusy ? "default" : "pointer",
                }}
              >
                {recoveryBusy ? "Sending…" : "Forgot your password?"}
              </button>
            )}
          </div>
        </div>
      </form>
    </main>
  );
}
