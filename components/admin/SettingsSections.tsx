"use client";
import { useState } from "react";
import {
  appendUnapprovedTestimonialFromPaste,
  GUEST_TESTIMONIALS_JSON_TEMPLATE,
  parseGuestTestimonialsJson,
} from "@/lib/guest-testimonials";
import { GOLD, CHARCOAL, MUTED, LATO, SURFACE, BORDER, fieldStyle } from "./theme";

export default function SettingsSections({
  whatsappNum,
  setWhatsappNum,
  whatsappSaving,
  whatsappSaved,
  saveWhatsapp,
  newPassword,
  setNewPassword,
  pwSaving,
  pwSaved,
  savePassword,
  notifEmails,
  setNotifEmails,
  notifSaving,
  notifSaved,
  saveNotifEmails,
  testimonialJson,
  setTestimonialJson,
  testimonialSaving,
  testimonialSaved,
  saveTestimonials,
}: {
  whatsappNum: string;
  setWhatsappNum: (value: string) => void;
  whatsappSaving: boolean;
  whatsappSaved: boolean;
  saveWhatsapp: () => void;
  newPassword: string;
  setNewPassword: (value: string) => void;
  pwSaving: boolean;
  pwSaved: boolean;
  savePassword: () => void;
  notifEmails: string;
  setNotifEmails: (value: string) => void;
  notifSaving: boolean;
  notifSaved: boolean;
  saveNotifEmails: () => void;
  testimonialJson: string;
  setTestimonialJson: (value: string) => void;
  testimonialSaving: boolean;
  testimonialSaved: boolean;
  saveTestimonials: () => void;
}) {
  const isMobile = typeof window !== "undefined" ? window.innerWidth <= 768 : false;
  const [quickPasteOpen, setQuickPasteOpen] = useState(false);
  const [quickPaste, setQuickPaste] = useState("");
  const [quickGuest, setQuickGuest] = useState("");
  const [quickVilla, setQuickVilla] = useState("");
  const [quickPasteError, setQuickPasteError] = useState("");

  function appendFromMessage() {
    setQuickPasteError("");
    let parsed: unknown;
    try {
      parsed = JSON.parse(testimonialJson);
    } catch {
      setQuickPasteError("Fix testimonials JSON syntax first, or set it to [].");
      return;
    }
    if (!Array.isArray(parsed)) {
      setQuickPasteError("Testimonials JSON must be an array.");
      return;
    }
    const rows = parseGuestTestimonialsJson(JSON.stringify(parsed));
    const merged = appendUnapprovedTestimonialFromPaste(rows, quickPaste, quickGuest, quickVilla);
    if (merged === rows) {
      setQuickPasteError("Paste the guest’s words in the message field.");
      return;
    }
    setTestimonialJson(JSON.stringify(merged, null, 2));
    setQuickPaste("");
    setQuickGuest("");
    setQuickVilla("");
    setQuickPasteOpen(false);
  }

  return (
    <div style={{ backgroundColor: SURFACE, border: `0.5px solid ${BORDER}`, padding: isMobile ? "1rem" : "1.75rem", marginBottom: "2rem" }}>
      <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 1.5rem" }}>
        Settings
      </p>

      <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "flex-end", gap: "12px", flexWrap: "wrap", marginBottom: "1.5rem", paddingBottom: "1.5rem", borderBottom: `0.5px solid ${BORDER}` }}>
        <div style={{ flex: "1", minWidth: "220px" }}>
          <label style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "6px" }}>
            WhatsApp number
          </label>
          <input
            type="tel"
            value={whatsappNum}
            onChange={(e) => setWhatsappNum(e.target.value)}
            placeholder="e.g. 96170000000"
            style={fieldStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
          />
          <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, marginTop: "5px" }}>
            Include country code, no + or spaces (e.g. 96170123456)
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingBottom: isMobile ? "0" : "22px", width: isMobile ? "100%" : "auto", flexWrap: "wrap" }}>
          <button
            onClick={saveWhatsapp}
            disabled={whatsappSaving}
            style={{
              fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
              textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD,
              border: "none", padding: "12px 28px",
              cursor: whatsappSaving ? "not-allowed" : "pointer",
              opacity: whatsappSaving ? 0.7 : 1, whiteSpace: "nowrap", width: isMobile ? "100%" : "auto",
            }}
          >
            {whatsappSaving ? "Saving..." : "Save"}
          </button>
          {whatsappSaved && (
            <span style={{ fontFamily: LATO, fontSize: "11px", color: "#6fcf8a", letterSpacing: "1px" }}>Saved</span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "flex-end", gap: "12px", flexWrap: "wrap", marginBottom: "1.5rem", paddingBottom: "1.5rem", borderBottom: `0.5px solid ${BORDER}` }}>
        <div style={{ flex: "1", minWidth: "220px" }}>
          <label style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "6px" }}>
            Change admin password
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
            style={fieldStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingBottom: isMobile ? "0" : "2px", width: isMobile ? "100%" : "auto", flexWrap: "wrap" }}>
          <button
            onClick={savePassword}
            disabled={pwSaving || !newPassword.trim()}
            style={{
              fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
              textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD,
              border: "none", padding: "12px 28px",
              cursor: pwSaving || !newPassword.trim() ? "not-allowed" : "pointer",
              opacity: pwSaving || !newPassword.trim() ? 0.6 : 1, whiteSpace: "nowrap", width: isMobile ? "100%" : "auto",
            }}
          >
            {pwSaving ? "Saving..." : "Update password"}
          </button>
          {pwSaved && (
            <span style={{ fontFamily: LATO, fontSize: "11px", color: "#6fcf8a", letterSpacing: "1px" }}>Password updated</span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "flex-end", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ flex: "1", minWidth: "220px" }}>
          <label style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "6px" }}>
            Booking notification recipients
          </label>
          <input
            type="text"
            value={notifEmails}
            onChange={(e) => setNotifEmails(e.target.value)}
            placeholder="e.g. hello@stayoraya.com, ops@stayoraya.com"
            style={fieldStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
          />
          <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, marginTop: "5px" }}>
            Comma-separated. These addresses receive an email when a new booking request is submitted.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingBottom: isMobile ? "0" : "22px", width: isMobile ? "100%" : "auto", flexWrap: "wrap" }}>
          <button
            onClick={saveNotifEmails}
            disabled={notifSaving}
            style={{
              fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
              textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD,
              border: "none", padding: "12px 28px",
              cursor: notifSaving ? "not-allowed" : "pointer",
              opacity: notifSaving ? 0.7 : 1, whiteSpace: "nowrap", width: isMobile ? "100%" : "auto",
            }}
          >
            {notifSaving ? "Saving..." : "Save"}
          </button>
          {notifSaved && (
            <span style={{ fontFamily: LATO, fontSize: "11px", color: "#6fcf8a", letterSpacing: "1px" }}>Saved</span>
          )}
        </div>
      </div>

      <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: `0.5px solid ${BORDER}` }}>
        <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 0.75rem" }}>
          Guest testimonials (JSON)
        </p>
        <div style={{ marginBottom: "14px", display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => { setQuickPasteOpen((o) => !o); setQuickPasteError(""); }}
            style={{
              fontFamily: LATO,
              fontSize: "10px",
              letterSpacing: "1.5px",
              textTransform: "uppercase",
              color: GOLD,
              backgroundColor: "transparent",
              border: "0.5px solid rgba(197,164,109,0.35)",
              padding: "10px 16px",
              cursor: "pointer",
              borderRadius: "4px",
            }}
          >
            Add testimonial from message
          </button>
          <span style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, lineHeight: 1.5 }}>
            Paste from WhatsApp or email — saved as <code style={{ color: CHARCOAL }}>approved: false</code> until you review JSON and save.
          </span>
        </div>
        {quickPasteOpen && (
          <div
            style={{
              border: `0.5px solid ${BORDER}`,
              padding: "14px",
              marginBottom: "14px",
              borderRadius: "6px",
              display: "grid",
              gap: "10px",
            }}
          >
            <textarea
              value={quickPaste}
              onChange={(e) => setQuickPaste(e.target.value)}
              placeholder="Paste guest words here…"
              rows={4}
              style={{ ...fieldStyle, width: "100%", resize: "vertical", fontFamily: LATO, fontSize: "12px" }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              <input
                type="text"
                value={quickGuest}
                onChange={(e) => setQuickGuest(e.target.value)}
                placeholder="Guest name or initials (optional)"
                style={{ ...fieldStyle, flex: "1", minWidth: "160px" }}
              />
              <input
                type="text"
                value={quickVilla}
                onChange={(e) => setQuickVilla(e.target.value)}
                placeholder="Villa (optional)"
                style={{ ...fieldStyle, flex: "1", minWidth: "160px" }}
              />
            </div>
            {quickPasteError ? (
              <p style={{ fontFamily: LATO, fontSize: "11px", color: "#e07070", margin: 0 }}>{quickPasteError}</p>
            ) : null}
            <button
              type="button"
              onClick={appendFromMessage}
              style={{
                fontFamily: LATO,
                fontSize: "10px",
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: CHARCOAL,
                backgroundColor: GOLD,
                border: "none",
                padding: "10px 18px",
                cursor: "pointer",
                justifySelf: "start",
              }}
            >
              Append draft to list
            </button>
          </div>
        )}
        <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "0 0 10px", lineHeight: 1.65 }}>
          Stored in settings key <code style={{ color: CHARCOAL }}>guest_testimonials</code>. Only entries with{" "}
          <code style={{ color: CHARCOAL }}>approved: true</code> appear on the public homepage. Do not publish quotes without guest permission.
        </p>
        <textarea
          value={testimonialJson}
          onChange={(e) => setTestimonialJson(e.target.value)}
          spellCheck={false}
          style={{
            ...fieldStyle,
            width: "100%",
            minHeight: "220px",
            fontFamily: "ui-monospace, monospace",
            fontSize: "12px",
            lineHeight: 1.5,
            resize: "vertical",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
        />
        <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: "8px 0 12px", whiteSpace: "pre-wrap" }}>
          {`Shape per item: guest_label, villa, quote, reference_url (optional), approved (boolean), display_order (number).\nExample:\n${GUEST_TESTIMONIALS_JSON_TEMPLATE}`}
        </p>
        <button
          type="button"
          onClick={saveTestimonials}
          disabled={testimonialSaving}
          style={{
            fontFamily: LATO, fontSize: "10px", letterSpacing: "2px",
            textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD,
            border: "none", padding: "12px 28px",
            cursor: testimonialSaving ? "not-allowed" : "pointer",
            opacity: testimonialSaving ? 0.7 : 1,
          }}
        >
          {testimonialSaving ? "Saving…" : "Save testimonials"}
        </button>
        {testimonialSaved && (
          <span style={{ fontFamily: LATO, fontSize: "11px", color: "#6fcf8a", letterSpacing: "1px", marginLeft: "12px" }}>Saved</span>
        )}
      </div>
    </div>
  );
}
