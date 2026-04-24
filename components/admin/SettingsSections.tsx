"use client";
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
}) {
  const isMobile = typeof window !== "undefined" ? window.innerWidth <= 768 : false;
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
              opacity: whatsappSaving ? 0.7 : 1, whiteSpace: "nowrap",
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
              opacity: pwSaving || !newPassword.trim() ? 0.6 : 1, whiteSpace: "nowrap",
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
            placeholder="e.g. admin@oraya.com, ops@oraya.com"
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
              opacity: notifSaving ? 0.7 : 1, whiteSpace: "nowrap",
            }}
          >
            {notifSaving ? "Saving..." : "Save"}
          </button>
          {notifSaved && (
            <span style={{ fontFamily: LATO, fontSize: "11px", color: "#6fcf8a", letterSpacing: "1px" }}>Saved</span>
          )}
        </div>
      </div>
    </div>
  );
}
