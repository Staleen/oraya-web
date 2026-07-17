import VillaMechmechClient from "@/app/villas/mechmech/villa-mechmech-client";
import { getPublicVillaMedia } from "@/lib/public-villa-media";

export const dynamic = "force-dynamic";

export default async function VillaMechmechPage() {
  const media = await getPublicVillaMedia(["mechmech"]);
  return <VillaMechmechClient initialMedia={media} />;
}
