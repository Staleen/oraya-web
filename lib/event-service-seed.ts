import { CANONICAL_EVENT_TYPE_VALUES, type CanonicalEventType } from "@/lib/event-types";

/** All 9 canonical event type values (for `applicable_event_types: "all"` expansion). */
export const ALL_CANONICAL_EVENT_TYPES = CANONICAL_EVENT_TYPE_VALUES as unknown as readonly CanonicalEventType[];

/** Sentinel: expand to every canonical event type at sync / fallback time. */
export const SEED_APPLICABLE_ALL_EVENT_TYPES = "all" as const;

export type EventServiceAddonPricingModel = "flat_fee" | "per_night" | "per_person_per_day" | "per_unit";

/**
 * Production defaults for managed event services (addons row + operational metadata via sync).
 * Catering "per person" in product copy maps to `per_person_per_day` on the addons row (existing enum).
 */
export interface EventServiceSeedDefinition {
  /** Stable primary key for new inserts; existing rows may match by label / aliases first. */
  id: string;
  label: string;
  /** Guest-safe copy; persisted in `addon_operational_settings.description` (not on `addons` row). */
  description: string;
  /** Legacy or alternate labels that should merge onto this canonical service (no duplicate rows). */
  matchAliases?: readonly string[];
  category: string;
  price: number;
  currency: "USD";
  pricing_model: EventServiceAddonPricingModel;
  recommended: boolean;
  /** `"all"` expands to all 9 canonical types at sync time. */
  applicable_event_types: readonly CanonicalEventType[] | typeof SEED_APPLICABLE_ALL_EVENT_TYPES;
  /** Advance notice expressed as hours (1 day = 24). */
  preparation_time_hours: number;
  enforcement_mode: "soft";
  requires_approval: boolean;
  quantity_enabled: boolean;
  pricing_unit: "fixed" | "per_guest" | "per_unit" | "per_hour" | "percentage" | null;
  unit_label: string | null;
  min_quantity: number | null;
  max_quantity: number | null;
  display_order: number;
}

export const EVENT_SERVICE_GROUP_ORDER = [
  "Setup & Seating",
  "Decoration & Styling",
  "Catering & Dining",
  "Staffing & Service",
  "Entertainment & Music",
  "Lighting & Ambience",
  "Coordination & Logistics",
  "Requested Services",
] as const;

