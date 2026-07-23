import type { Metadata } from "next";
import VillaPage, { type VillaPageConfig } from "@/components/VillaPage";

// Remediation 5.5 — thin server wrapper over the shared VillaPage template
// (page content unchanged); the server layer adds the SEO metadata export.
export const metadata: Metadata = {
  title: "Villa Mechmech — Modern Mountain Retreat | Oraya",
  description:
    "A modern luxury retreat in the mountains of North Lebanon — heated pool, rooftop terrace, panoramic views, 5 minutes from Saint Charbel Monastery. Book with Oraya.",
};

const CONFIG: VillaPageConfig = {
  villa: "Villa Mechmech",
  slug: "mechmech",
  heroGradient: "linear-gradient(160deg, #1b3a2f 0%, #2b5040 35%, #1a2f24 65%, #0f1e17 100%)",
  locationLine: "Nature retreat · Mechmech, North Lebanon",
  taglineItalic: "Modern Mountain Retreat",
  aboutHeading: ["Where modern design meets", "mountain serenity"],
  aboutBody:
    "A modern luxury retreat nestled in the mountains of North Lebanon. Sleek design meets mountain serenity — heated pool, stamped concrete terraces, panoramic views, and cool mountain breezes. Just 5 minutes from Saint Charbel Monastery.",
  whyLabel: "Why Mechmech",
  details: [
    { label: "Bedrooms",    value: "3 (master with en-suite)" },
    { label: "Bathrooms",   value: "3" },
    { label: "Pool",        value: "Heated private pool" },
    { label: "Terrace",     value: "Rooftop terrace" },
    { label: "Winter room", value: "Panoramic — converts to open-air" },
    { label: "Outdoor",     value: "BBQ & stamped concrete terraces" },
    { label: "Parking",     value: "Private parking" },
    { label: "Amenities",   value: "Towels, robes, slippers, toiletries" },
  ],
  highlights: [
    "No AC needed — natural mountain breeze at night",
    "5 minutes from Saint Charbel Monastery",
    "Private modern villa in a charming mountain town",
    "Sleeps 6 (up to 8 with extra bedding), up to 25 day visitors",
  ],
  exploreLabel: "Explore Mechmech",
};

export default function VillaMechmechPage() {
  return <VillaPage config={CONFIG} />;
}
