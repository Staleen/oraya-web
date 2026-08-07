"use client";
import { useCallback, useEffect, useState } from "react";
import { Badge, Banner, Button, Card, EmptyState, Field, Kicker, PageHead, T, type Tone } from "@/components/ops/ui";

/**
 * Owner-only team management over the finished /api/ops/staff API.
 *
 * Invite delivery is deliberately link-only for now: the invite result shows a
 * one-time link the owner sends however they like (WhatsApp, in person). The
 * link is shown exactly once — the server stores only a hash of it.
 *
 * The API owns the safety rules (owner-only access, last-owner lockout
 * protection, single-use hashed invites); this screen just surfaces them.
 */

interface StaffRow {
  id: string;
  email: string;
  full_name: string;
  role: "owner" | "operator";
  is_active: boolean;
  last_login_at: string | null;
  created_at: string | null;
  status: "active" | "invited" | "disabled";
  invite_expires_at: string | null;
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function statusBadge(s: StaffRow): { tone: Tone; label: string } {
  if (s.status === "invited") {
    const expired = s.invite_expires_at ? Date.parse(s.invite_expires_at) < Date.now() : false;
    return expired ? { tone: "bad", label: "Invite expired" } : { tone: "warn", label: "Invited — not set up yet" };
  }
  if (s.status === "disabled") return { tone: "neutral", label: "Disabled" };
  return { tone: "ok", label: "Active" };
}

export default function TeamPage() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [meId, setMeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [flash, setFlash] = useState("");

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [invName, setInvName] = useState("");
  const [invEmail, setInvEmail] = useState("");
  const [invRole, setInvRole] = useState<"operator" | "owner">("operator");
  const [invBusy, setInvBusy] = useState(false);
  const [invError, setInvError] = useState("");
  // The one-time link — held only until the dialog closes.
  const [inviteLink, setInviteLink] = useState<{ name: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/ops/staff", { credentials: "include", cache: "no-store" });
      const body = (await r.json().catch(() => ({}))) as { staff?: StaffRow[]; me?: string; error?: string };
      if (!r.ok || !body.staff) {
        setLoadError(body.error ?? "Could not load the team.");
        return;
      }
      setStaff(body.staff);
      setMeId(body.me ?? "");
      setLoadError("");
    } catch {
      setLoadError("Couldn't reach Oraya.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function patchStaff(id: string, body: Record<string, unknown>, done: string) {
    setBusyId(id);
    setActionError("");
    try {
      const r = await fetch(`/api/ops/staff/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const res = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !res.ok) {
        setActionError(res.error ?? "That didn't save.");
        return;
      }
      setFlash(done);
      await load();
    } catch {
      setActionError("Couldn't reach Oraya. Nothing was changed.");
    } finally {
      setBusyId("");
    }
  }

  async function removeStaff(s: StaffRow) {
    setBusyId(s.id);
    setActionError("");
    try {
      const r = await fetch(`/api/ops/staff/${s.id}`, { method: "DELETE", credentials: "include" });
      const res = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !res.ok) {
        setActionError(res.error ?? "Could not remove them.");
        return;
      }
      setFlash(`${s.full_name} removed.`);
      await load();
    } catch {
      setActionError("Couldn't reach Oraya. Nothing was changed.");
    } finally {
      setBusyId("");
    }
  }

  async function invite() {
    if (invName.trim().length < 2) { setInvError("Give this person a name."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(invEmail.trim())) { setInvError("That doesn't look like an email address."); return; }
    setInvBusy(true);
    setInvError("");
    try {
      const r = await fetch("/api/ops/staff", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: invEmail.trim(), full_name: invName.trim(), role: invRole }),
      });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; invite_token?: string };
      if (!r.ok || !body.ok || !body.invite_token) {
        setInvError(body.error ?? "Could not create the invite.");
        return;
      }
      setInviteLink({
        name: invName.trim(),
        url: `${window.location.origin}/ops-invite/${body.invite_token}`,
      });
      setCopied(false);
      setInvName(""); setInvEmail(""); setInvRole("operator");
      await load();
    } catch {
      setInvError("Couldn't reach Oraya. Nothing was created.");
    } finally {
      setInvBusy(false);
    }
  }

  return (
    <>
      <PageHead title="Team" sub="Who can work in this console, and as what" />

      {flash && <Banner tone="ok" title="Done" onDismiss={() => setFlash("")}>{flash}</Banner>}
      {actionError && <Banner tone="bad" title="Not saved" onDismiss={() => setActionError("")}>{actionError}</Banner>}

      {loadError ? (
        <EmptyState reason="load-failed" message="We couldn't load the team, so this list is not to be trusted." onRetry={() => void load()} />
      ) : (
        <>
          <div style={{ marginBottom: "22px" }}>
            {!showInvite ? (
              <Button variant="primary" onClick={() => { setShowInvite(true); setInvError(""); }}>
                Invite someone…
              </Button>
            ) : (
              <Card title="Invite someone">
                {invError && <Banner tone="bad" title="Not created">{invError}</Banner>}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "0 14px" }}>
                  <Field label="Full name" value={invName} disabled={invBusy}
                    onChange={(e) => setInvName(e.target.value)} />
                  <Field label="Email" type="email" value={invEmail} disabled={invBusy}
                    onChange={(e) => setInvEmail(e.target.value)} hint="Used to sign in — no email is sent." />
                </div>
                <div style={{ marginBottom: "18px" }}>
                  <label style={{ display: "block", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted, marginBottom: "6px" }}>
                    Role
                  </label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <Button small variant={invRole === "operator" ? "primary" : "secondary"} onClick={() => setInvRole("operator")}>
                      Operator — day-to-day work
                    </Button>
                    <Button small variant={invRole === "owner" ? "primary" : "secondary"} onClick={() => setInvRole("owner")}>
                      Owner — everything, including pricing and payments
                    </Button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                  <Button onClick={() => setShowInvite(false)}>Cancel</Button>
                  <Button variant="primary" disabled={invBusy} onClick={() => void invite()}>
                    {invBusy ? "Creating…" : "Create invite link"}
                  </Button>
                </div>
              </Card>
            )}
          </div>

          <Kicker count={staff.length}>People</Kicker>
          {staff.length === 0 ? (
            <EmptyState reason={loading ? "clear" : "clear"} message={loading ? "Loading…" : "No one yet."} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {staff.map((s) => {
                const b = statusBadge(s);
                const isMe = s.id === meId;
                const busy = busyId === s.id;
                return (
                  <div key={s.id} style={{
                    background: T.surface, border: `1px solid ${T.borderFaint}`, borderRadius: T.r,
                    padding: "16px 18px", display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap",
                  }}>
                    <div style={{ flex: 1, minWidth: "min(100%,240px)" }}>
                      <p style={{ fontSize: "15px", margin: "0 0 3px" }}>
                        <b>{s.full_name}</b>{isMe && <span style={{ color: T.faint }}> — you</span>}
                      </p>
                      <p style={{ fontSize: "13px", color: T.muted, margin: 0 }}>
                        {s.email} · {s.role === "owner" ? "Owner" : "Operator"} · last signed in {ago(s.last_login_at)}
                      </p>
                    </div>
                    <Badge tone={b.tone}>{b.label}</Badge>
                    {!isMe && (
                      <div style={{ display: "flex", gap: "8px", flexShrink: 0, flexWrap: "wrap" }}>
                        {s.status === "active" && (
                          <>
                            <Button small disabled={busy} onClick={() =>
                              void patchStaff(s.id, { role: s.role === "owner" ? "operator" : "owner" },
                                `${s.full_name} is now ${s.role === "owner" ? "an operator" : "an owner"}.`)
                            }>
                              Make {s.role === "owner" ? "operator" : "owner"}
                            </Button>
                            <Button small variant="danger" disabled={busy} onClick={() =>
                              void patchStaff(s.id, { is_active: false }, `${s.full_name} can no longer sign in.`)
                            }>
                              Disable
                            </Button>
                          </>
                        )}
                        {s.status === "disabled" && (
                          <Button small disabled={busy} onClick={() =>
                            void patchStaff(s.id, { is_active: true }, `${s.full_name} can sign in again.`)
                          }>
                            Re-enable
                          </Button>
                        )}
                        {(s.status === "invited" || s.status === "disabled") && (
                          <Button small variant="danger" disabled={busy} onClick={() => void removeStaff(s)}>
                            Remove
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {inviteLink && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget && copied) setInviteLink(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(10,15,20,.72)", display: "grid", placeItems: "center", padding: "20px", zIndex: 80 }}
        >
          <div role="dialog" aria-modal="true" style={{
            background: T.navyLift, border: `1px solid ${T.border}`, borderRadius: T.rLg,
            width: "min(560px,100%)", padding: "24px",
          }}>
            <h2 style={{ fontFamily: T.serif, fontWeight: 400, fontSize: "22px", margin: "0 0 6px" }}>
              Send this link to {inviteLink.name}
            </h2>
            <p style={{ fontSize: "13px", color: T.muted, margin: "0 0 16px", lineHeight: 1.6 }}>
              It works once, expires in 7 days, and is shown only now — Oraya keeps no readable copy.
              Send it over WhatsApp or in person.
            </p>
            <div style={{
              background: "rgba(0,0,0,.25)", border: `1px solid ${T.borderStrong}`, borderRadius: T.rSm,
              padding: "12px 14px", fontFamily: "ui-monospace,monospace", fontSize: "12px",
              wordBreak: "break-all", marginBottom: "16px", color: T.gold,
            }}>
              {inviteLink.url}
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <Button
                variant="primary"
                onClick={() => {
                  void navigator.clipboard.writeText(inviteLink.url).then(() => setCopied(true));
                }}
              >
                {copied ? "Copied ✓" : "Copy link"}
              </Button>
              <Button onClick={() => setInviteLink(null)}>
                {copied ? "Done" : "Close without copying"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
