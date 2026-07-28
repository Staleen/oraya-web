import type { MetadataRoute } from "next";

const SITE_URL = "https://stayoraya.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api/",
        "/arrival/",
        "/booking/",
        "/booking-action/",
        "/booking-confirmed",
        "/payments/",
        "/profile",
        "/login",
        "/join",
        "/welcome",
        "/forgot-password",
        "/reset-password",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
