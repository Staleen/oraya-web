export type ServiceIntent = "basic" | "full" | "premium";
export type IntelligenceConfidence = "low" | "medium" | "high";

export type InternalPricingIntelligence = {
  internal_value: number;
  tier: ServiceIntent;
  confidence: IntelligenceConfidence;
  basis: {
    bedroom_factor: number;
    bedrooms: number;
    guests: number;
    event_inquiry: boolean;
    service_intent?: ServiceIntent;
  };
};

type ConfidenceInput = {
  eventInquiry: boolean;
  guests: number;
  servicesCount: number;
  addonsCount: number;
};

type InternalPricingIntelligenceInput = {
  fullVillaBase: number;
  bedrooms?: number | null;
  guests?: number | null;
  addonsValue?: number | null;
  addonsCount?: number | null;
  eventInquiry?: boolean;
  servicesCount?: number | null;
};

const BEDROOM_COUNT_RE = /Bedrooms to be used:\s*(\d)\s*(?:Bedroom|Bedrooms)?/i;
const REQUESTED_SERVICES_RE = /(?:All\s+)?Requested Services:\s*([^\n\r]+)/i;

function clampBedroomCount(value: number | null | undefined) {
  if (value === 1 || value === 2 || value === 3) return value;
  return 3;
}

function readFiniteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function determineTier(input: {
  eventInquiry: boolean;
  guests: number;
  servicesCount: number;
  addonsCount: number;
}): ServiceIntent {
  if (input.eventInquiry) {
    return computeServiceIntent(input.servicesCount);
  }

  if (input.guests > 6) return "premium";
  if (input.guests > 4 || input.addonsCount > 0) return "full";
  return "basic";
}

export function computeBedroomFactor(bedrooms: number) {
  if (bedrooms === 1) return 0.6;
  if (bedrooms === 2) return 0.8;
  if (bedrooms === 3) return 1.0;
  return 1.0;
}

export function computeServiceIntent(serviceCount: number): ServiceIntent {
  if (serviceCount >= 6) return "premium";
  if (serviceCount >= 3) return "full";
  return "basic";
}

export function computeConfidence(input: ConfidenceInput): IntelligenceConfidence {
  if (input.eventInquiry || input.guests > 6 || input.servicesCount >= 6) {
    return "high";
  }

  if (input.addonsCount > 0 || input.guests > 4) {
    return "medium";
  }

  return "low";
}

export function computeInternalPricingIntelligence(
  input: InternalPricingIntelligenceInput
): InternalPricingIntelligence {
  const bedrooms = clampBedroomCount(input.bedrooms);
  const guests = Math.max(0, Math.trunc(readFiniteNumber(input.guests ?? 0)));
  const eventInquiry = input.eventInquiry === true;
  const servicesCount = Math.max(0, Math.trunc(readFiniteNumber(input.servicesCount ?? 0)));
  const addonsValue = Math.max(0, readFiniteNumber(input.addonsValue ?? 0));
  const addonsCount = Math.max(0, Math.trunc(readFiniteNumber(input.addonsCount ?? 0)));
  const bedroomFactor = computeBedroomFactor(bedrooms);

  let adjustedStayValue = Math.max(0, readFiniteNumber(input.fullVillaBase)) * bedroomFactor;
  if (guests > 6) {
    adjustedStayValue *= 1.2;
  }

  const tier = determineTier({
    eventInquiry,
    guests,
    servicesCount,
    addonsCount,
  });

  return {
    internal_value: Math.round(adjustedStayValue + addonsValue),
    tier,
    confidence: computeConfidence({
      eventInquiry,
      guests,
      servicesCount,
      addonsCount,
    }),
    basis: {
      bedroom_factor: bedroomFactor,
      bedrooms,
      guests,
      event_inquiry: eventInquiry,
      ...(eventInquiry ? { service_intent: computeServiceIntent(servicesCount) } : {}),
    },
  };
}

export function parseBedroomCountFromMessage(message: string | null | undefined) {
  if (!message) return null;

  const match = BEDROOM_COUNT_RE.exec(message);
  if (!match) return null;

  const parsed = Number(match[1]);
  return parsed === 1 || parsed === 2 || parsed === 3 ? parsed : null;
}

export function detectEventInquiry(message: string | null | undefined) {
  return typeof message === "string" && message.includes("[Event Inquiry]");
}

export function parseRequestedServiceCount(message: string | null | undefined) {
  if (!message) return 0;

  const match = REQUESTED_SERVICES_RE.exec(message);
  if (!match) return 0;

  const value = match[1].trim();
  if (!value || /^none$/i.test(value)) return 0;

  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean).length;
}
