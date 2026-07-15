import type { Metadata } from "next";
import HouseBookShell from "@/components/house-book/HouseBookShell";
import MechmechHouseBook from "@/components/house-book/MechmechHouseBook";

export const metadata: Metadata = {
  title: "Villa Mechmech — The House Book | Oraya",
  description:
    "The Villa Mechmech House Book — essentials, living spaces, house notes, checkout and contacts for your stay. Mechmech · near Annaya · Mount Lebanon.",
};

export default function MechmechHouseBookPage() {
  return (
    <HouseBookShell
      villaName="Villa Mechmech"
      villaHref="/villas/mechmech"
      exploreHref="/explore/mechmech"
    >
      <MechmechHouseBook />
    </HouseBookShell>
  );
}
