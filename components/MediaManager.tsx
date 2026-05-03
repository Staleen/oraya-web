"use client";
import { useState, useEffect, useRef, DragEvent } from "react";
import { SkeletonBlock } from "@/components/LoadingSkeleton";
import { adminApiFetchInit } from "@/lib/admin-auth";

const GOLD     = "#C5A46D";
const WHITE    = "#FFFFFF";
const MIDNIGHT = "#1F2B38";
const CHARCOAL = "#2E2E2E";
const MUTED    = "#8a8070";
const LATO     = "'Lato', system-ui, sans-serif";
const PLAYFAIR = "'Playfair Display', Georgia, serif";
const SURFACE  = "rgba(255,255,255,0.03)";
const BORDER   = "rgba(197,164,109,0.12)";

const CATEGORIES = [
  "exterior", "pool", "bedroom", "garden",
  "dining", "terrace", "interior", "other",
];

type VillaKey = "mechmech" | "byblos" | "general";

const VILLAS: { key: VillaKey; label: string }[] = [
  { key: "mechmech", label: "Villa Mechmech" },
  { key: "byblos",   label: "Villa Byblos" },
  { key: "general",  label: "General / Hero" },
];

interface VillaMedia {
  id: string;
  villa: string;
  category: string;
  file_url: string;
  file_name: string;
  display_order: number;
  created_at: string;
}

