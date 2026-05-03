"use client";
import { useEffect, useState } from "react";
import SettingsSections from "@/components/admin/SettingsSections";
import { useAdminData } from "@/components/admin/AdminDataProvider";
import { LATO } from "@/components/admin/theme";
import { adminApiFetchInit } from "@/lib/admin-auth";

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

  useEffect(() => {
    fetch("/api/admin/settings", adminApiFetchInit)
      .then((r) => r.json())
      .then((d) => {
        const rows = d.settings ?? [];
        const wa = rows.find((s: { key: string; value: string }) => s.key === "whatsapp_number");
        if (wa) setWhatsappNum(wa.value);
        const ne = rows.find((s: { key: string; value: string }) => s.key === "notification_emails");
        if (ne) setNotifEmails(ne.value);
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
    </>
  );
}
