"use client";

import { useState } from "react";

const GOLD = "var(--oraya-gold)";
const GOLD_CTA = "var(--oraya-gold-cta-text)";
const LATO = "'Lato', system-ui, sans-serif";

export default function CopyValueButton({
  value,
  buttonLabel = "Copy",
}: {
  value: string;
  buttonLabel?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      console.error("[CopyValueButton] copy failed:", error);
    }
  }

  return (
    <button
      type="button"
      className="oraya-pressable"
      onClick={handleCopy}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: LATO,
        fontSize: "10px",
        letterSpacing: "1.6px",
        textTransform: "uppercase",
        color: copied ? GOLD_CTA : GOLD,
        backgroundColor: copied ? GOLD : "transparent",
        border: `0.5px solid ${copied ? GOLD : "var(--oraya-border)"}`,
        borderRadius: "999px",
        padding: "7px 12px",
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "background-color 180ms ease, border-color 180ms ease, color 180ms ease",
      }}
      aria-label={`${buttonLabel} ${value}`}
      title={copied ? "Copied" : buttonLabel}
    >
      {copied ? "Copied" : buttonLabel}
    </button>
  );
}
