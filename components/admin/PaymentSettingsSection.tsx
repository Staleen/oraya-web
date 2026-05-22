"use client";

import type { CSSProperties } from "react";
import {
  DEFAULT_PAYMENT_PUBLIC_SETTINGS,
  GUEST_MANUAL_PAYMENT_RAILS,
  getManualRailLabel,
  PAYMENT_MODE_VALUES,
  type GuestManualPaymentRail,
  type PaymentMode,
  type PaymentPublicSettings,
} from "@/lib/payments/settings";
import { BORDER, CHARCOAL, GOLD, LATO, MUTED, SURFACE, WHITE, fieldStyle } from "./theme";

const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  request_only: "Request only",
  manual_payment: "Manual payment",
  online_payment: "Online payment",
  hybrid: "Hybrid",
};

function textareaStyle(): CSSProperties {
  return {
    ...fieldStyle,
    minHeight: "120px",
    resize: "vertical",
    lineHeight: 1.6,
  };
}

export default function PaymentSettingsSection({
  value,
  onChange,
  onSave,
  saving,
  saved,
}: {
  value: PaymentPublicSettings;
  onChange: (next: PaymentPublicSettings) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  const isMobile = typeof window !== "undefined" ? window.innerWidth <= 768 : false;

  function patch<K extends keyof PaymentPublicSettings>(key: K, next: PaymentPublicSettings[K]) {
    onChange({ ...value, [key]: next });
  }

  function toggleRail(rail: GuestManualPaymentRail, checked: boolean) {
    const nextRails = checked
      ? Array.from(new Set([...value.manual_payment_rails, rail]))
      : value.manual_payment_rails.filter((candidate) => candidate !== rail);
    patch("manual_payment_rails", nextRails);
  }

  return (
    <div
      style={{
        backgroundColor: SURFACE,
        border: `0.5px solid ${BORDER}`,
        padding: isMobile ? "1rem" : "1.75rem",
        marginBottom: "2rem",
      }}
    >
      <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 1rem" }}>
        Payments
      </p>
      <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, margin: "0 0 1.5rem", lineHeight: 1.7 }}>
        Configure the guest-facing payment experience and post-confirmation instructions. Gateway credentials stay in environment variables and are never stored here.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "16px", marginBottom: "1.5rem" }}>
        <div>
          <label style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "6px" }}>
            Active payment mode
          </label>
          <select
            value={value.active_payment_mode}
            onChange={(event) => patch("active_payment_mode", event.target.value as PaymentMode)}
            style={{ ...fieldStyle, cursor: "pointer" }}
          >
            {PAYMENT_MODE_VALUES.map((mode) => (
              <option key={mode} value={mode} style={{ backgroundColor: "#1F2B38" }}>
                {PAYMENT_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "6px" }}>
            Provider display name
          </label>
          <input
            type="text"
            value={value.provider_display_name}
            onChange={(event) => patch("provider_display_name", event.target.value)}
            placeholder={DEFAULT_PAYMENT_PUBLIC_SETTINGS.provider_display_name}
            style={fieldStyle}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: "16px", marginBottom: "1.5rem" }}>
        <div>
          <label style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "6px" }}>
            Deposit minimum %
          </label>
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            value={value.deposit_minimum_percentage}
            onChange={(event) => patch("deposit_minimum_percentage", Number(event.target.value) || DEFAULT_PAYMENT_PUBLIC_SETTINGS.deposit_minimum_percentage)}
            style={fieldStyle}
          />
        </div>

        <label style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", alignSelf: "end", minHeight: "46px" }}>
          <input
            type="checkbox"
            checked={value.allow_full_payment}
            onChange={(event) => patch("allow_full_payment", event.target.checked)}
          />
          Allow full payment
        </label>

        <label style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", alignSelf: "end", minHeight: "46px" }}>
          <input
            type="checkbox"
            checked={value.allow_custom_deposit}
            onChange={(event) => patch("allow_custom_deposit", event.target.checked)}
          />
          Allow custom deposit
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "16px", marginBottom: "1.5rem" }}>
        <div style={{ border: `0.5px solid ${BORDER}`, padding: "14px 16px", backgroundColor: "rgba(255,255,255,0.02)" }}>
          <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, margin: "0 0 10px" }}>
            Online payment
          </p>
          <label style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={value.online_payment_enabled}
              onChange={(event) => patch("online_payment_enabled", event.target.checked)}
            />
            Enable online payment when provider is ready
          </label>
          <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "10px 0 0", lineHeight: 1.6 }}>
            This only controls guest-facing availability. Gateway implementation and secrets remain environment-based.
          </p>
        </div>

        <div style={{ border: `0.5px solid ${BORDER}`, padding: "14px 16px", backgroundColor: "rgba(255,255,255,0.02)" }}>
          <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, margin: "0 0 10px" }}>
            Manual payment rails
          </p>
          <div style={{ display: "grid", gap: "10px" }}>
            {GUEST_MANUAL_PAYMENT_RAILS.map((rail) => (
              <label key={rail} style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={value.manual_payment_rails.includes(rail)}
                  onChange={(event) => toggleRail(rail, event.target.checked)}
                />
                {getManualRailLabel(rail)}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: "16px", marginBottom: "1.5rem" }}>
        <div>
          <label style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "6px" }}>
            Payment instructions shown to guest
          </label>
          <textarea
            value={value.payment_instructions}
            onChange={(event) => patch("payment_instructions", event.target.value)}
            placeholder="Explain how Oraya will follow up with confirmation and payment instructions."
            style={textareaStyle()}
          />
        </div>

        <div>
          <label style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, display: "block", marginBottom: "6px" }}>
            Bank transfer public details
          </label>
          <textarea
            value={value.bank_transfer_public_details}
            onChange={(event) => patch("bank_transfer_public_details", event.target.value)}
            placeholder="Public guest-facing bank transfer details only. Do not store secrets here."
            style={textareaStyle()}
          />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
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
            padding: "12px 28px",
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Saving..." : "Save payment settings"}
        </button>
        {saved ? (
          <span style={{ fontFamily: LATO, fontSize: "11px", color: "#6fcf8a", letterSpacing: "1px" }}>
            Saved
          </span>
        ) : null}
      </div>
    </div>
  );
}
