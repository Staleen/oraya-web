"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import OrayaEmblem from "@/components/OrayaEmblem";
import { CHARCOAL, GOLD, LATO, MIDNIGHT, MUTED, PLAYFAIR, WHITE } from "@/components/admin/theme";
import { fieldStyle } from "@/components/admin/theme";

/**
 * Spend an emailed one-time recovery token to set a new /ops owner password.
 *
 * Deliberately a TOP-LEVEL route, not under /ops/*: the ops layout's auth gate
 * would otherwise block the one person this page exists for — a locked-out
 * owner. The token arrives in ?token= from the recovery email and is the only
 * thing that authorises the reset; nothing here chooses whose password is set.
 */
function OpsResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 12) { setError("New password must be at least 12 characters."); return; }
    if (newPassword !== confirmPassword) { setError("New password and confirmation do not match."); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/ops/recovery/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ token, new_password: newPassword, confirm_password: confirmPassword }),
      });
      if (res.ok) {
        setDone(true);
      } else {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(typeof d.error === "string" ? d.error : "Could not reset the password.");
      }
    } catch {
      setError("Could not reset the password. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = submitting || newPassword.length < 12 || !confirmPassword;

  return (
    <main style={{
      minHeight: "100vh", backgroundColor: MIDNIGHT,
      display: "flex", alignItems: "center", justifyContent: "center", padding: "24px",
    }}>
      <div style={{ width: "100%", maxWidth: "380px", textAlign: "center" }}>
        <a href="/" style={{ display: "block", width: "52px", margin: "0 auto 2.5rem", cursor: "pointer" }}>
          <OrayaEmblem />
        </a>
        <div style={{ width: "40px", height: "0.5px", backgroundColor: GOLD, margin: "0 auto 1.75rem", opacity: 0.5 }} />
        <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "12px" }}>
          Operations recovery
        </p>
        <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2rem", fontWeight: 400, color: WHITE, margin: "0 0 2rem" }}>
          Set a new password
        </h1>

        {done ? (
          <div>
            <p style={{ fontFamily: LATO, fontSize: "14px", color: "#6fcf8a", lineHeight: 1.7, margin: "0 0 1.5rem" }}>
              Password updated. Sign in with your new password.
            </p>
            <a
              href="/ops"
              style={{
                display: "inline-block", fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px",
                textTransform: "uppercase", color: CHARCOAL, backgroundColor: GOLD,
                padding: "15px 40px", textDecoration: "none",
              }}
            >
              Go to sign-in
            </a>
          </div>
        ) : !token ? (
          <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, lineHeight: 1.7 }}>
            This page needs the reset link from the recovery email. Open the link in that email, or
            request a new one from the sign-in page.
          </p>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
              placeholder="New password (min 12 characters)"
              autoFocus
              style={{ ...fieldStyle, padding: "14px 16px", fontSize: "15px", textAlign: "center" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
            />
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
              placeholder="Repeat new password"
              style={{ ...fieldStyle, padding: "14px 16px", fontSize: "15px", textAlign: "center" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = GOLD; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(197,164,109,0.25)"; }}
            />
            {error && (
              <p style={{ fontFamily: LATO, fontSize: "12px", color: "#e07070", lineHeight: 1.6 }}>{error}</p>
            )}
            <button
              type="submit"
              disabled={disabled}
              style={{
                fontFamily: LATO, fontSize: "11px", letterSpacing: "2.5px",
                textTransform: "uppercase", color: CHARCOAL,
                backgroundColor: GOLD, border: "none", padding: "15px",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.6 : 1,
              }}
            >
              {submitting ? "Saving…" : "Set new password"}
            </button>
            <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, lineHeight: 1.6, margin: 0 }}>
              The link works once and expires 30 minutes after it was sent.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

export default function OpsResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <OpsResetPasswordForm />
    </Suspense>
  );
}
