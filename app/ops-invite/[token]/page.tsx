"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Banner, Button, Field, T } from "@/components/ops/ui";

/**
 * Where a one-time staff invite link lands. Deliberately OUTSIDE app/ops/ so
 * the auth shell cannot bounce an invitee to the sign-in form they don't yet
 * have a password for.
 *
 * The page never looks the token up before submit — an invalid link is only
 * revealed as such when someone actually tries to use it, so the URL space
 * cannot be probed for live invites.
 */
export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (password.length < 12) {
      setError("Choose a password of at least 12 characters.");
      return;
    }
    if (password !== repeat) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/ops/invite/accept", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !body.ok) {
        setError(body.error ?? "That didn't work. Try again.");
        return;
      }
      // The accept response already set the session cookie — straight to work.
      router.push("/ops");
    } catch {
      setError("Couldn't reach Oraya. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{
      background: T.navyDeep, minHeight: "100vh", display: "grid", placeItems: "center",
      padding: "24px", color: T.ink, fontFamily: T.sans,
    }}>
      <div style={{ width: "min(440px,100%)" }}>
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <div style={{ fontFamily: T.serif, fontSize: "26px", color: T.gold, letterSpacing: ".5px" }}>ORAYA</div>
          <div style={{ fontSize: "10px", letterSpacing: "2.6px", textTransform: "uppercase", color: T.faint, marginTop: "4px" }}>
            Operations
          </div>
        </div>

        <div style={{ background: T.surface, border: `1px solid ${T.borderFaint}`, borderRadius: T.rLg, padding: "26px" }}>
          <h1 style={{ fontFamily: T.serif, fontWeight: 400, fontSize: "22px", margin: "0 0 6px" }}>
            Welcome to the team
          </h1>
          <p style={{ fontSize: "14px", color: T.muted, margin: "0 0 20px", lineHeight: 1.6 }}>
            Choose the password you&apos;ll sign in with. Your invite link works once.
          </p>

          {error && <Banner tone="bad" title="Not set up yet">{error}</Banner>}

          <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <Field
              label="Password" type="password" autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              hint="At least 12 characters."
            />
            <Field
              label="Repeat password" type="password" autoComplete="new-password"
              value={repeat} onChange={(e) => setRepeat(e.target.value)}
            />
            <Button type="submit" variant="primary" wide disabled={busy}>
              {busy ? "Setting up…" : "Set password and sign in"}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
