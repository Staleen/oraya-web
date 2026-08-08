"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { GuestTestimonialRecord } from "@/lib/guest-testimonials";
import { Badge, Banner, Button, Card, EmptyState, Field, PageHead, T } from "@/components/ops/ui";
import { CellInput, CellSelect, SetupGate } from "@/components/ops/setup-shared";

/**
 * Photos and testimonials — the /ops replacement for /admin/media.
 *
 * Reordering works with BUTTONS, not drag-and-drop: the legacy manager was
 * HTML5-drag only, which made cover images impossible to change from a phone
 * (audit ME-6). A failed move force-refetches so the screen snaps back to
 * server truth rather than showing an order that was never saved (ME-2).
 */

const GALLERIES = [
  { key: "general", label: "Site-wide" },
  { key: "mechmech", label: "Villa Mechmech" },
  { key: "byblos", label: "Villa Byblos" },
] as const;

const CATEGORIES = ["hero", "cover", "gallery", "interior", "exterior", "pool", "other"] as const;

interface MediaRow {
  id: string;
  villa: string;
  category: string | null;
  file_url: string;
  file_name: string;
  display_order: number | null;
}

export default function MediaPage() {
  const [gallery, setGallery] = useState<(typeof GALLERIES)[number]["key"]>("general");
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [ownerOnly, setOwnerOnly] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  // Testimonials live in the settings blob, not a table.
  const [testimonials, setTestimonials] = useState<GuestTestimonialRecord[] | null>(null);
  const [testimonialsDraft, setTestimonialsDraft] = useState<GuestTestimonialRecord[] | null>(null);
  const [testimonialsBusy, setTestimonialsBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [mediaRes, setupRes] = await Promise.all([
        fetch(`/api/ops/media?villa=${gallery}`, { credentials: "include", cache: "no-store" }),
        fetch("/api/ops/setup", { credentials: "include", cache: "no-store" }),
      ]);
      if (mediaRes.status === 403) { setOwnerOnly(true); return; }
      const mediaBody = (await mediaRes.json().catch(() => ({}))) as { ok?: boolean; media?: MediaRow[]; error?: string };
      if (!mediaRes.ok || !mediaBody.ok) {
        setLoadError(mediaBody.error ?? "Could not load the photos.");
        return;
      }
      setRows(mediaBody.media ?? []);
      const setupBody = (await setupRes.json().catch(() => ({}))) as { testimonials?: GuestTestimonialRecord[] };
      if (Array.isArray(setupBody.testimonials)) setTestimonials(setupBody.testimonials);
    } catch {
      setLoadError("Couldn't reach Oraya.");
    } finally {
      setLoading(false);
    }
  }, [gallery]);

  useEffect(() => { void load(); }, [load]);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy("upload");
    setError("");
    let failed = 0;
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      form.append("villa", gallery);
      form.append("category", "gallery");
      try {
        const r = await fetch("/api/ops/media", { method: "POST", credentials: "include", body: form });
        const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!r.ok || !body.ok) { failed += 1; setError(body.error ?? "A photo failed to upload."); }
      } catch { failed += 1; setError("Couldn't reach Oraya."); }
    }
    if (fileInput.current) fileInput.current.value = "";
    setBusy("");
    await load();
    if (failed === 0) setFlash(`${files.length} photo${files.length === 1 ? "" : "s"} added.`);
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next); // optimistic
    setBusy(`move:${rows[index].id}`);
    setError("");
    try {
      const r = await fetch("/api/ops/media", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: next.map((row, i) => ({ id: row.id, display_order: i })) }),
      });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !body.ok) {
        setError(body.error ?? "That order didn't save.");
        await load(); // ME-2: snap back to server truth
      }
    } catch {
      setError("Couldn't reach Oraya — the order wasn't saved.");
      await load();
    } finally {
      setBusy("");
    }
  }

  async function setCategory(row: MediaRow, category: string) {
    setBusy(`cat:${row.id}`);
    setError("");
    try {
      const r = await fetch("/api/ops/media", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, category }),
      });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !body.ok) { setError(body.error ?? "That didn't save."); return; }
      setRows((cur) => cur.map((x) => (x.id === row.id ? { ...x, category } : x)));
      setFlash(category === "cover" || category === "hero" ? "Cover updated — the site shows it now." : "Saved.");
    } catch {
      setError("Couldn't reach Oraya.");
    } finally {
      setBusy("");
    }
  }

  async function remove(row: MediaRow) {
    setBusy(`del:${row.id}`);
    setError("");
    try {
      const r = await fetch("/api/ops/media", {
        method: "DELETE", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, file_name: row.file_name }),
      });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; warning?: string };
      if (!r.ok || !body.ok) { setError(body.error ?? "That photo couldn't be removed."); return; }
      if (body.warning) setFlash(body.warning); else setFlash("Photo removed.");
      await load();
    } catch {
      setError("Couldn't reach Oraya.");
    } finally {
      setBusy("");
    }
  }

  async function saveTestimonials() {
    if (!testimonialsDraft) return;
    setTestimonialsBusy(true);
    setError("");
    try {
      const r = await fetch("/api/ops/setup/testimonials", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testimonials: testimonialsDraft }),
      });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !body.ok) { setError(body.error ?? "Testimonials didn't save."); return; }
      setTestimonials(testimonialsDraft);
      setTestimonialsDraft(null);
      setFlash("Testimonials saved.");
    } catch {
      setError("Couldn't reach Oraya.");
    } finally {
      setTestimonialsBusy(false);
    }
  }

  const gate = SetupGate({ loading: loading && rows.length === 0, loadError, ownerOnly, onRetry: load });
  const workingTestimonials = testimonialsDraft ?? testimonials ?? [];

  return (
    <>
      <PageHead title="Photos" sub="What guests see on the website" />

      {flash && <Banner tone="ok" title="Done" onDismiss={() => setFlash("")}>{flash}</Banner>}
      {error && <Banner tone="bad" title="Not saved" onDismiss={() => setError("")}>{error}</Banner>}

      {gate ?? (
        <>
          <div style={{ display: "flex", gap: "6px", marginBottom: "20px", flexWrap: "wrap" }}>
            {GALLERIES.map((g) => (
              <Button key={g.key} small variant={g.key === gallery ? "primary" : "ghost"} onClick={() => setGallery(g.key)}>
                {g.label}
              </Button>
            ))}
          </div>

          <Card title="Add photos">
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={busy === "upload"}
              onChange={(e) => void upload(e.target.files)}
              style={{ fontSize: "14px", color: T.ink2 }}
            />
            <p style={{ margin: "10px 0 0", fontSize: "12px", color: T.faint }}>
              JPG, PNG or WebP · up to 5 MB each · they appear at the end, then reorder below.
              {busy === "upload" && " Uploading…"}
            </p>
          </Card>

          <div style={{ marginTop: "20px" }}>
            {rows.length === 0 ? (
              <EmptyState reason="clear" message={loading ? "Loading…" : "No photos in this gallery yet."} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {rows.map((row, i) => (
                  <div key={row.id} style={{
                    background: T.surface, border: `1px solid ${T.borderFaint}`, borderRadius: T.r,
                    padding: "12px", display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap",
                  }}>
                    <div style={{ position: "relative", width: "84px", height: "60px", borderRadius: T.rSm, overflow: "hidden", flexShrink: 0, background: "rgba(0,0,0,.3)" }}>
                      <Image src={row.file_url} alt="" fill sizes="84px" style={{ objectFit: "cover" }} unoptimized />
                    </div>

                    <div style={{ flex: 1, minWidth: "min(100%,160px)" }}>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "12px", color: T.faint }}>#{i + 1}</span>
                        {(row.category === "cover" || row.category === "hero") && <Badge tone="gold">Cover</Badge>}
                      </div>
                      <div style={{ marginTop: "6px", maxWidth: "220px" }}>
                        <CellSelect
                          value={row.category ?? "other"}
                          disabled={busy === `cat:${row.id}`}
                          onChange={(e) => void setCategory(row, e.target.value)}
                        >
                          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                        </CellSelect>
                      </div>
                    </div>

                    {/* ME-6: buttons, so this works on a phone. */}
                    <div style={{ display: "flex", gap: "6px" }}>
                      <Button small disabled={i === 0 || busy !== ""} onClick={() => void move(i, -1)}>↑</Button>
                      <Button small disabled={i === rows.length - 1 || busy !== ""} onClick={() => void move(i, 1)}>↓</Button>
                      <Button small variant="danger" disabled={busy !== ""} onClick={() => void remove(row)}>Remove</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: "34px" }}>
            <Card title="Guest testimonials">
              <p style={{ margin: "0 0 16px", fontSize: "13px", color: T.muted, lineHeight: 1.6 }}>
                Only approved testimonials appear on the website.
              </p>
              {workingTestimonials.length === 0 && (
                <p style={{ fontSize: "13px", color: T.faint, margin: "0 0 14px" }}>None yet.</p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {workingTestimonials.map((t, i) => (
                  <div key={i} style={{ borderBottom: `1px solid ${T.borderFaint}`, paddingBottom: "14px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: "0 12px" }}>
                      <Field label="Guest" value={t.guest_label}
                        onChange={(e) => setTestimonialsDraft(workingTestimonials.map((x, xi) => xi === i ? { ...x, guest_label: e.target.value } : x))} />
                      <Field label="Villa" value={t.villa ?? ""}
                        onChange={(e) => setTestimonialsDraft(workingTestimonials.map((x, xi) => xi === i ? { ...x, villa: e.target.value } : x))} />
                    </div>
                    <label style={{ display: "block", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted, marginBottom: "6px" }}>
                      What they said
                    </label>
                    <textarea
                      value={t.quote} rows={2}
                      onChange={(e) => setTestimonialsDraft(workingTestimonials.map((x, xi) => xi === i ? { ...x, quote: e.target.value } : x))}
                      style={{
                        width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.05)",
                        border: `1px solid ${T.borderStrong}`, borderRadius: T.rSm, padding: "10px 12px",
                        fontFamily: T.sans, fontSize: "14px", color: T.ink, outline: "none", resize: "vertical", marginBottom: "10px",
                      }}
                    />
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                      <Button small variant={t.approved ? "primary" : "secondary"}
                        onClick={() => setTestimonialsDraft(workingTestimonials.map((x, xi) => xi === i ? { ...x, approved: !x.approved } : x))}>
                        {t.approved ? "Shown on the website" : "Hidden"}
                      </Button>
                      <Button small variant="ghost"
                        onClick={() => setTestimonialsDraft(workingTestimonials.filter((_, xi) => xi !== i))}>
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "16px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <Button small onClick={() => setTestimonialsDraft([
                  ...workingTestimonials,
                  { guest_label: "", villa: "", quote: "", reference_url: null, approved: false, display_order: workingTestimonials.length },
                ])}>
                  Add a testimonial
                </Button>
                {testimonialsDraft && (
                  <>
                    <Button small onClick={() => setTestimonialsDraft(null)}>Discard</Button>
                    <Button small variant="primary" disabled={testimonialsBusy} onClick={() => void saveTestimonials()}>
                      {testimonialsBusy ? "Saving…" : "Save testimonials"}
                    </Button>
                  </>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
