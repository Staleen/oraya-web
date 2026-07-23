import type { Metadata } from "next";
import VillaPage, { type VillaPageConfig } from "@/components/VillaPage";

// Remediation 5.5 — thin server wrapper over the shared VillaPage template
// (page content unchanged); the server layer adds the SEO metadata export.
export const metadata: Metadata = {
  title: "Villa Byblos — Mediterranean Garden Estate | Oraya",
  description:
    "A lush garden escape near the historic coast of Byblos — private pool framed by fruit trees, olive-grove breakfasts, 10 minutes from Byblos Old Souk. Book with Oraya.",
};

const CONFIG: VillaPageConfig = {
  villa: "Villa Byblos",
  slug: "byblos",
  heroGradient: "linear-gradient(160deg, #283520 0%, #3a5028 35%, #1e2e14 65%, #111a0a 100%)",
  locationLine: "Cultural elegance · Jbeil, Byblos, Lebanon",
  taglineItalic: "Mediterranean Garden Estate",
  aboutHeading: ["Nature and elegance", "in perfect harmony"],
  aboutBody:
    "A lush garden escape near the historic coast of Byblos. Breakfast under olive trees, lounging beneath a grand umbrella tree, and a pool framed by fruit trees and flowers. Nature and elegance in perfect harmony. 10 minutes from Byblos Old Souk.",
  whyLabel: "Why Byblos",
  details: [
    { label: "Bedrooms",   value: "3 (master with en-suite)" },
    { label: "Bathrooms",  value: "3" },
    { label: "Pool",       value: "Private pool" },
    { label: "Garden",     value: "Lush garden with fruit trees" },
    { label: "Olive grove", value: "Breakfast zone beneath olive trees" },
    { label: "Shade tree", value: "Grand umbrella tree lounge" },
    { label: "Parking",    value: "Private parking" },
    { label: "Amenities",  value: "Towels, robes, slippers, toiletries" },
  ],
  highlights: [
    "Breakfast zone nestled in an olive grove",
    "Pool surrounded by fruit trees and flowers",
    "Grand umbrella tree shading the outdoor lounge",
    "10 minutes from Byblos Old Souk and harbour",
    "Sleeps 6 (up to 8 with extra bedding), up to 25 day visitors",
  ],
  exploreLabel: "Explore Byblos",
};

export default function VillaByblosPage() {
  return <VillaPage config={CONFIG} />;
}
