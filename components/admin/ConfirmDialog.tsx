"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { BORDER, LATO, MIDNIGHT, PLAYFAIR, WHITE } from "./theme";

/**
 * Remediation 5.6 — shared admin confirm dialog with the accessibility
 * behaviors the hand-rolled modals lacked: Escape closes, initial focus moves
 * into the dialog, Tab is trapped inside it, and focus returns to the
 * previously focused element on close. Visual styling matches the previous
 * inline feedback-email modal exactly.
 */
export default function ConfirmDialog({
  titleId,
  title,
  children,
  cancelLabel = "Cancel",
  confirmLabel,
  confirmColor = "#6fcf8a",
  confirmDisabled = false,
  busy = false,
  isMobile = false,
  onCancel,
  onConfirm,
}: {
  titleId: string;
  title: string;
  children?: ReactNode;
  cancelLabel?: string;
  confirmLabel: ReactNode;
  confirmColor?: string;
  confirmDisabled?: boolean;
  busy?: boolean;
  isMobile?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelButtonRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (!busyRef.current) onCancelRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const container = dialogRef.current;
      if (!container) return;
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !container.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1400,
        backgroundColor: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          maxWidth: "420px",
          width: "100%",
          borderRadius: "14px",
          border: `0.5px solid ${BORDER}`,
          background: "linear-gradient(180deg, rgba(26,37,53,0.99) 0%, rgba(18,29,43,0.99) 100%)",
          padding: isMobile ? "18px" : "22px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p
          id={titleId}
          style={{ fontFamily: PLAYFAIR, fontSize: "1.35rem", color: WHITE, margin: "0 0 10px", lineHeight: 1.35 }}
        >
          {title}
        </p>
        {children}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            ref={cancelButtonRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            style={{
              fontFamily: LATO,
              fontSize: "11px",
              letterSpacing: "1.4px",
              textTransform: "uppercase",
              color: WHITE,
              backgroundColor: "transparent",
              border: `0.5px solid ${BORDER}`,
              padding: "10px 16px",
              borderRadius: "6px",
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy || confirmDisabled}
            onClick={onConfirm}
            style={{
              fontFamily: LATO,
              fontSize: "11px",
              letterSpacing: "1.4px",
              textTransform: "uppercase",
              color: MIDNIGHT,
              backgroundColor: confirmColor,
              border: "none",
              padding: "10px 16px",
              borderRadius: "6px",
              cursor: busy || confirmDisabled ? "not-allowed" : "pointer",
              opacity: busy || confirmDisabled ? 0.6 : 1,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
