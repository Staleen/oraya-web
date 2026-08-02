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
        </div>
      </form>
    </main>
  );
}
