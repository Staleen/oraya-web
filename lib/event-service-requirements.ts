import { EVENT_SERVICE_SEED_IDS } from "@/lib/event-service-exclusivity";
import { findSeedForAddonRow } from "@/lib/event-service-seed";
import { normalizeEventType } from "@/lib/event-types";

/** Service groups required by event type — drives Step 2 minimum-coverage validation. */
export type EventServiceGroup = "seating" | "decoration" | "catering" | "staff" | "lighting";

/** Human-readable labels for missing-group error messages. */
export const EVENT_SERVICE_GROUP_LABELS: Record<EventServiceGroup, string> = {
  seating: "seating",
  decoration: "decoration",
  catering: "catering",
  staff: "service staff",
  lighting: "lighting",
};

/** Seed IDs that satisfy each group (mirrors lib/event-service-exclusivity.ts groupings). */
const GROUP_SEED_MEMBERS: Record<EventServiceGroup, ReadonlyArray<string>> = {
  seating: [EVENT_SERVICE_SEED_IDS.basicSeating, EVENT_SERVICE_SEED_IDS.fullSeating],
  decoration: [
    EVENT_SERVICE_SEED_IDS.basicDecoration,
    EVENT_SERVICE_SEED_IDS.enhancedDecoration,
    EVENT_SERVICE_SEED_IDS.premiumDecoration,
  ],
  catering: [
    EVENT_SERVICE_SEED_IDS.lightCatering,
    EVENT_SERVICE_SEED_IDS.standardCatering,
    EVENT_SERVICE_SEED_IDS.premiumCatering,
  ],
  staff: [EVENT_SERVICE_SEED_IDS.staffOne, EVENT_SERVICE_SEED_IDS.staffBundle],
  lighting: [EVENT_SERVICE_SEED_IDS.basicLighting, EVENT_SERVICE_SEED_IDS.premiumLighting],
};

/** Required groups per canonical event type — keyed by canonical value (use normalizeEventType before lookup). */
const REQUIRED_GROUPS_BY_EVENT_TYPE: Record<string, ReadonlyArray<EventServiceGroup>> = {
  "Private Celebration": ["seating", "catering", "staff"],
  "Gender Reveal": ["seating", "decoration", "catering", "staff"],
  "Baptism / First Communion": ["seating", "catering", "staff"],
  "Wedding / Engagement": ["seating", "decoration", "catering", "staff", "lighting"],
  "Graduation Celebration": ["seating", "catering", "staff"],
  "Family Gathering / Reunion": ["seating", "catering", "staff"],
  "Dinner Event": ["seating", "catering", "staff"],
  "Wellness Retreat": ["seating", "catering", "staff"],
  "Corporate Event": ["seating", "catering", "staff"],
};

export function getRequiredEventServiceGroups(eventType: string | null | undefined): EventServiceGroup[] {
  if (!eventType?.trim()) return [];
  const canonical = normalizeEventType(eventType.trim());
  return [...(REQUIRED_GROUPS_BY_EVENT_TYPE[canonical] ?? [])];
}

/** Resolve a selected catalog row to the seed group it satisfies (if any). */
function resolveGroupForRow(row: { id: string; label: string }): EventServiceGroup | null {
  const seed = findSeedForAddonRow({ id: row.id, label: row.label });
  if (!seed) return null;
  for (const [group, ids] of Object.entries(GROUP_SEED_MEMBERS) as [EventServiceGroup, ReadonlyArray<string>][]) {
    if (ids.includes(seed.id)) return group;
  }
  return null;
}

/**
 * Compute groups missing from the selection for a given event type.
 * Returns canonical group names; UI looks up labels via EVENT_SERVICE_GROUP_LABELS.
 */
export function getMissingRequiredEventServiceGroups(
  eventType: string | null | undefined,
  selectedRows: ReadonlyArray<{ id: string; label: string }>,
): EventServiceGroup[] {
  const required = getRequiredEventServiceGroups(eventType);
  if (required.length === 0) return [];
  const covered = new Set<EventServiceGroup>();
  for (const row of selectedRows) {
    const group = resolveGroupForRow(row);
    if (group) covered.add(group);
  }
  return required.filter((group) => !covered.has(group));
}
