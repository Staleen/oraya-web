import type { Metadata } from "next";
import { Playfair_Display, Lato } from "next/font/google";
import "./globals.css";

const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const lato = Lato({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  variable: "--font-lato",
  display: "swap",
});

const SITE_URL   = "https://stayoraya.com";
const OG_IMAGE   = `${SITE_URL}/logos/ORAYA_emblem.png`;
const TITLE      = "Oraya | Luxury Boutique Villas in Lebanon";
const DESCRIPTION =
  "Oraya offers an exclusive collection of luxury boutique villas in Lebanon, where timeless elegance meets authentic Lebanese hospitality.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title:        TITLE,
  description:  DESCRIPTION,

  openGraph: {
    type:        "website",
    siteName:    "Oraya",
    url:         SITE_URL,
    title:       TITLE,
    description: DESCRIPTION,
    images: [
      {
        url:    OG_IMAGE,
        alt:    "Oraya — Luxury Boutique Villas in Lebanon",
        width:  1200,
        height: 630,
      },
    ],
    locale: "en_US",
  },

  twitter: {
    card:        "summary_large_image",
    title:       TITLE,
    description: DESCRIPTION,
    images:      [OG_IMAGE],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${playfairDisplay.variable} ${lato.variable}`}>
      <body>{children}</body>
    </html>
  );
}
