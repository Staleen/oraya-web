"use client";

import { useLayoutEffect, useState } from "react";

export const ORAYA_THEME_STORAGE_KEY = "oraya-theme";

export type OrayaTheme = "light" | "dark";

/** Reads persisted theme only; first visit / invalid key → light (no system preference). */
export function readStoredTheme(): OrayaTheme {
  if (typeof window === "undefined") return "light";
  try {
    const t = localStorage.getItem(ORAYA_THEME_STORAGE_KEY);
    if (t === "light" || t === "dark") return t;
  } catch {
    /* ignore */
  }
  return "light";
}

export function applyOrayaTheme(theme: OrayaTheme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(ORAYA_THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

/**
 * Public site theme control (homepage, /book). Persists to localStorage; initial paint uses layout inline script.
 * Icon = action: light → moon (go dark); dark → sun (go light).
 */
export default function PublicThemeToggle({
  variant = "public",
}: {
  /** "public" = light nav bar; "onDark" = for dark page backgrounds (e.g. book) */
  variant?: "public" | "onDark";
}) {
  /** Matches SSR default (`light`); `useLayoutEffect` syncs from `data-theme` before paint. */
  const [theme, setTheme] = useState<OrayaTheme>("light");

  useLayoutEffect(() => {
    const a = document.documentElement.getAttribute("data-theme");
    let t: OrayaTheme;
    if (a === "light" || a === "dark") {
      t = a;
    } else {
      t = readStoredTheme();
      applyOrayaTheme(t);
    }
    setTheme(t);
  }, []);

  function toggle() {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      applyOrayaTheme(next);
      return next;
    });
  }

  const isDark = theme === "dark";
  const publicStyle =
    variant === "public"
      ? {
          border: "0.5px solid var(--oraya-nav-border)",
          backgroundColor: "rgba(197,164,109,0.06)",
          color: "var(--oraya-nav-text)",
        }
      : {
          border: "0.5px solid rgba(197,164,109,0.35)",
          backgroundColor: "rgba(255,255,255,0.04)",
          color: "var(--oraya-gold)",
        };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="shrink-0 max-w-[100%]"
      style={{
        fontFamily: "var(--font-lato), system-ui, sans-serif",
        fontSize: "10px",
        letterSpacing: "1.5px",
        textTransform: "uppercase" as const,
        padding: "8px 10px",
        borderRadius: "2px",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        minHeight: "36px",
        ...publicStyle,
      }}
    >
      <span aria-hidden style={{ fontSize: "14px", lineHeight: 1 }}>
        {isDark ? "☀" : "☾"}
      </span>
      <span className="hidden min-[400px]:inline">{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}
