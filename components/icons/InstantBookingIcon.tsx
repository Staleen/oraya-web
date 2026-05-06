/**
 * Inline SVG — instant booking visual identity (no raster assets).
 * Gold ring + emerald check; stroke weights stay light for premium minimal look.
 */

type Props = {
  size?: number;
  className?: string;
};

/** Emerald accent — not a theme token; used only for this brand mark per design brief. */
const INSTANT_CHECK = "#2d9d72";

export default function InstantBookingIcon({ size = 20, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9.25" stroke="var(--oraya-gold)" strokeWidth="1.1" />
      <path
        d="M7.35 12.05 L10.45 14.95 L16.65 9.15"
        stroke={INSTANT_CHECK}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
