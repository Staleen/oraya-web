import VillaByblosClient from "@/app/villas/byblos/villa-byblos-client";
import { getPublicVillaMedia } from "@/lib/public-villa-media";

export const dynamic = "force-dynamic";

export default async function VillaByblosPage() {
  const media = await getPublicVillaMedia(["byblos"]);
  return <VillaByblosClient initialMedia={media} />;
}
