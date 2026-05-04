import { EVENT_SERVICE_SEED_DEFINITIONS, findSeedForAddonRow } from "@/lib/event-service-seed";
import { normalizeEventType } from "@/lib/event-types";

/** Canonical seed ids — single source for grouping (matches `lib/event-service-seed.ts`). */
export const EVENT_SERVICE_SEED_IDS = {
  basicSeating: "event_svc_basic_seating_setup",
  fullSeating: "event_svc_full_seating_setup_up_to_30_guests",
  premiumTable: "event_svc_premium_table_styling",
  basicDecoration: "event_svc_basic_decoration",
  enhancedDecoration: "event_svc_enhanced_decoration",
  premiumDecoration: "event_svc_premium_decoration_experience",
  cateringCoordination: "event_svc_catering_coordination",
  lightCatering: "event_svc_light_catering",
  standardCatering: "event_svc_standard_catering",
  premiumCatering: "event_svc_premium_catering",
  staffOne: "event_svc_service_staff_1_person",
  staffBundle: "event_svc_service_staff_bundle_2_to_3_people",
  musicSetup: "event_svc_music_setup",
  dj: "event_svc_dj_service",
  basicLighting: "event_svc_basic_lighting",
  premiumLighting: "event_svc_premium_lighting_atmosphere",
  eventCoordination: "event_svc_event_coordination",
} as const;

/** Within each row, at most one seed id may be selected at a time. */
const MUTUALLY_EXCLUSIVE_SEED_GROUPS: string[][] = [
  [EVENT_SERVICE_SEED_IDS.basicSeating, EVENT_SERVICE_SEED_IDS.fullSeating],
  [EVENT_SERVICE_SEED_IDS.lightCatering, EVENT_SERVICE_SEED_IDS.standardCatering, EVENT_SERVICE_SEED_IDS.premiumCatering],
  [EVENT_SERVICE_SEED_IDS.basicDecoration, EVENT_SERVICE_SEED_IDS.enhancedDecoration, EVENT_SERVICE_SEED_IDS.premiumDecoration],
  [EVENT_SERVICE_SEED_IDS.basicLighting, EVENT_SERVICE_SEED_IDS.premiumLighting],
  [EVENT_SERVICE_SEED_IDS.musicSetup, EVENT_SERVICE_SEED_IDS.dj],
  [EVENT_SERVICE_SEED_IDS.staffOne, EVENT_SERVICE_SEED_IDS.staffBundle],
];

const CATERING_PACKAGE_IDS = new Set<string>([
  EVENT_SERVICE_SEED_IDS.lightCatering,
  EVENT_SERVICE_SEED_IDS.standardCatering,
  EVENT_SERVICE_SEED_IDS.premiumCatering,
]);

const ALL_SEED_IDS = new Set(EVENT_SERVICE_SEED_DEFINITIONS.map((s) => s.id));

export type CatalogRow = { id: string; label: string; key: string };

export function canonicalSeedIdForCatalogRow(row: CatalogRow): string | null {
  const seed = findSeedForAddonRow({ id: row.id, label: row.label });
  return seed?.id ?? null;
}

/** Other seed ids to deselect when `selectedSeedId` is turned on (same mutual group + catering/coordination rules). */
export function getSeedIdsToClearWhenSelecting(selectedSeedId: string): Set<string> {
  const out = new Set<string>();
  if (!ALL_SEED_IDS.has(selectedSeedId)) return out;

  for (const group of MUTUALLY_EXCLUSIVE_SEED_GROUPS) {
    if (group.includes(selectedSeedId)) {
      for (const id of group) {
        if (id !== selectedSeedId) out.add(id);
      }
    }
  }

  if (CATERING_PACKAGE_IDS.has(selectedSeedId)) {
    out.add(EVENT_SERVICE_SEED_IDS.cateringCoordination);
  }
  if (selectedSeedId === EVENT_SERVICE_SEED_IDS.cateringCoordination) {
    for (const id of Array.from(CATERING_PACKAGE_IDS)) out.add(id);
  }

  return out;
}

/** Map seed ids → catalog keys for rows in the current catalog. */
export function catalogKeysForSeedIds(catalog: CatalogRow[], seedIds: Set<string>): string[] {
  const keys: string[] = [];
  for (const row of catalog) {
    const sid = canonicalSeedIdForCatalogRow(row);
    if (sid && seedIds.has(sid)) keys.push(row.key);
  }
  return keys;
}

export type PackPreset = {
  seating: "basic" | "full";
  decoration: "basic" | "enhanced" | "premium";
  catering: "light" | "standard" | "premium";
  staff: "single" | "bundle";
  lighting: "basic" | "premium" | null;
  music: "setup" | "dj" | null;
  premiumTable: boolean;
};

