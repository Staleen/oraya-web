"use client";
import { useEffect, useState } from "react";
import SettingsSections from "@/components/admin/SettingsSections";
import PaymentSettingsSection from "@/components/admin/PaymentSettingsSection";
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
import {
  DEFAULT_PAYMENT_PUBLIC_SETTINGS,
  PAYMENT_PUBLIC_SETTINGS_KEY,
  parsePaymentPublicSettings,
  serializePaymentPublicSettings,
  type PaymentPublicSettings,
} from "@/lib/payments/settings";
import type { HostedCheckoutAdminStatus } from "@/lib/payments/runtime";

export default function AdminSettingsPage() {
  const { error, setError } = useAdminData();
  const [whatsappNum, setWhatsappNum] = useState("");
  const [whatsappSaving, setWhatsappSaving] = useState(false);
  const [whatsappSaved, setWhatsappSaved] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState("");
  const [notifEmails, setNotifEmails] = useState("");
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);
  const [testimonialRows, setTestimonialRows] = useState<GuestTestimonialRecord[]>([]);
  const [testimonialSaving, setTestimonialSaving] = useState(false);
  const [testimonialSaved, setTestimonialSaved] = useState(false);
  // Audit S-2: conservative default — a value only becomes true after a
  // successful settings load (Save is unreachable until then anyway).
  const [instantBookingAdmin, setInstantBookingAdmin] = useState<InstantBookingFlags>({
    "Villa Mechmech": false,
    "Villa Byblos": false,
  });
  const [instantBookingSaving, setInstantBookingSaving] = useState(false);
  const [instantBookingSaved, setInstantBookingSaved] = useState(false);
  const [paymentSettings, setPaymentSettings] = useState<PaymentPublicSettings>(
    DEFAULT_PAYMENT_PUBLIC_SETTINGS,
  );
  const [paymentProviderStatus, setPaymentProviderStatus] = useState<HostedCheckoutAdminStatus | null>(null);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentSaved, setPaymentSaved] = useState(false);
  // Plan 4 Phase 3 (3.2): Live card payments rollout switch.
  const [liveEnabled, setLiveEnabled] = useState<boolean | null>(null);
  const [liveSaving, setLiveSaving] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [liveSaved, setLiveSaved] = useState(false);
  // Audit S-3: the live-toggle status GET failed — state unknown, error + retry shown.
  const [liveStatusError, setLiveStatusError] = useState<string | null>(null);
  // Audit S-2/S-9: fail-closed settings load — saves stay unreachable until it succeeds.
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsLoadError, setSettingsLoadError] = useState<string | null>(null);

  function refreshPaymentReadiness() {
    fetch("/api/payments/readiness", adminApiFetchInit)
      .then((r) => r.json())
      .then((d) => {
        if (d?.status) setPaymentProviderStatus(d.status as HostedCheckoutAdminStatus);
      })
      .catch((e) => console.error("[admin] payment readiness fetch error:", e));
  }

  async function setLivePayments(enabled: boolean, currentPassword?: string) {
    setLiveSaving(true);
    setLiveError("");
    setLiveSaved(false);
    try {
      const res = await fetch("/api/admin/payments/live-toggle", {
        ...adminApiFetchInit,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          enabled ? { enabled: true, current_password: currentPassword ?? "" } : { enabled: false },
        ),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setLiveEnabled(Boolean(d.enabled));
        setLiveSaved(true);
        setTimeout(() => setLiveSaved(false), 5000);
        refreshPaymentReadiness();
      } else {
        setLiveError(typeof d.error === "string" ? d.error : "Failed to update live card payments.");
      }
    } catch {
      setLiveError("Failed to update live card payments. Check your connection and try again.");
    } finally {
      setLiveSaving(false);
    }
  }

  // Audit S-2/S-9: rejected promise, non-OK response, and malformed body all
  // count as a failed load — state stays untouched and every settings-derived
  // Save remains unreachable until a retry succeeds.
  async function loadSettings() {
    setSettingsLoading(true);
    setSettingsLoadError(null);
    try {
      const r = await fetch("/api/admin/settings", adminApiFetchInit);
      if (!r.ok) throw new Error(`Settings request failed (${r.status}).`);
      const d = await r.json();
      if (!Array.isArray(d.settings)) throw new Error("Settings response was malformed.");
      const rows = d.settings as Array<{ key: string; value: string }>;
      const wa = rows.find((s) => s.key === "whatsapp_number");
      if (wa) setWhatsappNum(wa.value);
      const ne = rows.find((s) => s.key === "notification_emails");
      if (ne) setNotifEmails(ne.value);
      setInstantBookingAdmin({
        "Villa Mechmech": parseInstantBookingSetting(
          rows.find((s) => s.key === INSTANT_BOOKING_SETTING_KEYS["Villa Mechmech"])?.value,
        ),
        "Villa Byblos": parseInstantBookingSetting(
          rows.find((s) => s.key === INSTANT_BOOKING_SETTING_KEYS["Villa Byblos"])?.value,
        ),
      });
      const gt = rows.find((s) => s.key === GUEST_TESTIMONIALS_SETTINGS_KEY);
      if (gt?.value != null && String(gt.value).trim() !== "") {
        setTestimonialRows(parseGuestTestimonialsJson(String(gt.value)));
      } else {
        setTestimonialRows([]);
      }
      const payment = rows.find((s) => s.key === PAYMENT_PUBLIC_SETTINGS_KEY);
      setPaymentSettings(parsePaymentPublicSettings(payment?.value ?? null));
      setSettingsLoading(false);
    } catch (e) {
      console.error("[admin] settings fetch error:", e);
      setSettingsLoadError(e instanceof Error ? e.message : "Network error while loading settings.");
      setSettingsLoading(false);
    }
  }

  // Audit S-3: a failed status GET is surfaced (error + retry) instead of
  // leaving the kill switch stuck on "Loading..." forever.
  async function loadLiveStatus() {
    setLiveStatusError(null);
    try {
      const r = await fetch("/api/admin/payments/live-toggle", adminApiFetchInit);
      if (!r.ok) throw new Error(`Live-payments status request failed (${r.status}).`);
      const d = await r.json();
      if (typeof d?.enabled !== "boolean") throw new Error("Live-payments status response was malformed.");
      setLiveEnabled(d.enabled);
    } catch (e) {
      console.error("[admin] live payments fetch error:", e);
      setLiveStatusError(e instanceof Error ? e.message : "Failed to load the live-payments status.");
    }
  }

  useEffect(() => {
    void loadSettings();

    fetch("/api/payments/readiness", adminApiFetchInit)
      .then((r) => r.json())
      .then((d) => {
        if (d?.status) setPaymentProviderStatus(d.status as HostedCheckoutAdminStatus);
      })
      .catch((e) => console.error("[admin] payment readiness fetch error:", e));

    void loadLiveStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Remediation 2 (A.1): current password required; new password twice,
    // min 12 chars; server verifies + throttles via /api/admin/change-password.
    setPwError("");
    if (!currentPassword.trim()) { setPwError("Enter your current password."); return; }
    if (newPassword.length < 12) { setPwError("New password must be at least 12 characters."); return; }
    if (newPassword !== confirmPassword) { setPwError("New password and confirmation do not match."); return; }
    setPwSaving(true);
    setPwSaved(false);
    try {
      const res = await fetch("/api/admin/change-password", {
        ...adminApiFetchInit,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });
      if (res.ok) {
        setPwSaved(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setPwSaved(false), 5000);
      } else {
        const d = await res.json().catch(() => ({}));
        setPwError(typeof d.error === "string" ? d.error : "Failed to update password.");
      }
    } catch {
      setPwError("Failed to update password. Check your connection and try again.");
    } finally {
      setPwSaving(false);
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

  async function savePaymentSettings() {
    setPaymentSaving(true);
    setPaymentSaved(false);
    const res = await fetch("/api/admin/settings", {
      ...adminApiFetchInit,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: PAYMENT_PUBLIC_SETTINGS_KEY,
        value: serializePaymentPublicSettings(paymentSettings),
      }),
    });
    setPaymentSaving(false);
    if (res.ok) {
      setPaymentSaved(true);
      setPaymentSettings(parsePaymentPublicSettings(paymentSettings));
      setTimeout(() => setPaymentSaved(false), 3000);
    } else {
      const d = await res.json();
      setError(d.error ?? "Failed to save payment settings.");
    }
  }

  const settingsNotReady = settingsLoading || settingsLoadError !== null;

  return (
    <>
      {error && (
        <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", marginBottom: "1.5rem" }}>
          Error: {error}
        </p>
      )}
      {settingsLoadError !== null && (
        <div
          style={{
            border: "0.5px solid rgba(224,112,112,0.34)",
            backgroundColor: "rgba(224,112,112,0.08)",
            padding: "14px 16px",
            marginBottom: "2rem",
          }}
        >
          <p style={{ fontFamily: LATO, fontSize: "12px", color: "#f4b3b3", margin: "0 0 4px", lineHeight: 1.6 }}>
            Couldn&apos;t load the current settings — editing is disabled so blank or default values can&apos;t overwrite
            the live configuration.
          </p>
          <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "0 0 10px", lineHeight: 1.5 }}>
            {settingsLoadError}
          </p>
          <button
            type="button"
            onClick={() => void loadSettings()}
            style={{
              fontFamily: LATO,
              fontSize: "10px",
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: GOLD,
              backgroundColor: "transparent",
              border: "0.5px solid rgba(197,164,109,0.35)",
              padding: "10px 18px",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      )}
      {settingsLoading && settingsLoadError === null && (
        <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, marginBottom: "1.5rem" }}>
          Loading settings…
        </p>
      )}
      {!settingsNotReady && (
      <SettingsSections
        whatsappNum={whatsappNum}
        setWhatsappNum={(value) => { setWhatsappNum(value); setWhatsappSaved(false); }}
        whatsappSaving={whatsappSaving}
        whatsappSaved={whatsappSaved}
        saveWhatsapp={saveWhatsapp}
        currentPassword={currentPassword}
        setCurrentPassword={(value) => { setCurrentPassword(value); setPwSaved(false); setPwError(""); }}
        newPassword={newPassword}
        setNewPassword={(value) => { setNewPassword(value); setPwSaved(false); setPwError(""); }}
        confirmPassword={confirmPassword}
        setConfirmPassword={(value) => { setConfirmPassword(value); setPwSaved(false); setPwError(""); }}
        pwSaving={pwSaving}
        pwSaved={pwSaved}
        pwError={pwError}
        savePassword={savePassword}
        notifEmails={notifEmails}
        setNotifEmails={(value) => { setNotifEmails(value); setNotifSaved(false); }}
        notifSaving={notifSaving}
        notifSaved={notifSaved}
        saveNotifEmails={saveNotifEmails}
      />
      )}

      <PaymentSettingsSection
        value={paymentSettings}
        providerStatus={paymentProviderStatus}
        settingsUnavailable={settingsNotReady}
        livePayments={{
          enabled: liveEnabled,
          saving: liveSaving,
          error: liveError,
          saved: liveSaved,
          statusError: liveStatusError,
          onRetryStatus: () => void loadLiveStatus(),
          onChange: (enabled, currentPassword) => {
            void setLivePayments(enabled, currentPassword);
          },
        }}
        onChange={(next) => {
          setPaymentSaved(false);
          // Audit S-1: keep the RAW draft while typing — normalization/trim
          // happens at save time via serializePaymentPublicSettings. Re-parsing
          // per keystroke stripped trailing spaces and made text untypeable.
          setPaymentSettings(next);
        }}
        onSave={savePaymentSettings}
        saving={paymentSaving}
        saved={paymentSaved}
      />

      {!settingsNotReady && (
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
      )}

      {!settingsNotReady && (
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
      )}
    </>
  );
}