export const EVENT_SERVICE_SEED_DEFINITIONS: EventServiceSeedDefinition[] = [
  {
    id: "event_svc_basic_seating_setup",
    label: "Basic Seating Setup",
    description:
      "Basic seating arrangement for small private events, including simple guest seating layout and placement coordination.",
    matchAliases: ["Basic seating setup"],
    category: "Setup & Seating",
    price: 350,
    currency: "USD",
    pricing_model: "flat_fee",
    recommended: true,
    applicable_event_types: SEED_APPLICABLE_ALL_EVENT_TYPES,
    preparation_time_hours: 24,
    enforcement_mode: "soft",
    requires_approval: false,
    quantity_enabled: false,
    pricing_unit: null,
    unit_label: "setup",
    min_quantity: null,
    max_quantity: null,
    display_order: 10,
  },
  {
    id: "event_svc_full_seating_setup_up_to_30_guests",
    label: "Full Seating Setup up to 30 guests",
    description:
      "Complete table and chair layout for up to 30 guests (base package). Pair with “Umbrellas / shaded areas” for outdoor shade and covered comfort — recommended setups include both for a full outdoor reception feel.",
    matchAliases: ["Tables and chairs"],
    category: "Setup & Seating",
    price: 400,
    currency: "USD",
    pricing_model: "flat_fee",
    recommended: true,
    applicable_event_types: SEED_APPLICABLE_ALL_EVENT_TYPES,
    preparation_time_hours: 24,
    enforcement_mode: "soft",
    requires_approval: false,
    quantity_enabled: false,
    pricing_unit: null,
    unit_label: "setup",
    min_quantity: null,
    max_quantity: null,
    display_order: 20,
  },
  {
    id: "event_svc_umbrellas_shaded_areas",
    label: "Umbrellas / shaded areas",
    description:
      "Outdoor umbrellas and shaded lounge or dining zones for guest comfort. Often combined with full seating setup; priced separately when you want shade without upgrading the full table package.",
    matchAliases: [
      "Umbrellas",
      "Shaded areas",
      "Umbrellas / chairs area",
      "Umbrellas and shaded areas",
      "Outdoor umbrellas",
    ],
    category: "Setup & Seating",
    price: 150,
    currency: "USD",
    pricing_model: "flat_fee",
    recommended: false,
    applicable_event_types: SEED_APPLICABLE_ALL_EVENT_TYPES,
    preparation_time_hours: 24,
    enforcement_mode: "soft",
    requires_approval: false,
    quantity_enabled: false,
    pricing_unit: null,
    unit_label: "setup",
    min_quantity: null,
    max_quantity: null,
    display_order: 25,
  },
  {
    id: "event_svc_premium_table_styling",
    label: "Premium Table Styling",
    description:
      "Enhanced table presentation with upgraded styling details for a more polished and premium event atmosphere.",
    category: "Setup & Seating",
    price: 250,
    currency: "USD",
    pricing_model: "flat_fee",
    recommended: false,
    applicable_event_types: [
      "Private Celebration",
      "Wedding / Engagement",
      "Baptism / First Communion",
      "Dinner Event",
      "Corporate Event",
    ],
    preparation_time_hours: 48,
    enforcement_mode: "soft",
    requires_approval: true,
    quantity_enabled: false,
    pricing_unit: null,
    unit_label: "setup",
    min_quantity: null,
    max_quantity: null,
    display_order: 30,
  },
  {
    id: "event_svc_basic_decoration",
    label: "Basic Decoration",
    description:
      "Simple decorative setup adapted to the event type, including light styling elements to improve the overall presentation.",
    matchAliases: ["Decoration support"],
    category: "Decoration & Styling",
    price: 300,
    currency: "USD",
    pricing_model: "flat_fee",
    recommended: true,
    applicable_event_types: [
      "Private Celebration",
      "Gender Reveal",
      "Baptism / First Communion",
      "Wedding / Engagement",
      "Graduation Celebration",
      "Family Gathering / Reunion",
      "Dinner Event",
    ],
    preparation_time_hours: 48,
    enforcement_mode: "soft",
    requires_approval: true,
    quantity_enabled: false,
    pricing_unit: null,
    unit_label: "setup",
    min_quantity: null,
    max_quantity: null,
    display_order: 40,
  },
  {
    id: "event_svc_enhanced_decoration",
    label: "Enhanced Decoration",
    description:
      "A more complete decoration setup with stronger visual impact, suitable for celebrations, family milestones, and elegant private events.",
    category: "Decoration & Styling",
    price: 600,
    currency: "USD",
    pricing_model: "flat_fee",
    recommended: true,
    applicable_event_types: [
      "Private Celebration",
      "Gender Reveal",
      "Baptism / First Communion",
      "Wedding / Engagement",
      "Graduation Celebration",
      "Dinner Event",
    ],
    preparation_time_hours: 72,
    enforcement_mode: "soft",
    requires_approval: true,
    quantity_enabled: false,
    pricing_unit: null,
    unit_label: "setup",
    min_quantity: null,
    max_quantity: null,
    display_order: 50,
  },
  {
    id: "event_svc_premium_decoration_experience",
    label: "Premium Decoration Experience",
    description:
      "A high-touch decoration experience for premium occasions, with a more detailed visual concept and elevated styling execution.",
    category: "Decoration & Styling",
    price: 1200,
    currency: "USD",
    pricing_model: "flat_fee",
    recommended: false,
    applicable_event_types: [
      "Wedding / Engagement",
      "Private Celebration",
      "Gender Reveal",
      "Baptism / First Communion",
    ],
    preparation_time_hours: 120,
    enforcement_mode: "soft",
    requires_approval: true,
    quantity_enabled: false,
    pricing_unit: null,
    unit_label: "setup",
    min_quantity: null,
    max_quantity: null,
    display_order: 60,
  },
  {
    id: "event_svc_catering_coordination",
    label: "Catering Coordination",
    description:
      "Coordination of catering requirements with approved suppliers, including menu direction, timing, delivery coordination, and setup alignment.",
    matchAliases: ["Catering / buffet setup"],
    category: "Catering & Dining",
    price: 200,
    currency: "USD",
    pricing_model: "flat_fee",
    recommended: true,
    applicable_event_types: SEED_APPLICABLE_ALL_EVENT_TYPES,
    preparation_time_hours: 48,
    enforcement_mode: "soft",
    requires_approval: true,
    quantity_enabled: false,
    pricing_unit: null,
    unit_label: "coordination",
    min_quantity: null,
    max_quantity: null,
    display_order: 70,
  },
  {
    id: "event_svc_light_catering",
    label: "Light Catering",
    description:
      "Light food and refreshment service suitable for casual gatherings, family events, and daytime private occasions.",
    category: "Catering & Dining",
    price: 35,
    currency: "USD",
    pricing_model: "per_person_per_day",
    recommended: false,
    applicable_event_types: [
      "Private Celebration",
      "Gender Reveal",
      "Baptism / First Communion",
      "Graduation Celebration",
      "Family Gathering / Reunion",
      "Dinner Event",
      "Wellness Retreat",
      "Corporate Event",
    ],
    preparation_time_hours: 72,
    enforcement_mode: "soft",
    requires_approval: true,
    quantity_enabled: true,
    pricing_unit: "per_guest",
    unit_label: "guest",
    min_quantity: 10,
    max_quantity: 30,
    display_order: 80,
  },
  {
    id: "event_svc_standard_catering",
    label: "Standard Catering",
    description:
      "Balanced catering option for private events, including a fuller food service suitable for most gatherings up to 30 guests.",
    category: "Catering & Dining",
    price: 50,
    currency: "USD",
    pricing_model: "per_person_per_day",
    recommended: true,
    applicable_event_types: SEED_APPLICABLE_ALL_EVENT_TYPES,
    preparation_time_hours: 72,
    enforcement_mode: "soft",
    requires_approval: true,
    quantity_enabled: true,
    pricing_unit: "per_guest",
    unit_label: "guest",
    min_quantity: 10,
    max_quantity: 30,
    display_order: 90,
  },
  {
    id: "event_svc_premium_catering",
    label: "Premium Catering",
    description:
      "Higher-end catering option for more refined events, with upgraded menu direction and stronger service expectations.",
    category: "Catering & Dining",
    price: 75,
    currency: "USD",
    pricing_model: "per_person_per_day",
    recommended: false,
    applicable_event_types: [
      "Private Celebration",
      "Wedding / Engagement",
      "Baptism / First Communion",
      "Dinner Event",
      "Wellness Retreat",
      "Corporate Event",
    ],
    preparation_time_hours: 120,
    enforcement_mode: "soft",
    requires_approval: true,
    quantity_enabled: true,
    pricing_unit: "per_guest",
    unit_label: "guest",
    min_quantity: 10,
    max_quantity: 30,
    display_order: 100,
  },
  {
    id: "event_svc_service_staff_1_person",
    label: "Service Staff - 1 Person",
    description:
      "One service staff member to support guest flow, light service needs, setup assistance, and event coordination during the booking.",
    category: "Staffing & Service",
    price: 100,
    currency: "USD",
    pricing_model: "per_unit",
    recommended: false,
    applicable_event_types: SEED_APPLICABLE_ALL_EVENT_TYPES,
    preparation_time_hours: 48,
    enforcement_mode: "soft",
    requires_approval: true,
    quantity_enabled: true,
    pricing_unit: "per_unit",
    unit_label: "staff member",
    min_quantity: 1,
    max_quantity: 3,
    display_order: 110,
  },
  {
    id: "event_svc_service_staff_bundle_2_to_3_people",
    label: "Service Staff Bundle 2 to 3 People",
    description:
      "Small service team for events requiring stronger guest support, food service assistance, and smoother event operation.",
    matchAliases: ["Service staff coordination"],
    category: "Staffing & Service",
    price: 250,
    currency: "USD",
    pricing_model: "flat_fee",
    recommended: true,
    applicable_event_types: [
      "Private Celebration",
      "Wedding / Engagement",
      "Baptism / First Communion",
      "Graduation Celebration",
      "Dinner Event",
      "Corporate Event",
    ],
    preparation_time_hours: 48,
    enforcement_mode: "soft",
    requires_approval: true,
    quantity_enabled: false,
    pricing_unit: null,
    unit_label: "staff bundle",
    min_quantity: null,
    max_quantity: null,
    display_order: 120,
  },
  {
    id: "event_svc_music_setup",
    label: "Music Setup",
    description:
      "Basic music setup coordination for background music or simple entertainment needs during private events.",
    matchAliases: ["Music coordination"],
    category: "Entertainment & Music",
    price: 300,
    currency: "USD",
    pricing_model: "flat_fee",
    recommended: false,
    applicable_event_types: [
      "Private Celebration",
      "Gender Reveal",
      "Wedding / Engagement",
      "Graduation Celebration",
      "Dinner Event",
    ],
    preparation_time_hours: 48,
    enforcement_mode: "soft",
    requires_approval: true,
    quantity_enabled: false,
    pricing_unit: null,
    unit_label: "setup",
    min_quantity: null,
    max_quantity: null,
    display_order: 130,
  },
  {
    id: "event_svc_dj_service",
    label: "DJ Service",
    description:
      "DJ coordination for celebrations requiring a more active music experience and stronger entertainment atmosphere.",
    matchAliases: ["AV / sound"],
    category: "Entertainment & Music",
    price: 500,
    currency: "USD",
    pricing_model: "flat_fee",
    recommended: false,
    applicable_event_types: ["Private Celebration", "Wedding / Engagement", "Graduation Celebration"],
    preparation_time_hours: 120,
    enforcement_mode: "soft",
    requires_approval: true,
    quantity_enabled: false,
    pricing_unit: null,
    unit_label: "service",
    min_quantity: null,
    max_quantity: null,
    display_order: 140,
  },
  {
    id: "event_svc_basic_lighting",
    label: "Basic Lighting",
    description: "Simple ambience lighting setup to improve the evening atmosphere and enhance the event setting.",
    matchAliases: ["Lighting"],
    category: "Lighting & Ambience",
    price: 200,
    currency: "USD",
    pricing_model: "flat_fee",
    recommended: false,
    applicable_event_types: ["Private Celebration", "Wedding / Engagement", "Dinner Event", "Corporate Event"],
    preparation_time_hours: 48,
    enforcement_mode: "soft",
    requires_approval: true,
    quantity_enabled: false,
    pricing_unit: null,
    unit_label: "setup",
    min_quantity: null,
    max_quantity: null,
    display_order: 150,
  },
  {
    id: "event_svc_premium_lighting_atmosphere",
    label: "Premium Lighting Atmosphere",
    description:
      "Enhanced lighting atmosphere for premium celebrations, dinner events, and wedding or engagement-style setups.",
    category: "Lighting & Ambience",
    price: 450,
    currency: "USD",
    pricing_model: "flat_fee",
    recommended: true,
    applicable_event_types: ["Wedding / Engagement", "Dinner Event", "Private Celebration"],
    preparation_time_hours: 72,
    enforcement_mode: "soft",
    requires_approval: true,
    quantity_enabled: false,
    pricing_unit: null,
    unit_label: "setup",
    min_quantity: null,
    max_quantity: null,
    display_order: 160,
  },
  {
    id: "event_svc_event_coordination",
    label: "Event Coordination",
    description:
      "Operational event coordination covering setup timing, supplier alignment, guest flow, and on-site readiness.",
    category: "Coordination & Logistics",
    price: 250,
    currency: "USD",
    pricing_model: "flat_fee",
    recommended: true,
    applicable_event_types: SEED_APPLICABLE_ALL_EVENT_TYPES,
    preparation_time_hours: 48,
    enforcement_mode: "soft",
    requires_approval: true,
    quantity_enabled: false,
    pricing_unit: null,
    unit_label: "coordination",
    min_quantity: null,
    max_quantity: null,
    display_order: 170,
  },
  {
    id: "event_svc_valet_service",
    label: "Valet Service",
    description:
      "Valet or parking coordination support for selected private events where guest arrival flow requires additional assistance.",
    matchAliases: ["Valet"],
    category: "Coordination & Logistics",
    price: 200,
    currency: "USD",
    pricing_model: "flat_fee",
    recommended: false,
    applicable_event_types: ["Wedding / Engagement", "Corporate Event", "Dinner Event", "Private Celebration"],
    preparation_time_hours: 120,
    enforcement_mode: "soft",
    requires_approval: true,
    quantity_enabled: false,
    pricing_unit: null,
    unit_label: "service",
    min_quantity: null,
    max_quantity: null,
    display_order: 180,
  },
];

