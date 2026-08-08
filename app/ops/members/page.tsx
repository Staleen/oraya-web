"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Banner, Button, Card, EmptyState, Field, PageHead, T } from "@/components/ops/ui";
import { CellInput } from "@/components/ops/setup-shared";

/**
 * Members — people with an Oraya account.
 *
 * Audit M-4: searchable, because the list only grows. M-6: editable, because
 * a wrong phone number used to need SQL. M-5: the delete names how many
 * bookings detach, before the click.
 */

interface Member {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string | null;
  booking_count: number;
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [ownerOnly, setOwnerOnly] = useState(false);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Member | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/ops/members", { credentials: "include", cache: "no-store" });
      if (r.status === 403) { setOwnerOnly(true); return; }
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; members?: Member[]; error?: string };
      if (!r.ok || !body.ok) { setLoadError(body.error ?? "Could not load the members."); return; }
      setMembers(body.members ?? []);
      setLoadError("");
    } catch {
      setLoadError("Couldn't reach Oraya.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return members;
    return members.filter((m) =>
      [(m.full_name ?? "").toLowerCase(), (m.email ?? "").toLowerCase(), (m.phone ?? "").replace(/\D/g, "")]
        .some((h) => h.includes(term)),
    );
  }, [members, q]);

  async function saveEdit(m: Member) {
    setBusy(m.id);
    setError("");
    try {
      const r = await fetch(`/api/ops/members/${m.id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: editName, phone: editPhone }),
      });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !body.ok) { setError(body.error ?? "That didn't save."); return; }
      setEditing(null);
      setFlash("Member updated.");
      await load();
    } catch {
      setError("Couldn't reach Oraya.");
    } finally {
      setBusy("");
    }
  }

  async function remove(m: Member) {
    setBusy(m.id);
    setError("");
    try {
      const r = await fetch(`/api/ops/members/${m.id}`, { method: "DELETE", credentials: "include" });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !body.ok) { setError(body.error ?? "They could not be removed."); return; }
      setConfirmDelete(null);
      setFlash(`${m.full_name ?? "Member"} removed. Their bookings are still here, without an account attached.`);
      await load();
    } catch {
      setError("Couldn't reach Oraya.");
    } finally {
      setBusy("");
    }
  }

  if (ownerOnly) {
    return (
      <>
        <PageHead title="Members" sub="People with an Oraya account" />
        <EmptyState reason="clear" message="Member accounts are managed by the owner." />
      </>
    );
  }

  return (
    <>
      <PageHead title="Members" sub={`${members.length} ${members.length === 1 ? "person" : "people"} with an account`} />

      {flash && <Banner tone="ok" title="Done" onDismiss={() => setFlash("")}>{flash}</Banner>}
      {error && <Banner tone="bad" title="Not saved" onDismiss={() => setError("")}>{error}</Banner>}

      <Field label="Search" placeholder="Name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} />

      {filtered.length === 0 ? (
        <EmptyState
          reason={loadError ? "load-failed" : "clear"}
          message={loadError ? "We couldn't load members, so this list is not to be trusted."
            : loading ? "Loading…" : q ? `Nobody matches “${q}”.` : "No members yet."}
          onRetry={loadError ? () => void load() : undefined}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {filtered.map((m) => (
            <div key={m.id} style={{
              background: T.surface, border: `1px solid ${T.borderFaint}`, borderRadius: T.r, padding: "14px 16px",
            }}>
              {editing === m.id ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: "0 12px", alignItems: "end" }}>
                  <label style={{ fontSize: "10px", letterSpacing: "1.6px", textTransform: "uppercase", color: T.muted }}>
                    Name
                    <CellInput style={{ marginTop: "6px" }} value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </label>
                  <label style={{ fontSize: "10px", letterSpacing: "1.6px", textTransform: "uppercase", color: T.muted }}>
                    Phone
                    <CellInput style={{ marginTop: "6px" }} value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                  </label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <Button small onClick={() => setEditing(null)}>Cancel</Button>
                    <Button small variant="primary" disabled={busy === m.id} onClick={() => void saveEdit(m)}>
                      {busy === m.id ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: "min(100%,220px)" }}>
                    <p style={{ margin: "0 0 3px", fontSize: "15px" }}><b>{m.full_name ?? "Unnamed member"}</b></p>
                    <p style={{ margin: 0, fontSize: "13px", color: T.muted }}>
                      {m.email ?? "no email"}{m.phone ? ` · ${m.phone}` : ""}
                    </p>
                  </div>
                  <Badge tone={m.booking_count > 0 ? "info" : "neutral"}>
                    {m.booking_count} booking{m.booking_count === 1 ? "" : "s"}
                  </Badge>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <Button small onClick={() => { setEditing(m.id); setEditName(m.full_name ?? ""); setEditPhone(m.phone ?? ""); }}>
                      Edit
                    </Button>
                    <Button small variant="danger" onClick={() => setConfirmDelete(m)}>Remove</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(10,15,20,.72)", display: "grid", placeItems: "center", padding: "20px", zIndex: 80 }}
        >
          <div role="dialog" aria-modal="true" style={{
            background: T.navyLift, border: `1px solid ${T.border}`, borderRadius: T.rLg, width: "min(520px,100%)", padding: "24px",
          }}>
            <h2 style={{ fontFamily: T.serif, fontWeight: 400, fontSize: "22px", margin: "0 0 8px" }}>
              Remove {confirmDelete.full_name ?? "this member"}?
            </h2>
            <p style={{ margin: "0 0 18px", fontSize: "14px", color: T.muted, lineHeight: 1.7 }}>
              They will no longer be able to sign in.
              {confirmDelete.booking_count > 0
                ? ` Their ${confirmDelete.booking_count} booking${confirmDelete.booking_count === 1 ? "" : "s"} stay in Oraya, but will no longer be attached to an account.`
                : " They have no bookings."}
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <Button onClick={() => setConfirmDelete(null)}>Keep them</Button>
              <Button variant="danger" disabled={busy === confirmDelete.id} onClick={() => void remove(confirmDelete)}>
                {busy === confirmDelete.id ? "Removing…" : "Remove them"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
