"use client";

import type { Dispatch, SetStateAction } from "react";
import type { GuestTestimonialRecord } from "@/lib/guest-testimonials";
import { GOLD, CHARCOAL, MUTED, LATO, BORDER, SURFACE, fieldStyle } from "./theme";

function nextDisplayOrder(rows: GuestTestimonialRecord[]): number {
  return rows.reduce(
    (m, r) => Math.max(m, typeof r.display_order === "number" && Number.isFinite(r.display_order) ? r.display_order : -1),
    -1
  ) + 1;
}

function emptyRow(order: number): GuestTestimonialRecord {
  return {
    guest_label: "",
    villa: "",
    quote: "",
    reference_url: "",
    approved: false,
    display_order: order,
  };
}

export default function TestimonialManager({
  rows,
  setRows,
  onSave,
  saving,
  saved,
}: {
  rows: GuestTestimonialRecord[];
  setRows: Dispatch<SetStateAction<GuestTestimonialRecord[]>>;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  const isMobile = typeof window !== "undefined" ? window.innerWidth <= 768 : false;
  function updateRow(index: number, patch: Partial<GuestTestimonialRecord>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(nextDisplayOrder(prev))]);
  }

  return (
    <div style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: isMobile ? "1rem" : "1.75rem", marginBottom: "2rem" }}>
      <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 0.5rem" }}>
        Guest testimonials
      </p>
      <p style={{ fontFamily: LATO, fontSize: "12px", color: CHARCOAL, margin: "0 0 6px", lineHeight: 1.55, fontWeight: 600 }}>
        Only approved testimonials appear publicly.
      </p>
      <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "0 0 1rem", lineHeight: 1.65 }}>
        Stored in settings as <code style={{ color: CHARCOAL }}>guest_testimonials</code>. Toggle Approved only after you have permission to publish. Do not invent reviews.
      </p>

      <div style={{ display: "grid", gap: "14px", marginBottom: "14px" }}>
        {rows.length === 0 ? (
          <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: 0 }}>No testimonials yet. Use &quot;Add testimonial&quot; to create a draft.</p>
        ) : (
          rows.map((row, index) => (
            <div
              key={`${index}-${row.display_order ?? 0}`}
              style={{
                border: `0.5px solid ${BORDER}`,
                padding: "12px",
                borderRadius: "6px",
                display: "grid",
                gap: "10px",
                backgroundColor: "rgba(255,255,255,0.02)",
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", color: GOLD }}>
                  Testimonial {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  style={{
                    fontFamily: LATO,
                    fontSize: "10px",
                    letterSpacing: "1px",
                    textTransform: "uppercase",
                    color: "#e07070",
                    backgroundColor: "transparent",
                    border: "0.5px solid rgba(224,112,112,0.35)",
                    padding: "6px 12px",
                    cursor: "pointer",
                    borderRadius: "4px",
                  }}
                >
                  Remove
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                <label style={{ flex: "1", minWidth: "140px", display: "grid", gap: "4px" }}>
                  <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED }}>Guest name / initials</span>
                  <input
                    type="text"
                    value={row.guest_label}
                    onChange={(e) => updateRow(index, { guest_label: e.target.value })}
                    style={fieldStyle}
                    placeholder="e.g. A.D."
                  />
                </label>
                <label style={{ flex: "1", minWidth: "140px", display: "grid", gap: "4px" }}>
                  <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED }}>Villa</span>
                  <input
                    type="text"
                    value={row.villa ?? ""}
                    onChange={(e) => updateRow(index, { villa: e.target.value })}
                    style={fieldStyle}
                    placeholder="Optional"
                  />
                </label>
                <label style={{ width: isMobile ? "100%" : "100px", display: "grid", gap: "4px" }}>
                  <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED }}>Order</span>
                  <input
                    type="number"
                    value={row.display_order ?? 0}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      updateRow(index, { display_order: Number.isFinite(n) ? n : 0 });
                    }}
                    style={fieldStyle}
                    min={0}
                  />
                </label>
              </div>
              <label style={{ display: "grid", gap: "4px" }}>
                <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED }}>Testimonial text</span>
                <textarea
                  value={row.quote}
                  onChange={(e) => updateRow(index, { quote: e.target.value })}
                  rows={4}
                  style={{ ...fieldStyle, width: "100%", resize: "vertical", fontFamily: LATO, fontSize: "12px" }}
                  placeholder="Quote with guest permission…"
                />
              </label>
              <label style={{ display: "grid", gap: "4px" }}>
                <span style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED }}>Reference URL (optional)</span>
                <input
                  type="url"
                  value={row.reference_url ?? ""}
                  onChange={(e) => updateRow(index, { reference_url: e.target.value })}
                  style={fieldStyle}
                  placeholder="https://…"
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={Boolean(row.approved)}
                  onChange={(e) => updateRow(index, { approved: e.target.checked })}
                />
                <span style={{ fontFamily: LATO, fontSize: "12px", color: CHARCOAL }}>Approved (show on homepage)</span>
              </label>
            </div>
          ))
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", marginBottom: "12px" }}>
        <button
          type="button"
          onClick={addRow}
          style={{
            fontFamily: LATO,
            fontSize: "10px",
            letterSpacing: "2px",
            textTransform: "uppercase",
            color: GOLD,
            backgroundColor: "transparent",
            border: "0.5px solid rgba(197,164,109,0.4)",
            padding: "10px 18px",
            cursor: "pointer",
            borderRadius: "4px",
          }}
        >
          Add testimonial
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          style={{
            fontFamily: LATO,
            fontSize: "10px",
            letterSpacing: "2px",
            textTransform: "uppercase",
            color: CHARCOAL,
            backgroundColor: GOLD,
            border: "none",
            padding: "10px 22px",
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1,
            borderRadius: "4px",
          }}
        >
          {saving ? "Saving…" : "Save testimonials"}
        </button>
        {saved && (
          <span style={{ fontFamily: LATO, fontSize: "11px", color: "#6fcf8a", letterSpacing: "1px" }}>Saved</span>
        )}
      </div>
    </div>
  );
}
