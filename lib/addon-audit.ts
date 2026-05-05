import { getAddonEnforcementMode, getAddonTimingType, type AddonEnforcementMode } from "./addon-operations";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type AddonAuditReason = "insufficient_preparation_time" | "requires_approval";
export type AddonSnapshotStatus = "pending_approval" | "confirmed" | "at_risk";

export type AddonAuditInput = {
  check_in: string;
  check_out?: string | null;
  addons: Array<{
    id: string;
    label?: string | null;
    preparation_time_hours?: number | null;
    requires_approval?: boolean | null;
    enforcement_mode?: AddonEnforcementMode | null;
  }>;
  same_day_context?: {
    has_same_day_checkout: boolean;
    has_same_day_checkin: boolean;
  };
  now?: Date;
  /**
   * Add-on ids that skip strict preparation-time blocking (e.g. Phase 15I.5 heated pool
   * carry-over — eligibility must be validated server-side before populating this set).
   */
  strict_preparation_waivers?: ReadonlySet<string>;
};

export type AddonAuditResult = {
  ok: boolean;
  items: Array<{
    id: string;
    status: AddonSnapshotStatus;
    available: boolean;
    has_time_warning: boolean;
    same_day_warning: "same_day_checkout" | "same_day_checkin" | null;
  }>;
  violations: {
    insufficient_preparation_time: boolean;
    requires_approval: boolean;
  };
  would_block_reasons: AddonAuditReason[];
  warnings: string[];
};

function parseDateOnlyToUtcMillis(value: string): number | null {
  const match = ISO_DATE_RE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.getTime();
}

export function runAddonAudit(input: AddonAuditInput): AddonAuditResult {
  const now = input.now ?? new Date();
  const checkInUtcMillis = parseDateOnlyToUtcMillis(input.check_in);
  const hoursUntilCheckIn =
    checkInUtcMillis === null ? Number.POSITIVE_INFINITY : (checkInUtcMillis - now.getTime()) / 3_600_000;

  const items = input.addons.map((addon) => {
    const preparationTimeHours = addon.preparation_time_hours ?? null;
    const enforcementMode = getAddonEnforcementMode(addon.enforcement_mode);
    const timingType = getAddonTimingType(addon);
    const timingWaived = input.strict_preparation_waivers?.has(addon.id) ?? false;
    const hasTimeWarning =
      !timingWaived &&
      typeof preparationTimeHours === "number" &&
      Number.isFinite(preparationTimeHours) &&
      preparationTimeHours > 0 &&
      hoursUntilCheckIn < preparationTimeHours;
    const sameDayWarning: "same_day_checkout" | "same_day_checkin" | null =
      timingType === "early_checkin" && input.same_day_context?.has_same_day_checkout
        ? "same_day_checkout"
        : timingType === "late_checkout" && input.same_day_context?.has_same_day_checkin
          ? "same_day_checkin"
          : null;
    const available = !hasTimeWarning;

    let status: AddonSnapshotStatus = "confirmed";
    if (addon.requires_approval === true) {
      status = "pending_approval";
    } else if (enforcementMode === "soft" && hasTimeWarning) {
      status = "at_risk";
    }

    return {
      id: addon.id,
      status,
      available,
      has_time_warning: hasTimeWarning,
      same_day_warning: sameDayWarning,
    };
  });

  const insufficientPreparationTime = input.addons.some((addon) => {
    if (input.strict_preparation_waivers?.has(addon.id)) return false;
    const preparationTimeHours = addon.preparation_time_hours ?? null;
    const enforcementMode = getAddonEnforcementMode(addon.enforcement_mode);
    return typeof preparationTimeHours === "number" &&
      Number.isFinite(preparationTimeHours) &&
      preparationTimeHours > 0 &&
      enforcementMode === "strict" &&
      hoursUntilCheckIn < preparationTimeHours;
  });
  const softAvailabilityWarnings = input.addons.flatMap((addon) => {
    const preparationTimeHours = addon.preparation_time_hours ?? null;
    const enforcementMode = getAddonEnforcementMode(addon.enforcement_mode);
    if (
      typeof preparationTimeHours !== "number" ||
      !Number.isFinite(preparationTimeHours) ||
      preparationTimeHours <= 0 ||
      enforcementMode !== "soft" ||
      hoursUntilCheckIn >= preparationTimeHours
    ) {
      return [];
    }
    return [`${addon.id}: soft preparation warning`];
  });
  const sameDayWarnings = input.addons.flatMap((addon) => {
    const timingType = getAddonTimingType(addon);
    if (timingType === "early_checkin" && input.same_day_context?.has_same_day_checkout) {
      return [`${addon.id}: same-day checkout warning`];
    }
    if (timingType === "late_checkout" && input.same_day_context?.has_same_day_checkin) {
      return [`${addon.id}: same-day check-in warning`];
    }
    return [];
  });
  const requiresApproval = input.addons.some((addon) => addon.requires_approval === true);
  const wouldBlockReasons: AddonAuditReason[] = [];

  if (insufficientPreparationTime) {
    wouldBlockReasons.push("insufficient_preparation_time");
  }
  if (requiresApproval) {
    wouldBlockReasons.push("requires_approval");
  }

  return {
    ok: wouldBlockReasons.length === 0,
    items,
    violations: {
      insufficient_preparation_time: insufficientPreparationTime,
      requires_approval: requiresApproval,
    },
    would_block_reasons: wouldBlockReasons,
    warnings: [...softAvailabilityWarnings, ...sameDayWarnings],
  };
}