export function expandSeedApplicableEventTypes(
  types: EventServiceSeedDefinition["applicable_event_types"],
): CanonicalEventType[] {
  const canonicalSet = new Set<string>(CANONICAL_EVENT_TYPE_VALUES);
  const raw =
    types === SEED_APPLICABLE_ALL_EVENT_TYPES ? [...CANONICAL_EVENT_TYPE_VALUES] : [...types];
  const out: CanonicalEventType[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    const n = canonicalSet.has(t) ? t : null;
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n as CanonicalEventType);
    }
  }
  return out;
}

function normLabelKey(s: string): string {
  return s.trim().toLocaleLowerCase();
}

function labelMatchSetForSeed(seed: EventServiceSeedDefinition): Set<string> {
  const s = new Set<string>();
  s.add(normLabelKey(seed.label));
  for (const a of seed.matchAliases ?? []) {
    s.add(normLabelKey(a));
  }
  return s;
}

/** Resolve a DB addon row to a canonical seed (by id, then label / aliases). */
export function findSeedForAddonRow(addon: { id: string; label: string }): EventServiceSeedDefinition | undefined {
  const byId = EVENT_SERVICE_SEED_DEFINITIONS.find((s) => s.id === addon.id);
  if (byId) return byId;
  const nl = normLabelKey(addon.label);
  return EVENT_SERVICE_SEED_DEFINITIONS.find((s) => labelMatchSetForSeed(s).has(nl));
}

export function findEventServiceSeedByLabel(label: string): EventServiceSeedDefinition | undefined {
  const normalized = label.trim().toLocaleLowerCase();
  for (const item of EVENT_SERVICE_SEED_DEFINITIONS) {
    if (item.label.trim().toLocaleLowerCase() === normalized) return item;
    if (item.matchAliases?.some((a) => a.trim().toLocaleLowerCase() === normalized)) return item;
  }
  return undefined;
}