function packPresetForEventType(canonical: string): PackPreset {
  if (canonical === "Wedding / Engagement") {
    return {
      seating: "full",
      decoration: "premium",
      catering: "premium",
      staff: "bundle",
      lighting: "premium",
      music: "dj",
      premiumTable: true,
    };
  }
  if (canonical === "Dinner Event") {
    return {
      seating: "full",
      decoration: "enhanced",
      catering: "standard",
      staff: "bundle",
      lighting: "premium",
      music: null,
      premiumTable: true,
    };
  }
  if (canonical === "Corporate Event") {
    return {
      seating: "basic",
      decoration: "basic",
      catering: "standard",
      staff: "bundle",
      lighting: "basic",
      music: null,
      premiumTable: true,
    };
  }
  if (canonical === "Graduation Celebration") {
    return {
      seating: "full",
      decoration: "enhanced",
      catering: "standard",
      staff: "bundle",
      lighting: null,
      music: "setup",
      premiumTable: false,
    };
  }
  if (canonical === "Gender Reveal") {
    return {
      seating: "basic",
      decoration: "enhanced",
      catering: "light",
      staff: "single",
      lighting: null,
      music: null,
      premiumTable: false,
    };
  }
  if (canonical === "Wellness Retreat") {
    return {
      seating: "basic",
      decoration: "basic",
      catering: "light",
      staff: "single",
      lighting: null,
      music: null,
      premiumTable: false,
    };
  }
  if (canonical === "Private Celebration") {
    return {
      seating: "full",
      decoration: "enhanced",
      catering: "standard",
      staff: "bundle",
      lighting: null,
      music: null,
      premiumTable: true,
    };
  }
  /* Baptism / First Communion, Family Gathering / Reunion, and any other canonical type */
  return {
    seating: "full",
    decoration: "enhanced",
    catering: "standard",
    staff: "bundle",
    lighting: null,
    music: null,
    premiumTable: false,
  };
}

/**
 * One logical default per exclusivity group for "Add recommended" — no duplicate tiers,
 * no catering coordination when a catering package is included.
 */
export function resolveRecommendedPackSeedIds(canonicalEventType: string): Set<string> {
  const canonical = normalizeEventType(canonicalEventType);
  const p = packPresetForEventType(canonical);
  const seeds = new Set<string>();

  seeds.add(p.seating === "basic" ? EVENT_SERVICE_SEED_IDS.basicSeating : EVENT_SERVICE_SEED_IDS.fullSeating);
  seeds.add(
    p.decoration === "basic"
      ? EVENT_SERVICE_SEED_IDS.basicDecoration
      : p.decoration === "enhanced"
        ? EVENT_SERVICE_SEED_IDS.enhancedDecoration
        : EVENT_SERVICE_SEED_IDS.premiumDecoration,
  );
  seeds.add(
    p.catering === "light"
      ? EVENT_SERVICE_SEED_IDS.lightCatering
      : p.catering === "standard"
        ? EVENT_SERVICE_SEED_IDS.standardCatering
        : EVENT_SERVICE_SEED_IDS.premiumCatering,
  );
  seeds.add(p.staff === "single" ? EVENT_SERVICE_SEED_IDS.staffOne : EVENT_SERVICE_SEED_IDS.staffBundle);

  if (p.premiumTable) seeds.add(EVENT_SERVICE_SEED_IDS.premiumTable);
  if (p.lighting === "basic") seeds.add(EVENT_SERVICE_SEED_IDS.basicLighting);
  if (p.lighting === "premium") seeds.add(EVENT_SERVICE_SEED_IDS.premiumLighting);
  if (p.music === "setup") seeds.add(EVENT_SERVICE_SEED_IDS.musicSetup);
  if (p.music === "dj") seeds.add(EVENT_SERVICE_SEED_IDS.dj);

  seeds.add(EVENT_SERVICE_SEED_IDS.eventCoordination);
  return seeds;
}

export function buildRecommendedQuantities(
  catalog: CatalogRow[],
  seedIds: Set<string>,
  attendeeCap: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of catalog) {
    const sid = canonicalSeedIdForCatalogRow(row);
    if (!sid || !seedIds.has(sid)) continue;
    const seed = EVENT_SERVICE_SEED_DEFINITIONS.find((s) => s.id === sid);
    if (!seed) continue;
    if (!seed.quantity_enabled) {
      out[row.key] = 1;
      continue;
    }
    if (seed.pricing_unit === "per_guest" || seed.pricing_model === "per_person_per_day") {
      const min = typeof seed.min_quantity === "number" ? seed.min_quantity : 1;
      const max = typeof seed.max_quantity === "number" ? seed.max_quantity : attendeeCap;
      out[row.key] = Math.min(Math.max(attendeeCap, min), max);
    } else {
      const min = typeof seed.min_quantity === "number" ? seed.min_quantity : 1;
      out[row.key] = min;
    }
  }
  return out;
}
