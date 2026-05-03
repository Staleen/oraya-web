export const CANONICAL_EVENT_TYPES = [
  {
    value: "Private Celebration",
    label: "Private Celebration",
    description: "Birthday, dinner, gathering, or private occasion with flexible service setup and guest support.",
  },
  {
    value: "Gender Reveal",
    label: "Gender Reveal",
    description: "Family-friendly setup with seating, decoration, catering, and light service support.",
  },
  {
    value: "Baptism / First Communion",
    label: "Baptism / First Communion",
    description: "Family gathering with seating, shaded areas, catering flow, and light hospitality.",
  },
  {
    value: "Wedding / Engagement",
    label: "Wedding / Engagement",
    description: "Premium celebration with seating, decoration, lighting, AV, and full service coordination.",
  },
  {
    value: "Graduation Celebration",
    label: "Graduation Celebration",
    description: "Milestone celebration with seating, catering, decoration, and guest support.",
  },
  {
    value: "Family Gathering / Reunion",
    label: "Family Gathering / Reunion",
    description: "Multi-generation event with flexible seating, shade, catering, and guest flow.",
  },
  {
    value: "Dinner Event",
    label: "Dinner Event",
    description: "Seated dining with table service, lighting, catering, and ambiance setup.",
  },
  {
    value: "Wellness Retreat",
    label: "Wellness Retreat",
    description: "Calm group retreat with shade, seating, catering, and light hospitality.",
  },
  {
    value: "Corporate Event",
    label: "Corporate Event",
    description: "Professional gathering with seating, AV, lighting, service, and arrival flow.",
  },
] as const;

export type CanonicalEventType = (typeof CANONICAL_EVENT_TYPES)[number]["value"];

// All canonical values as a plain string array (useful for checkbox lists).
export const CANONICAL_EVENT_TYPE_VALUES: string[] = CANONICAL_EVENT_TYPES.map((t) => t.value);

// Maps every historical and intermediate event type string to its canonical value.
// Used to normalize form.eventType, applicable_event_types filters, and recommendation lookups.
const NORMALIZATION_MAP: Record<string, CanonicalEventType> = {
  // Private Celebration (absorbs personal / creative celebrations)
  "Private Celebration":             "Private Celebration",
  "Birthday Party":                  "Private Celebration",
  "Anniversary Celebration":         "Private Celebration",
  "Baby Shower":                     "Private Celebration",
  "Friends Gathering":               "Private Celebration",
  "Photoshoot / Content Production": "Private Celebration",
  "Filming / Production":            "Private Celebration",
  // Gender Reveal
  "Gender Reveal":                   "Gender Reveal",
  // Baptism / First Communion
  "Baptism / First Communion":       "Baptism / First Communion",
  "Baptism":                         "Baptism / First Communion",
  "First Communion":                 "Baptism / First Communion",
  "Baptism / Family Gathering":      "Baptism / First Communion",
  // Wedding / Engagement
  "Wedding / Engagement":            "Wedding / Engagement",
  "Wedding":                         "Wedding / Engagement",
  "Engagement":                      "Wedding / Engagement",
  "Proposal Setup":                  "Wedding / Engagement",
  // Graduation Celebration
  "Graduation Celebration":          "Graduation Celebration",
  // Family Gathering / Reunion
  "Family Gathering / Reunion":      "Family Gathering / Reunion",
  "Family Gathering":                "Family Gathering / Reunion",
  "Family Reunion":                  "Family Gathering / Reunion",
  // Dinner Event
  "Dinner Event":                    "Dinner Event",
  // Wellness Retreat
  "Wellness Retreat":                "Wellness Retreat",
  // Corporate Event (absorbs professional / structured events)
  "Corporate Event":                 "Corporate Event",
  "Team Building":                   "Corporate Event",
  "Product Launch":                  "Corporate Event",
  "Networking Event":                "Corporate Event",
  "Workshop / Seminar":              "Corporate Event",
};

/**
 * Maps any historical or current event type string to its canonical value.
 * Returns the input unchanged when no mapping exists — preserves display of
 * unknown legacy values without throwing.
 */
export function normalizeEventType(input: string): string {
  return NORMALIZATION_MAP[input] ?? input;
}
