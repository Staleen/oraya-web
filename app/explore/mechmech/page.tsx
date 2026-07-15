import type { Metadata } from "next";
import ExploreVillaPage, { type ExploreContent } from "@/components/explore/ExploreVillaPage";

export const metadata: Metadata = {
  title: "Explore Mechmech — The Living List | Oraya",
  description:
    "Oraya's living area guide around Villa Mechmech — Saint Charbel, Laklouk, Baatara and the latest local recommendations. Mechmech · near Annaya · Mount Lebanon.",
};

/**
 * PERMANENT ROUTE CONTRACT: printed Villa Mechmech House Books carry a QR
 * code encoding https://stayoraya.com/explore/mechmech. Do not rename or
 * move this route (see DECISIONS_LOG).
 */
const content: ExploreContent = {
  villaName: "Villa Mechmech",
  areaEyebrow: "Around Villa Mechmech",
  localityLine: "Mechmech · near Annaya · Mount Lebanon",
  intro:
    "Oraya's current area guide — openings change with the seasons; this list stays fresh. Scan-friendly, kept up to date, and always a message away from a personal recommendation.",
  plateSrc: "/explore/oraya-area-plate-mechmech.svg",
  plateAlt: "Mechmech area plate",
  attractions: [
    {
      time: "~5–10 min",
      name: "Saint Charbel · Annaya",
      text: "A nearby spiritual landmark and one of the area's most meaningful visits.",
    },
    {
      time: "~25–35 min",
      name: "Laklouk Highlands",
      text: "Mountain viewpoints, hiking routes, and winter snow scenery when in season.",
    },
    {
      time: "~45–60 min",
      name: "Baatara / Baloua Balaa",
      text: "A dramatic waterfall and natural chasm, best in the wet/spring season.",
    },
  ],
  tablesTitle: "Restaurants & cafés",
  tablesCopy:
    "Restaurants, cafés and family tables around Mechmech change with the seasons — Oraya can share the latest local recommendations before your stay. Message the concierge and we'll point you to what's open, what's good, and what suits the evening.",
  practicalTitle: "Practical & nearby",
  practicalCopy:
    "Mini-markets, bakeries, a pharmacy, ATMs and fuel are all minutes away. Ask Oraya for the nearest options — and for non-urgent pharmacy guidance, message the concierge day or night.",
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=34.130333,35.773083",
  villaHref: "/villas/mechmech",
  houseBookHref: "/house-book/mechmech",
};

export default function ExploreMechmechPage() {
  return <ExploreVillaPage content={content} />;
}
