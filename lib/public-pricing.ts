"use client";

import { useEffect, useState } from "react";
import { getDefaultVillaPricing, type VillaBasePricing } from "@/lib/admin-pricing";

let cachedPricing: VillaBasePricing[] | null = null;
let inflightPricing: Promise<VillaBasePricing[]> | null = null;

async function fetchPublicPricing() {
  const response = await fetch("/api/pricing", { cache: "force-cache" });
  if (!response.ok) throw new Error("Failed to load pricing.");
  const data = await response.json();
  return Array.isArray(data.pricing) ? data.pricing as VillaBasePricing[] : getDefaultVillaPricing();
}

export function usePublicPricing() {
  const [pricing, setPricing] = useState<VillaBasePricing[]>(cachedPricing ?? getDefaultVillaPricing());

  useEffect(() => {
    if (cachedPricing) {
      setPricing(cachedPricing);
      return;
    }

    if (!inflightPricing) {
      inflightPricing = fetchPublicPricing()
        .then((data) => {
          cachedPricing = data;
          return data;
        })
        .catch(() => getDefaultVillaPricing())
        .finally(() => {
          inflightPricing = null;
        });
    }

    inflightPricing.then((data) => {
      cachedPricing = data;
      setPricing(data);
    });
  }, []);

  return pricing;
}
