"use client";

import { useState } from "react";

const GOLD = "#C5A46D";
const MUTED = "#8a8070";
const MIDNIGHT = "#1F2B38";
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
      onClick={handleCopy}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: LATO,
        fontSize: "10px",
        letterSpacing: "1.6px",
        textTransform: "uppercase",
        color: copied ? MIDNIGHT : GOLD,
        backgroundColor: copied ? GOLD : "transparent",
        border: `0.5px solid ${copied ? GOLD : "rgba(197,164,109,0.26)"}`,
        borderRadius: "999px",
        padding: "7px 12px",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
      aria-label={`${buttonLabel} ${value}`}
      title={copied ? "Copied" : buttonLabel}
    >
      {copied ? "Copied" : buttonLabel}
    </button>
  );
}
