/**
 * Villa-specific Arrival Guide content (Phase 16C Stage 2).
 *
 * Converted from the PR #73 Claude Design mobile Arrival Guides
 * (docs/design/phase-16c/welcome-guide/claude-design-drafts/**).
 * Static copy only — NO access codes, NO PINs, NO guest data here.
 * Guest name / stay dates / booking reference are injected at render
 * time by app/arrival/[token]/page.tsx from the verified booking.
 *
 * The printed design's bracketed labels (photo placeholders, list
 * placeholders) are intentionally not rendered: photo slots render as
 * the design system's "intentional while empty" arch slots, and list
 * rows use the design's own unbracketed wording.
 */

export type ArrivalVillaSlug = "mechmech" | "byblos";

export interface ArrivalRow {
  label: string;
  text: string;
}

export interface ArrivalVillaContent {
  slug: ArrivalVillaSlug;
  /** ["Villa", "Mechmech"] → “Villa <em>Mechmech</em>” */
  nameParts: [string, string];
  locality: string;
  roadTitlePlain: string; // “The road to ”
  roadTitleEm: string;    // “Mechmech”
  mapsUrl: string;
  travelRows: ArrivalRow[];
  /** Optional area plate SVG under the Getting-there screen (Byblos). */
  roadPlateSrc?: string;
  gateCaption: string;
  doorCaption: string;
  doorPanelTitle: string;
  doorPanelText: string;
  houseRows: ArrivalRow[];
  /** "half" tiles sit two per row; "full" spans the grid. */
  photoTiles: Array<"half" | "full">;
  exploreEyebrow: string;
  exploreRows: ArrivalRow[];
  exploreUrl: string;
}

export const WHATSAPP_URL = "https://wa.me/96171140041";
export const WEBSITE_URL = "https://stayoraya.com";
export const CONCIERGE_DISPLAY = "+961 71 140 041";

export const ARRIVAL_CONTENT: Record<ArrivalVillaSlug, ArrivalVillaContent> = {
  mechmech: {
    slug: "mechmech",
    nameParts: ["Villa", "Mechmech"],
    locality: "Mechmech · near Annaya · Mount Lebanon",
    roadTitlePlain: "The road to ",
    roadTitleEm: "Mechmech",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=34.130333,35.773083",
    travelRows: [
      { label: "From Beirut", text: "About 1 hr 20 min – 1 hr 40 min, depending on traffic." },
      { label: "From the airport", text: "About 1 hr 30 min – 1 hr 50 min, depending on traffic." },
      { label: "The last stretch", text: "Mountain road — follow the Google Maps pin, not shortcuts." },
    ],
    gateCaption: "The keypad at the sliding gate",
    doorCaption: "The keypad lock at the front door",
    doorPanelTitle: "Trouble getting in?",
    doorPanelText: "Wait a moment and try again — or message Oraya. We’re on it, any time.",
    houseRows: [
      { label: "Heated pool", text: "Readied before your stay. Cover back on after use." },
      { label: "Checkout", text: "11:00 AM — late or extended by advance confirmation." },
      { label: "Quiet hours", text: "11 PM – 8 AM — the hills carry sound." },
    ],
    photoTiles: ["half", "half", "half", "half"],
    exploreEyebrow: "Around Mechmech",
    exploreRows: [
      { label: "Nearby visits", text: "Saint Charbel, Laklouk, Baatara and more." },
      { label: "Food & cafés", text: "Current recommendations on the list." },
      { label: "Mini-market / bakery", text: "Nearest options on the list." },
      { label: "Pharmacy", text: "Nearest option on the list." },
      { label: "Drivers & reservations", text: "Arranged through Oraya — just message us." },
    ],
    exploreUrl: "https://stayoraya.com/explore/mechmech",
  },
  byblos: {
    slug: "byblos",
    nameParts: ["Villa", "Byblos"],
    locality: "Mastita · Jbeil · Lebanon",
    roadTitlePlain: "The road to ",
    roadTitleEm: "Mastita",
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=34.106387,35.661531",
    travelRows: [
      { label: "From Beirut", text: "About 45 minutes along the coast highway." },
      { label: "From the airport", text: "About 55 minutes, traffic willing." },
      { label: "The last stretch", text: "A hill road — follow the pin, not shortcuts." },
    ],
    roadPlateSrc: "/explore/oraya-coast-plate-jbeil-mastita.svg",
    gateCaption: "Gate keypad · Aqara U100",
    doorCaption: "Front-door lock · Aqara A100",
    doorPanelTitle: "PIN not accepted?",
    doorPanelText: "Wait a moment and try again — or message Oraya. We’re on it, any time.",
    houseRows: [
      { label: "Pool", text: "Readied before your stay. Cover off before swimming — back on after use." },
      { label: "Checkout", text: "11:00 AM — late or extended by advance confirmation." },
      { label: "Quiet hours", text: "11 PM – 8 AM — outdoor sound carries." },
    ],
    photoTiles: ["half", "half", "full"],
    exploreEyebrow: "Around Byblos",
    exploreRows: [
      { label: "Nearby visits", text: "Byblos Castle, the Old Souk, the harbour & beaches." },
      { label: "Food & cafés", text: "Current recommendations on the list." },
      { label: "Mini-market / bakery", text: "Nearest options on the list." },
      { label: "Pharmacy", text: "Nearest option on the list." },
      { label: "Drivers & reservations", text: "Arranged through Oraya — just message us." },
    ],
    exploreUrl: "https://stayoraya.com/explore/byblos",
  },
};
