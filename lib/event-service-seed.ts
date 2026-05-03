import { type CanonicalEventType } from "@/lib/event-types";

export interface EventServiceSeedDefinition {
  id: string;
  label: string;
  category: string;
  recommended: boolean;
  applicable_event_types: CanonicalEventType[];
  display_order: number;
}

function makeStableEventServiceId(label: string): string {
  return `event_svc_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
}

export const EVENT_SERVICE_GROUP_ORDER = [
  "Setup & Seating",
  "Food & Hospitality",
  "Production & Atmosphere",
  "Arrival & Guest Flow",
  "Requested Services",
] as const;

export const EVENT_SERVICE_SEED_DEFINITIONS: EventServiceSeedDefinition[] = [
  {
    id: makeStableEventServiceId("Basic seating setup"),
    label: "Basic seating setup",
    category: "Setup & Seating",
    recommended: true,
    applicable_event_types: [
      "Gender Reveal",
      "Baptism / First Communion",
      "Family Gathering / Reunion",
      "Wellness Retreat",
      "Corporate Event",
    ],
    display_order: 0,
  },
  {
    id: makeStableEventServiceId("Tables and chairs"),
    label: "Tables and chairs",
    category: "Setup & Seating",
    recommended: true,
    applicable_event_types: [
      "Private Celebration",
      "Gender Reveal",
      "Baptism / First Communion",
      "Wedding / Engagement",
      "Graduation Celebration",
      "Family Gathering / Reunion",
      "Dinner Event",
      "Corporate Event",
    ],
    display_order: 1,
  },
  {
    id: makeStableEventServiceId("Umbrellas / shaded areas"),
    label: "Umbrellas / shaded areas",
    category: "Setup & Seating",
    recommended: true,
    applicable_event_types: [
      "Baptism / First Communion",
      "Family Gathering / Reunion",
      "Wellness Retreat",
    ],
    display_order: 2,
  },
  {
    id: makeStableEventServiceId("Catering / buffet setup"),
    label: "Catering / buffet setup",
    category: "Food & Hospitality",
    recommended: true,
    applicable_event_types: [
      "Private Celebration",
      "Gender Reveal",
      "Baptism / First Communion",
      "Graduation Celebration",
      "Family Gathering / Reunion",
      "Dinner Event",
      "Wellness Retreat",
    ],
    display_order: 3,
  },
  {
    id: makeStableEventServiceId("Service staff coordination"),
    label: "Service staff coordination",
    category: "Food & Hospitality",
    recommended: true,
    applicable_event_types: [
      "Private Celebration",
      "Gender Reveal",
      "Baptism / First Communion",
      "Wedding / Engagement",
      "Graduation Celebration",
      "Family Gathering / Reunion",
      "Dinner Event",
      "Wellness Retreat",
    ],
    display_order: 4,
  },
  {
    id: makeStableEventServiceId("Decoration support"),
    label: "Decoration support",
    category: "Production & Atmosphere",
    recommended: true,
    applicable_event_types: [
      "Private Celebration",
      "Gender Reveal",
      "Wedding / Engagement",
      "Graduation Celebration",
      "Dinner Event",
      "Wellness Retreat",
    ],
    display_order: 5,
  },
  {
    id: makeStableEventServiceId("AV / sound"),
    label: "AV / sound",
    category: "Production & Atmosphere",
    recommended: true,
    applicable_event_types: [
      "Wedding / Engagement",
      "Corporate Event",
    ],
    display_order: 6,
  },
  {
    id: makeStableEventServiceId("Lighting"),
    label: "Lighting",
    category: "Production & Atmosphere",
    recommended: true,
    applicable_event_types: [
      "Wedding / Engagement",
      "Dinner Event",
      "Corporate Event",
    ],
    display_order: 7,
  },
  {
    id: makeStableEventServiceId("Music coordination"),
    label: "Music coordination",
    category: "Production & Atmosphere",
    recommended: true,
    applicable_event_types: [
      "Private Celebration",
      "Graduation Celebration",
    ],
    display_order: 8,
  },
  {
    id: makeStableEventServiceId("Photography coordination"),
    label: "Photography coordination",
    category: "Production & Atmosphere",
    recommended: false,
    applicable_event_types: [],
    display_order: 9,
  },
  {
    id: makeStableEventServiceId("Valet"),
    label: "Valet",
    category: "Arrival & Guest Flow",
    recommended: true,
    applicable_event_types: [
      "Corporate Event",
    ],
    display_order: 10,
  },
];

export function findEventServiceSeedByLabel(label: string): EventServiceSeedDefinition | undefined {
  const normalized = label.trim().toLocaleLowerCase();
  return EVENT_SERVICE_SEED_DEFINITIONS.find((item) => item.label.toLocaleLowerCase() === normalized);
}
