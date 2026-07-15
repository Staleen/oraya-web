import type { Metadata } from "next";
import HouseBookShell from "@/components/house-book/HouseBookShell";
import ByblosHouseBook from "@/components/house-book/ByblosHouseBook";

export const metadata: Metadata = {
  title: "Villa Byblos — The House Book | Oraya",
  description:
    "The Villa Byblos House Book — essentials, living spaces, house notes, checkout and contacts for your stay. Mastita · Jbeil · Lebanon.",
};

export default function ByblosHouseBookPage() {
  return (
    <HouseBookShell
      villaName="Villa Byblos"
      villaHref="/villas/byblos"
      exploreHref="/explore/byblos"
    >
      <ByblosHouseBook />
    </HouseBookShell>
  );
}
