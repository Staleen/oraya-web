"use client";
import { useEffect, useState } from "react";
import SettingsSections from "@/components/admin/SettingsSections";
import TestimonialManager from "@/components/admin/TestimonialManager";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { BORDER, CHARCOAL, GOLD, LATO, MUTED, SURFACE, WHITE } from "@/components/admin/theme";
import { adminApiFetchInit } from "@/lib/admin-auth";
import type { GuestTestimonialRecord } from "@/lib/guest-testimonials";
import { GUEST_TESTIMONIALS_SETTINGS_KEY, parseGuestTestimonialsJson } from "@/lib/guest-testimonials";
import {
  INSTANT_BOOKING_SETTING_KEYS,
  parseInstantBookingSetting,
  type InstantBookingFlags,
} from "@/lib/instant-booking-settings";

export default function AdminSettingsPage() {
  const { error, setError } = useAdminData();
  const [whatsappNum, setWhatsappNum] = useState("");
  const [whatsappSaving, setWhatsappSaving] = useState(false);
  const [whatsappSaved, setWhatsappSaved] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [notifEmails, setNotifEmails] = useState("");
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);
  const [testimonialRows, setTestimonialRows] = useState<GuestTestimonialRecord[]>([]);
  const [testimonialSaving, setTestimonialSaving] = useState(false);
  const [testimonialSaved, setTestimonialSaved] = useState(false);
  const [instantBookingAdmin, setInstantBookingAdmin] = useState<InstantBookingFlags>({
    "Villa Mechmech": true,
    "Villa Byblos": true,
  });
  const [instantBookingSaving, setInstantBookingSaving] = useState(false);
  const [instantBookingSaved, setInstantBookingSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings", adminApiFetchInit)
      .then((r) => r.json())
      .then((d) => {
        const rows = d.settings ?? [];
        const wa = rows.find((s: { key: string; value: string }) => s.key === "whatsapp_number");
        if (wa) setWhatsappNum(wa.value);
        const ne = rows.find((s: { key: string; value: string }) => s.key === "notification_emails");
        if (ne) setNotifEmails(ne.value);
        setInstantBookingAdmin({
          "Villa Mechmech": parseInstantBookingSetting(
            rows.find((s: { key: string; value: string }) => s.key === INSTANT_BOOKING_SETTING_KEYS["Villa Mechmech"])?.value,
          ),
          "Villa Byblos": parseInstantBookingSetting(
            rows.find((s: { key: string; value: string }) => s.key === INSTANT_BOOKING_SETTING_KEYS["Villa Byblos"])?.value,
          ),
        });
        const gt = rows.find((s: { key: string; value: string }) => s.key === GUEST_TESTIMONIALS_SETTINGS_KEY);
        if (gt?.value != null && String(gt.value).trim() !== "") {
          setTestimonialRows(parseGuestTestimonialsJson(String(gt.value)));
        } else {
          setTestimonialRows([]);
        }
      })
      .catch((e) => console.error("[admin] settings fetch error:", e));
  }, []);

  async function saveWhatsapp() {
    setWhatsappSaving(true);
    setWhatsappSaved(false);
    const res = await fetch("/api/admin/settings", {
      ...adminApiFetchInit,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "whatsapp_number", value: whatsappNum }),
    });
    setWhatsappSaving(false);
    if (res.ok) {
      setWhatsappSaved(true);
      setTimeout(() => setWhatsappSaved(false), 3000);
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to save.");
    }
  }

  async function savePassword() {
    if (!newPassword.trim()) return;
    setPwSaving(true);
    setPwSaved(false);
    const res = await fetch("/api/admin/settings", {
      ...adminApiFetchInit,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "admin_password", value: newPassword }),
    });
    setPwSaving(false);
    if (res.ok) {
      setPwSaved(true);
      setNewPassword("");
      setTimeout(() => setPwSaved(false), 3000);
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to save password.");
    }
  }

  async function saveTestimonials() {
    for (const r of testimonialRows) {
      const hasL = Boolean(r.guest_label?.trim());
      const hasQ = Boolean(r.quote?.trim());
      if (hasL !== hasQ) {
        setError("Each testimonial needs both a guest name and quote, or clear incomplete rows before saving.");
        return;
      }
    }
    const clean = testimonialRows
      .filter((r) => r.guest_label.trim() && r.quote.trim())
      .map((r, i) => ({
        guest_label: r.guest_label.trim(),
        ...(r.villa?.trim() ? { villa: r.villa.trim() } : {}),
        quote: r.quote.trim(),
        reference_url: r.reference_url?.trim() || null,
        approved: Boolean(r.approved),
        display_order: typeof r.display_order === "number" && Number.isFinite(r.display_order) ? r.display_order : i,
      }));
    setTestimonialSaving(true);
    setTestimonialSaved(false);
    const res = await fetch("/api/admin/settings", {
      ...adminApiFetchInit,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: GUEST_TESTIMONIALS_SETTINGS_KEY, value: JSON.stringify(clean) }),
    });
    setTestimonialSaving(false);
    if (res.ok) {
      setTestimonialSaved(true);
      setTestimonialRows(clean);
      setTimeout(() => setTestimonialSaved(false), 3000);
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to save testimonials.");
    }
  }

  async function saveNotifEmails() {
    setNotifSaving(true);
    setNotifSaved(false);
    const res = await fetch("/api/admin/settings", {
      ...adminApiFetchInit,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "notification_emails", value: notifEmails }),
    });
    setNotifSaving(false);
    if (res.ok) {
      setNotifSaved(true);
      setTimeout(() => setNotifSaved(false), 3000);
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to save notification emails.");
    }
  }

  async function saveInstantBooking() {
    setInstantBookingSaving(true);
    setInstantBookingSaved(false);
    const villas: (keyof InstantBookingFlags)[] = ["Villa Mechmech", "Villa Byblos"];
    try {
      for (const villa of villas) {
        const res = await fetch("/api/admin/settings", {
          ...adminApiFetchInit,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: INSTANT_BOOKING_SETTING_KEYS[villa],
            value: instantBookingAdmin[villa] ? "true" : "false",
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          setError(d.error ?? "Failed to save instant booking settings.");
          return;
        }
      }
      setInstantBookingSaved(true);
      setTimeout(() => setInstantBookingSaved(false), 3000);
    } finally {
      setInstantBookingSaving(false);
    }
  }

  return (
    <>
      {error && (
        <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", marginBottom: "1.5rem" }}>
          Error: {error}
        </p>
      )}
      <SettingsSections
        whatsappNum={whatsappNum}
        setWhatsappNum={(value) => { setWhatsappNum(value); setWhatsappSaved(false); }}
        whatsappSaving={whatsappSaving}
        whatsappSaved={whatsappSaved}
        saveWhatsapp={saveWhatsapp}
        newPassword={newPassword}
        setNewPassword={(value) => { setNewPassword(value); setPwSaved(false); }}
        pwSaving={pwSaving}
        pwSaved={pwSaved}
        savePassword={savePassword}
        notifEmails={notifEmails}
        setNotifEmails={(value) => { setNotifEmails(value); setNotifSaved(false); }}
        notifSaving={notifSaving}
        notifSaved={notifSaved}
        saveNotifEmails={saveNotifEmails}
      />

      <div
        style={{
          backgroundColor: SURFACE,
          border: `0.5px solid ${BORDER}`,
          padding: "1.75rem",
          marginBottom: "2rem",
        }}
      >
        <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 1rem" }}>
          Instant Booking
        </p>
        <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: "0 0 1.25rem", lineHeight: 1.65 }}>
          Allow eligible stays to proceed to instant booking once payment is enabled. Stays with add-ons or operational requirements will remain request-only.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "1rem" }}>
          {(["Villa Mechmech", "Villa Byblos"] as const).map((villa) => (
            <label
              key={villa}
              style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={instantBookingAdmin[villa]}
                onChange={(e) => {
                  setInstantBookingSaved(false);
                  setInstantBookingAdmin((prev) => ({ ...prev, [villa]: e.target.checked }));
                }}
              />
              {villa}
            </label>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => { void saveInstantBooking(); }}
            disabled={instantBookingSaving}
            style={{
              fontFamily: LATO,
              fontSize: "10px",
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: CHARCOAL,
              backgroundColor: GOLD,
              border: "none",
              padding: "12px 28px",
              cursor: instantBookingSaving ? "not-allowed" : "pointer",
              opacity: instantBookingSaving ? 0.7 : 1,
            }}
          >
            {instantBookingSaving ? "Saving..." : "Save"}
          </button>
          {instantBookingSaved && (
            <span style={{ fontFamily: LATO, fontSize: "11px", color: "#6fcf8a", letterSpacing: "1px" }}>Saved</span>
          )}
        </div>
      </div>

      <TestimonialManager
        rows={testimonialRows}
        setRows={(action) => {
          setTestimonialSaved(false);
          setTestimonialRows(action);
        }}
        onSave={saveTestimonials}
        saving={testimonialSaving}
        saved={testimonialSaved}
      />
    </>
  );
}
