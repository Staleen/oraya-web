/**
 * Monochrome add-on icon system — Oraya brand.
 * Pure presentational component: no hooks, no browser APIs.
 * Icons are inlined SVGs sized via the `size` prop (default 16px).
 *
 * Label-based detection:
 *   pool / water / heated → waves
 *   fire / flame / diesel / wood / hearth → flame
 *   breakfast / food / meal / dining / catering → cutlery
 *   bed / bedding / linen / mattress / pillow → bed
 *   everything else → service bell
 */
import type React from "react";

type IconType = "flame" | "waves" | "cutlery" | "bed" | "service";

function detectIconType(label: string): IconType {
  const l = label.toLowerCase();
  if (/pool|water|hydro|aqua|swim|heated/.test(l)) return "waves";
  if (/fire|flame|diesel|wood|hearth|stove/.test(l)) return "flame";
  if (/breakfast|lunch|dinner|food|meal|dining|catering|coffee|drink/.test(l)) return "cutlery";
  if (/bed|linen|bedding|mattress|pillow|sheet/.test(l)) return "bed";
  return "service";
}

export function AddonIcon({
  label,
  size = 16,
  color = "rgba(197,164,109,0.55)",
  style,
}: {
  label: string;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}) {
  const type = detectIconType(label);
  const base: React.SVGProps<SVGSVGElement> = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": "true",
    style: { display: "block", flexShrink: 0, ...style },
  };

  /* ── Flame ─────────────────────────────────────────────────────────────── */
  if (type === "flame") {
    return (
      <svg {...base}>
        <path
          d="M8 2C8 2 5 5.5 5 9C5 12 6.4 14 8 14C9.6 14 11 12 11 9C11 5.5 8 2 8 2Z"
          fill={color}
        />
        {/* inner highlight */}
        <path
          d="M8 7C8 7 6.5 9 6.5 10.5C6.5 11.5 7.2 12.2 8 12.2"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="0.9"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  /* ── Waves (pool / water) ───────────────────────────────────────────────── */
  if (type === "waves") {
    return (
      <svg {...base}>
        <path
          d="M1.5 6.5Q4 4 6.5 6.5Q9 9 11.5 6.5Q13.5 4.5 14.5 6.5"
          stroke={color}
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <path
          d="M1.5 10.5Q4 8 6.5 10.5Q9 13 11.5 10.5Q13.5 8.5 14.5 10.5"
          stroke={color}
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  /* ── Cutlery (breakfast / food) ─────────────────────────────────────────── */
  if (type === "cutlery") {
    return (
      <svg {...base}>
        {/* Fork: two tines */}
        <path d="M4.5 2V5.5M6 2V5.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
        {/* Fork: arch joining tines to handle */}
        <path d="M4 5.5Q5.25 7.2 6.5 5.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
        {/* Fork handle */}
        <path d="M5.25 7.2V14" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
        {/* Knife: tapered blade + handle */}
        <path
          d="M10.5 2C12 2 12.5 4.5 10.5 5.8L10.5 14"
          stroke={color}
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  /* ── Bed (bedding / linen) ──────────────────────────────────────────────── */
  if (type === "bed") {
    return (
      <svg {...base}>
        {/* Headboard + frame */}
        <path
          d="M1.5 12V8L2.5 7H13.5L14.5 8V12"
          stroke={color}
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Left pillow */}
        <rect x="3" y="7.2" width="3.5" height="2" rx="0.5" stroke={color} strokeWidth="1" />
        {/* Right pillow */}
        <rect x="9.5" y="7.2" width="3.5" height="2" rx="0.5" stroke={color} strokeWidth="1" />
        {/* Base rail */}
        <path d="M1.5 12H14.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
        {/* Legs */}
        <path d="M2.5 12V13.8M13.5 12V13.8" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }

  /* ── Service bell (fallback) ────────────────────────────────────────────── */
  return (
    <svg {...base}>
      {/* Bell dome */}
      <path
        d="M4 10.5V8C4 5.8 5.8 4 8 4C10.2 4 12 5.8 12 8V10.5"
        stroke={color}
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      {/* Bell base bar */}
      <path d="M2.5 10.5H13.5" stroke={color} strokeWidth="1.25" strokeLinecap="round" />
      {/* Handle knob */}
      <path d="M6.5 4C6.5 3 7.2 2.3 8 2.3C8.8 2.3 9.5 3 9.5 4" stroke={color} strokeWidth="1.25" strokeLinecap="round" />
      {/* Clapper arc */}
      <path d="M6.5 10.5C6.5 11.6 7.2 12.5 8 12.5C8.8 12.5 9.5 11.6 9.5 10.5" stroke={color} strokeWidth="1.1" />
    </svg>
  );
}
