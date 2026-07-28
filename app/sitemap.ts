import type { MetadataRoute } from "next";
import { KNOWN_VILLAS, getVillaSlug } from "@/lib/calendar/villas";

const SITE_URL = "https://stayoraya.com";

/**
 * Public pages only. Private signed-token routes (/arrival, /booking/view,
 * /payments/checkout), auth flows, and /admin are intentionally absent and
 * disallowed in app/robots.ts.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const villaSlugs = KNOWN_VILLAS.map((villa) => getVillaSlug(villa)).filter(
    (slug): slug is string => slug !== null
  );

  const villaPages: MetadataRoute.Sitemap = villaSlugs.map((slug) => ({
    url: `${SITE_URL}/villas/${slug}`,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  const explorePages: MetadataRoute.Sitemap = villaSlugs.map((slug) => ({
    url: `${SITE_URL}/explore/${slug}`,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const houseBookPages: MetadataRoute.Sitemap = villaSlugs.map((slug) => ({
    url: `${SITE_URL}/house-book/${slug}`,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  const legalPages: MetadataRoute.Sitemap = [
    "terms",
    "privacy",
    "payment",
    "refund",
  ].map((slug) => ({
    url: `${SITE_URL}/legal/${slug}`,
    changeFrequency: "yearly",
    priority: 0.3,
  }));

  return [
    {
      url: SITE_URL,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    ...villaPages,
    {
      url: `${SITE_URL}/book`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/events/inquiry`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...explorePages,
    ...houseBookPages,
    ...legalPages,
  ];
}
