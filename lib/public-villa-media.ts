import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";

export interface PublicVillaMedia {
  id: string;
  villa: string;
  category: string;
  file_url: string;
  display_order: number;
}

const readPublicVillaMedia = unstable_cache(
  async (villas: string[]): Promise<PublicVillaMedia[]> => {
    const { data, error } = await supabaseAdmin
      .from("villa_media")
      .select("id, villa, category, file_url, display_order")
      .in("villa", villas)
      .order("display_order", { ascending: true });

    if (error) throw new Error(error.message);

    return (data ?? []).filter(
      (item): item is PublicVillaMedia =>
        typeof item.id === "string" &&
        typeof item.villa === "string" &&
        typeof item.category === "string" &&
        typeof item.file_url === "string" &&
        item.file_url.length > 0 &&
        typeof item.display_order === "number",
    );
  },
  ["public-villa-media"],
  { revalidate: 300 },
);

export async function getPublicVillaMedia(villas: string[]): Promise<PublicVillaMedia[]> {
  try {
    return await readPublicVillaMedia([...villas].sort());
  } catch (error) {
    console.error(
      "[public-villa-media] Public media is unavailable:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return [];
  }
}

export function getFirstMediaUrl(media: PublicVillaMedia[], villa: string): string {
  return media.find((item) => item.villa === villa)?.file_url ?? "";
}
