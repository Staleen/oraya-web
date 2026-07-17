import { BookingMediaProvider } from "@/components/BookingMediaProvider";
import { getFirstMediaUrl, getPublicVillaMedia } from "@/lib/public-villa-media";

export const dynamic = "force-dynamic";

export default async function BookLayout({ children }: { children: React.ReactNode }) {
  const media = await getPublicVillaMedia(["general", "mechmech", "byblos"]);
  const generalCover = getFirstMediaUrl(media, "general");

  return (
    <BookingMediaProvider
      media={{
        mechmech: getFirstMediaUrl(media, "mechmech") || generalCover,
        byblos: getFirstMediaUrl(media, "byblos") || generalCover,
      }}
    >
      {children}
    </BookingMediaProvider>
  );
}
