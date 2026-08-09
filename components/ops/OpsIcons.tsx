/**
 * Nav icons, drawn inline rather than pulled from an icon package.
 *
 * A dependency for eight glyphs is not worth the install, the bundle, or the
 * supply-chain surface — and the console's rule is no new dependencies without
 * approval. These are 24x24, stroke-based, and inherit `currentColor` so the
 * active/inactive colouring is handled entirely by the parent.
 *
 * They exist because a five-item bar of 11px text labels is hard to hit
 * accurately on a phone: an icon gives the thumb something to aim at and the
 * eye something to recognise without reading.
 */

export type IconName =
  | "today" | "enquiries" | "bookings" | "availability" | "business"
  | "pricing" | "extras" | "payments" | "photos" | "site" | "members"
  | "team" | "account" | "more";

const P = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const PATHS: Record<IconName, React.ReactNode> = {
  today: <><path {...P} d="M4 6.5h16M4 6.5v13h16v-13" /><path {...P} d="M8 3.5v4M16 3.5v4" /><circle cx="12" cy="13.5" r="2" {...P} /></>,
  enquiries: <><path {...P} d="M4.5 5.5h15v10h-9l-4 3.5v-3.5h-2z" /><path {...P} d="M8.5 10h7M8.5 12.8h4.5" /></>,
  bookings: <><path {...P} d="M5 4.5h14v15H5z" /><path {...P} d="M8.5 9h7M8.5 12.5h7M8.5 16h4" /></>,
  availability: <><path {...P} d="M4 6.5h16v13H4z" /><path {...P} d="M4 10.5h16M8 3.5v4M16 3.5v4" /><path {...P} d="M9 14.5l2 2 4-4" /></>,
  business: <><path {...P} d="M4 19.5h16" /><path {...P} d="M7 19.5v-7M12 19.5v-11M17 19.5v-5" /></>,
  pricing: <><circle cx="12" cy="12" r="8" {...P} /><path {...P} d="M12 7.5v9M14.2 9.8c-.5-.8-1.3-1.2-2.2-1.2-1.3 0-2.2.7-2.2 1.8 0 2.4 4.6 1.3 4.6 3.8 0 1.2-1 1.9-2.4 1.9-1 0-1.9-.4-2.4-1.3" /></>,
  extras: <><path {...P} d="M4.5 8.5h15v11h-15z" /><path {...P} d="M4.5 8.5l2-4h11l2 4M12 8.5v11" /></>,
  payments: <><path {...P} d="M3.5 6.5h17v11h-17z" /><path {...P} d="M3.5 10.5h17M7 14.5h3" /></>,
  photos: <><path {...P} d="M4 6.5h16v12H4z" /><circle cx="9" cy="10.5" r="1.5" {...P} /><path {...P} d="M4 15.5l4.5-3.5 4 3 3-2.2 4.5 3.2" /></>,
  site: <><circle cx="12" cy="12" r="8" {...P} /><path {...P} d="M4 12h16M12 4c2.2 2.2 3.2 5 3.2 8s-1 5.8-3.2 8c-2.2-2.2-3.2-5-3.2-8s1-5.8 3.2-8z" /></>,
  members: <><circle cx="9" cy="9" r="3.2" {...P} /><path {...P} d="M3.5 19.5c0-3.2 2.5-5.2 5.5-5.2s5.5 2 5.5 5.2" /><path {...P} d="M16 7.2a3 3 0 010 5.6M17.5 19.5c0-2-.6-3.6-1.6-4.7" /></>,
  team: <><circle cx="8" cy="9" r="3" {...P} /><circle cx="16" cy="9" r="3" {...P} /><path {...P} d="M3 19c0-2.8 2.2-4.6 5-4.6s5 1.8 5 4.6M13.5 14.9c.8-.3 1.6-.5 2.5-.5 2.8 0 5 1.8 5 4.6" /></>,
  account: <><circle cx="12" cy="8.5" r="3.5" {...P} /><path {...P} d="M5 20c0-3.6 3.1-5.8 7-5.8s7 2.2 7 5.8" /></>,
  more: <><circle cx="5.5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="18.5" cy="12" r="1.4" fill="currentColor" /></>,
};

export default function OpsIcon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      aria-hidden="true" focusable="false"
      style={{ display: "block", flexShrink: 0 }}
    >
      {PATHS[name]}
    </svg>
  );
}
