"use client";
import { useState } from "react";
import { Banner, Button, Card, Field, PageHead, Row, Rows, T } from "@/components/ops/ui";
import { useOps } from "@/components/ops/OpsProvider";

/**
 * Your own account: who you are signed in as, and the only place you change
 * your own password.
 *
 * Available to every role — an operator has to be able to change their own
 * password without asking the owner, or the shared-password habit comes back
 * through the side door.
 *
 * Two things are stated plainly because they surprise people otherwise: the
 * current password is required even though you are already signed in, and
 * changing it here does not sign out your other devices.
 */
const MIN_LENGTH = 12;

export default function AccountPage() {
  const { me } = useOps();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && next !== confirm;
  const ready = current.length > 0 && next.length >= MIN_LENGTH && next === confirm;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError("");
    setFlash("");
    try {
      const r = await fetch("/api/ops/change-password", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: current, new_password: next, confirm_password: confirm }),
      });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !body.ok) {
        setError(body.error ?? "That didn't save.");
        return;
      }
      setCurrent(""); setNext(""); setConfirm("");
      setFlash("Your password is changed. Use the new one next time you sign in.");
    } catch {
      setError("Couldn't reach Oraya. Your password was not changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title="Your account" sub="How you sign in to Oraya" />

      {flash && <Banner tone="ok" title="Saved" onDismiss={() => setFlash("")}>{flash}</Banner>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "20px", alignItems: "start" }}>
        <Card title="Signed in as">
          <Rows>
            <Row k="Name" v={me?.full_name ?? "—"} />
            <Row k="Email" v={me?.email ?? "—"} />
            <Row k="Role" v={me?.role === "owner" ? "Owner — full access" : "Operator — day-to-day access"} />
          </Rows>
          <p style={{ margin: "14px 0 0", fontSize: "12px", color: T.faint, lineHeight: 1.7 }}>
            This account is yours alone. Everything you do in Oraya is recorded against it,
            which is why it is never shared.
          </p>
        </Card>

        <Card title="Change your password">
          <form onSubmit={save}>
            {error && <Banner tone="bad" title="Not changed" onDismiss={() => setError("")}>{error}</Banner>}

            <Field
              label="Your current password" type="password" autoComplete="current-password"
              value={current} onChange={(e) => { setCurrent(e.target.value); setError(""); }}
              hint="Required even though you're signed in — it proves it's you at this keyboard."
            />
            <Field
              label="New password" type="password" autoComplete="new-password"
              value={next} onChange={(e) => { setNext(e.target.value); setError(""); }}
              hint={tooShort ? `At least ${MIN_LENGTH} characters — ${MIN_LENGTH - next.length} to go.` : `At least ${MIN_LENGTH} characters.`}
            />
            <Field
              label="Repeat the new password" type="password" autoComplete="new-password"
              value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(""); }}
              hint={mismatch ? "These two don't match yet." : undefined}
            />

            <Button type="submit" variant="primary" wide disabled={!ready || busy}>
              {busy ? "Changing…" : "Change password"}
            </Button>

            <p style={{ margin: "14px 0 0", fontSize: "12px", color: T.faint, lineHeight: 1.7 }}>
              This does not sign out your other devices. If you think someone else has your
              password, ask the owner to reset you from Team — that ends every session at once.
            </p>
          </form>
        </Card>
      </div>
    </>
  );
}
