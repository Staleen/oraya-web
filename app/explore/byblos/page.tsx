import type { Metadata } from "next";
import ExploreVillaPage, { type ExploreContent } from "@/components/explore/ExploreVillaPage";

export const metadata: Metadata = {
  title: "Explore Byblos — The Living List | Oraya",
  description:
    "Oraya's living area guide around Villa Byblos — the castle, the Old Souk, the harbour and the latest local recommendations. Mastita · Jbeil · Lebanon.",
};

/**
 * PERMANENT ROUTE CONTRACT: printed Villa Byblos House Books carry a QR
 * code encoding https://stayoraya.com/explore/byblos. Do not rename or
 * move this route (see DECISIONS_LOG).
 */
const content: ExploreContent = {
  villaName: "Villa Byblos",
  areaEyebrow: "Around Villa Byblos",
  localityLine: "Mastita · Jbeil — between the mountains and the sea",
  intro:
    "Oraya's current area guide — openings change with the seasons; this list stays fresh. Scan-friendly, kept up to date, and always a message away from a personal recommendation.",
  plateSrc: "/explore/oraya-coast-plate-jbeil-mastita.svg",
  plateAlt: "Jbeil–Mastita coast plate",
  attractions: [
    {
      time: "~10 min",
      name: "Byblos Castle",
      text: "The Crusader castle above one of the world's oldest harbours. Go late afternoon, for the light.",
    },
    {
      time: "~10 min",
      name: "The Old Souk",
      text: "Stone lanes, small ateliers, evening cafés — unhurried, exactly as it should be.",
    },
    {
      time: "~12 min",
      name: "Harbour & beaches",
      text: "The fishing port, the seafront walk, and swims — sandy or rocky — either side of town.",
    },
  ],
  tablesTitle: "Tables we recommend",
  tablesCopy:
    "Seafood on the harbour, Lebanese and mezze in the Old Souk, breakfast on the seafront — Oraya can share the latest recommendations before your stay. Message the concierge and we'll point you to what's open, what's good, and what suits the evening.",
  practicalTitle: "Practical & nearby",
  practicalCopy:
    "Daily basics and ice from the Mastita mini-market (5 min), manakish from the morning oven (5 min), pharmacies and banks in Jbeil (8 min), fuel on the Jbeil highway. Ask Oraya for the nearest options any time.",
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=34.106387,35.661531",
  villaHref: "/villas/byblos",
  houseBookHref: "/house-book/byblos",
};

export default function ExploreByblosPage() {
  return <ExploreVillaPage content={content} />;
}
