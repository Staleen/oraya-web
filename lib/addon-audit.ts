import { getAddonEnforcementMode, type AddonEnforcementMode } from "./addon-operations";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type AddonAuditReason = "insufficient_preparation_time" | "requires_approval";

export type AddonAuditInput = {
  check_in: string;
  addons: Array<{
    id: string;
    preparation_time_hours?: number | null;
    requires_approval?: boolean | null;
    enforcement_mode?: AddonEnforcementMode | null;
  }>;
  now?: Date;
};

export type AddonAuditResult = {
  ok: boolean;
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

  const insufficientPreparationTime = input.addons.some((addon) => {
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
    violations: {
      insufficient_preparation_time: insufficientPreparationTime,
      requires_approval: requiresApproval,
    },
    would_block_reasons: wouldBlockReasons,
    warnings: softAvailabilityWarnings,
  };
}