export default function MediaManager() {
  const [activeVilla, setActiveVilla] = useState<VillaKey>("mechmech");
  const [media, setMedia]             = useState<Record<string, VillaMedia[]>>({});
  const [loading, setLoading]         = useState(false);
  const [uploading, setUploading]     = useState(false);
  const [upProgress, setUpProgress]   = useState({ done: 0, total: 0 });
  const [errors, setErrors]           = useState<string[]>([]);
  const [fileDropActive, setFileDropActive] = useState(false);
  const [draggingId, setDraggingId]   = useState<string | null>(null);
  const [dragOverId, setDragOverId]   = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loaded       = useRef<Record<string, boolean>>({});

  useEffect(() => {
    loadMedia(activeVilla);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVilla]);

  async function loadMedia(villa: VillaKey) {
    if (loaded.current[villa]) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/admin/media?villa=${villa}`, adminApiFetchInit);
      const data = await res.json();
      if (res.ok) {
        setMedia((prev) => ({ ...prev, [villa]: data.media ?? [] }));
        loaded.current[villa] = true;
      } else {
        setErrors((prev) => [...prev, data.error ?? "Failed to load media"]);
      }
    } finally {
      setLoading(false);
    }
  }

  // ── File handling ──────────────────────────────────────────────────────────

  async function handleFiles(files: FileList | File[]) {
    const arr    = Array.from(files);
    const valid: File[] = [];
    const errs:  string[] = [];

    for (const f of arr) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
        errs.push(`${f.name}: unsupported type — use jpg, png, or webp`);
      } else if (f.size > 5 * 1024 * 1024) {
        errs.push(`${f.name}: exceeds 5 MB limit`);
      } else {
        valid.push(f);
      }
    }

    if (errs.length) setErrors((prev) => [...prev, ...errs]);
    if (!valid.length) return;

    setUploading(true);
    setUpProgress({ done: 0, total: valid.length });

    for (const file of valid) {
      const fd = new FormData();
      fd.append("file",     file);
      fd.append("villa",    activeVilla);
      fd.append("category", "other");

      const res  = await fetch("/api/admin/media", { ...adminApiFetchInit, method: "POST", body: fd });
      const data = await res.json();

      if (res.ok && data.media) {
        setMedia((prev) => ({
          ...prev,
          [activeVilla]: [...(prev[activeVilla] ?? []), data.media],
        }));
      } else {
        setErrors((prev) => [...prev, `${file.name}: ${data.error ?? "Upload failed"}`]);
      }

      setUpProgress((prev) => ({ ...prev, done: prev.done + 1 }));
    }

    setUploading(false);
    setUpProgress({ done: 0, total: 0 });
  }

  // ── Upload zone drag events ────────────────────────────────────────────────

  function onZoneDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (Array.from(e.dataTransfer.types).includes("Files")) setFileDropActive(true);
  }
  function onZoneDragLeave(e: DragEvent) {
    e.preventDefault();
    setFileDropActive(false);
  }
  function onZoneDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setFileDropActive(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }

  // ── Thumbnail drag-to-reorder ──────────────────────────────────────────────

  function onThumbDragStart(e: DragEvent, id: string) {
    e.stopPropagation();
    e.dataTransfer.setData("thumb-id", id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(id);
  }
  function onThumbDragOver(e: DragEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (id !== dragOverId) setDragOverId(id);
  }
  function onThumbDrop(e: DragEvent, targetId: string) {
    e.preventDefault();
    e.stopPropagation();
    const fromId = e.dataTransfer.getData("thumb-id");
    if (!fromId || fromId === targetId) { resetDrag(); return; }

    const items   = [...(media[activeVilla] ?? [])];
    const fromIdx = items.findIndex((m) => m.id === fromId);
    const toIdx   = items.findIndex((m) => m.id === targetId);
    if (fromIdx === -1 || toIdx === -1) { resetDrag(); return; }

    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);
    const reordered = items.map((m, i) => ({ ...m, display_order: i + 1 }));

    setMedia((prev) => ({ ...prev, [activeVilla]: reordered }));
    resetDrag();

    fetch("/api/admin/media", {
      ...adminApiFetchInit,
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates: reordered.map((m) => ({ id: m.id, display_order: m.display_order })) }),
    }).catch(() => {});
  }
  function resetDrag() { setDraggingId(null); setDragOverId(null); }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async function handleDelete(id: string, file_name: string) {
    if (!confirm("Delete this photo permanently?")) return;
    const res = await fetch("/api/admin/media", {
      ...adminApiFetchInit,
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, file_name }),
    });
    if (res.ok) {
      setMedia((prev) => ({
        ...prev,
        [activeVilla]: (prev[activeVilla] ?? []).filter((m) => m.id !== id),
      }));
    } else {
      const d = await res.json();
      setErrors((prev) => [...prev, d.error ?? "Delete failed"]);
    }
  }

  // ── Category change ────────────────────────────────────────────────────────

  async function handleCategoryChange(id: string, category: string) {
    setMedia((prev) => ({
      ...prev,
      [activeVilla]: (prev[activeVilla] ?? []).map((m) => m.id === id ? { ...m, category } : m),
    }));
    await fetch("/api/admin/media", {
      ...adminApiFetchInit,
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, category }),
    });
  }

  const currentMedia = media[activeVilla] ?? [];

  return (
    <div style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: "1.75rem", marginBottom: "2rem" }}>
      {/* ── Section header ── */}
      <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 1.5rem" }}>
        Media Manager
      </p>

      {/* ── Villa tabs ── */}
      <div style={{ display: "flex", gap: 0, borderBottom: `0.5px solid ${BORDER}`, marginBottom: "1.5rem" }}>
        {VILLAS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveVilla(key)}
            style={{
              fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
              textTransform: "uppercase",
              color: activeVilla === key ? GOLD : MUTED,
              backgroundColor: "transparent", border: "none",
              borderBottom: activeVilla === key ? `1.5px solid ${GOLD}` : "1.5px solid transparent",
              padding: "8px 0", marginRight: "1.75rem",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Upload zone ── */}
      <div
        onDragOver={onZoneDragOver}
        onDragLeave={onZoneDragLeave}
        onDrop={onZoneDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        style={{
          border: `1px dashed ${fileDropActive ? GOLD : "rgba(197,164,109,0.3)"}`,
          backgroundColor: fileDropActive ? "rgba(197,164,109,0.05)" : "rgba(255,255,255,0.02)",
          borderRadius: "2px",
          padding: "2rem",
          textAlign: "center",
          cursor: uploading ? "not-allowed" : "pointer",
          transition: "border-color 0.15s, background 0.15s",
          marginBottom: "1rem",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          style={{ display: "none" }}
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />

        {uploading ? (
          <div>
            <p style={{ fontFamily: LATO, fontSize: "12px", color: GOLD, margin: "0 0 6px" }}>
              Uploading {upProgress.done + 1} of {upProgress.total}…
            </p>
            <div style={{ width: "100%", maxWidth: "240px", margin: "0 auto", height: "2px", backgroundColor: "rgba(197,164,109,0.15)", borderRadius: "1px" }}>
              <div style={{
                height: "100%",
                borderRadius: "1px",
                backgroundColor: GOLD,
                width: `${upProgress.total ? ((upProgress.done / upProgress.total) * 100) : 0}%`,
                transition: "width 0.2s",
              }} />
            </div>
          </div>
        ) : (
          <>
            {/* Desktop label */}
            <p style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "1.5px", color: MUTED, margin: "0 0 6px" }}>
              <span style={{ display: "none" }} className="md:inline">Drag photos here or click to upload</span>
              <span style={{ fontFamily: LATO, fontSize: "12px", letterSpacing: "1.5px", color: MUTED }}>
                Drag photos here or click to upload
              </span>
            </p>
            <p style={{ fontFamily: LATO, fontSize: "10px", color: "rgba(138,128,112,0.5)", margin: 0 }}>
              JPG, PNG, WEBP · max 5 MB per file
            </p>
            <button
              style={{
                marginTop: "12px",
                fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
                textTransform: "uppercase", color: CHARCOAL,
                backgroundColor: GOLD, border: "none",
                padding: "10px 28px", cursor: "pointer",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#d4b98a"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = GOLD; }}
            >
              Upload Photos
            </button>
          </>
        )}
      </div>

      {/* ── Error messages ── */}
      {errors.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          {errors.map((err, i) => (
            <p key={i} style={{ fontFamily: LATO, fontSize: "11px", color: "#e07070", margin: "0 0 4px" }}>
              ⚠ {err}
            </p>
          ))}
          <button
            onClick={() => setErrors([])}
            style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: "4px" }}
          >
            Clear errors
          </button>
        </div>
      )}

      {/* ── Thumbnail grid ── */}
      {loading ? (
        <div
          aria-hidden="true"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: "8px",
          }}
        >
          {Array.from({ length: 8 }).map((_, item) => (
            <div key={item} style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `0.5px solid ${BORDER}`, padding: "8px" }}>
              <SkeletonBlock height="120px" style={{ marginBottom: "10px" }} />
              <SkeletonBlock width="68px" height="22px" />
            </div>
          ))}
        </div>
      ) : currentMedia.length === 0 ? (
        <p style={{ fontFamily: LATO, fontSize: "12px", color: "rgba(138,128,112,0.45)", textAlign: "center", padding: "1.5rem 0" }}>
          No photos yet for this villa. Upload some above.
        </p>
      ) : (
        <>
          <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", color: MUTED, marginBottom: "1rem" }}>
            {currentMedia.length} photo{currentMedia.length !== 1 ? "s" : ""} · drag to reorder · first image is the cover
          </p>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: "8px",
          }}>
            {currentMedia.map((item, idx) => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => onThumbDragStart(e, item.id)}
                onDragOver={(e)  => onThumbDragOver(e, item.id)}
                onDrop={(e)      => onThumbDrop(e, item.id)}
                onDragEnd={resetDrag}
                style={{
                  position: "relative",
                  border: dragOverId === item.id
                    ? `1.5px solid ${GOLD}`
                    : draggingId === item.id
                    ? "1.5px dashed rgba(197,164,109,0.4)"
                    : "1.5px solid transparent",
                  opacity: draggingId === item.id ? 0.5 : 1,
                  cursor: "grab",
                  backgroundColor: "rgba(255,255,255,0.03)",
                  transition: "border-color 0.1s, opacity 0.1s",
                  userSelect: "none",
                }}
              >
                {/* Image */}
                <div style={{ position: "relative", paddingBottom: "75%", overflow: "hidden" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.file_url}
                    alt={item.category}
                    draggable={false}
                    style={{
                      position: "absolute", inset: 0,
                      width: "100%", height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                  {/* Cover badge */}
                  {idx === 0 && (
                    <span style={{
                      position: "absolute", top: "6px", left: "6px",
                      fontFamily: LATO, fontSize: "8px", letterSpacing: "1.5px",
                      textTransform: "uppercase", color: CHARCOAL,
                      backgroundColor: GOLD, padding: "3px 8px",
                    }}>
                      Cover
                    </span>
                  )}
                  {/* Delete button */}
                  <button
                    draggable={false}
                    onClick={(e) => { e.stopPropagation(); handleDelete(item.id, item.file_name); }}
                    style={{
                      position: "absolute", top: "6px", right: "6px",
                      width: "24px", height: "24px",
                      backgroundColor: "rgba(0,0,0,0.6)",
                      border: "none", borderRadius: "50%",
                      color: WHITE, cursor: "pointer",
                      fontSize: "13px", lineHeight: "24px", textAlign: "center",
                      padding: 0,
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(224,112,112,0.85)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(0,0,0,0.6)"; }}
                    title="Delete photo"
                  >
                    ×
                  </button>
                  {/* Order badge */}
                  <span style={{
                    position: "absolute", bottom: "6px", right: "6px",
                    fontFamily: LATO, fontSize: "9px", letterSpacing: "1px",
                    color: "rgba(255,255,255,0.6)",
                    backgroundColor: "rgba(0,0,0,0.45)",
                    padding: "2px 6px",
                  }}>
                    #{item.display_order}
                  </span>
                </div>

                {/* Category dropdown */}
                <div style={{ padding: "6px 8px", backgroundColor: "rgba(0,0,0,0.25)" }}>
                  <select
                    value={item.category}
                    onChange={(e) => handleCategoryChange(item.id, e.target.value)}
                    draggable={false}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: "100%",
                      fontFamily: LATO, fontSize: "10px", letterSpacing: "1px",
                      textTransform: "capitalize",
                      backgroundColor: "rgba(255,255,255,0.07)",
                      color: MUTED, border: `0.5px solid ${BORDER}`,
                      padding: "5px 8px", outline: "none", cursor: "pointer",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
                    onBlur={(e)  => { e.currentTarget.style.borderColor = BORDER; }}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c} style={{ backgroundColor: MIDNIGHT }}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
