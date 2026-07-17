import HomeClient from "@/app/home-client";
import { getFirstMediaUrl, getPublicVillaMedia } from "@/lib/public-villa-media";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const media = await getPublicVillaMedia(["general", "mechmech", "byblos"]);

  return (
    <HomeClient
      initialMedia={{
        hero: getFirstMediaUrl(media, "general"),
        mechmech: getFirstMediaUrl(media, "mechmech"),
        byblos: getFirstMediaUrl(media, "byblos"),
      }}
    />
  );
}
