/**
 * Phase 16B M1 — settlement truth for card money-return actions.
 *
 * A CyberSource authorization that was approved but never settled cannot be
 * refunded: a credit against an unsettled authorization fails with reason 102
 * (DINVALIDDATA). The correct instrument is an authorization reversal (void).
 *
 * Live evidence 2026-08-10/11 (merchant 06385000): request ids
 * 7863958223886680704897 and 7863969294066269704890 both returned Auth
 * SUCCESS + Decision Manager REJECT 481 + Settlement "Not Run"; a refund
 * against the first failed with 102.
 *
 * Pure helpers only — relative .ts imports so node:test can load this module
 * (repo test convention).
 */

export type CardSettlementState =
  /** Capture is in flight or done — a refund is the correct instrument. */
  | "settled"
  /** Approved authorization, capture never ran — void/auth-reverse, never refund. */
  | "authorized_only"
  /** Already voided/reversed at the provider — nothing left to return. */
  | "reversed"
  /** Could not be established — do not assert either way. */
  | "unknown";

/** Statuses that prove a capture exists or is on its way to the bank. */
export const SETTLED_PROVIDER_STATUSES = [
  "CAPTURED",
  "TRANSMITTED",
  "SETTLED",
  "COMPLETED",
  "PENDING",
  "REFUNDED",
  "PARTIAL_REFUNDED",
] as const;

/** Statuses that prove an authorization exists with no capture behind it. */
export const AUTHORIZED_ONLY_PROVIDER_STATUSES = [
  "AUTHORIZED",
  "AUTHORIZED_PENDING_REVIEW",
  "AUTHORIZED_RISK_DECLINED",
  "PENDING_REVIEW",
] as const;

/** Statuses that prove the authorization is already released. */
export const REVERSED_PROVIDER_STATUSES = [
  "REVERSED",
  "VOIDED",
  "CANCELLED",
  "AUTHORIZED_REVERSED",
] as const;

/** CyberSource reversal statuses that count as an accepted void. */
export const PROVIDER_REVERSAL_SUCCESS_STATUSES = [
  "REVERSED",
  "VOIDED",
  "PENDING",
  "COMPLETED",
] as const;

/** Decision Manager rejection — the order is rejected, settlement never runs. */
export const DECISION_MANAGER_REJECT_REASON_CODE = "481";

/** CyberSource reason for "credit is the wrong instrument here". */
export const REFUND_INVALID_DATA_REASON_CODE = "102";

function normalize(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function includesStatus(list: readonly string[], status: string | null | undefined): boolean {
  const normalized = normalize(status);
  return normalized ? list.includes(normalized) : false;
}

/**
 * Decide which money-return instrument a card receipt allows.
 * Fail-open to "unknown" — never guess "settled" from an absent status.
 */
export function classifyCardSettlementState(input: {
  status: string | null | undefined;
  /** applicationInformation.applications[].name of an executed capture, when present. */
  capture_present?: boolean;
}): CardSettlementState {
  if (input.capture_present === true) return "settled";
  if (includesStatus(REVERSED_PROVIDER_STATUSES, input.status)) return "reversed";
  if (includesStatus(AUTHORIZED_ONLY_PROVIDER_STATUSES, input.status)) return "authorized_only";
  if (includesStatus(SETTLED_PROVIDER_STATUSES, input.status)) return "settled";
  return "unknown";
}

/** True only for an explicit provider signal — never inferred from silence. */
export function isDecisionManagerReject(input: {
  reason_code?: string | null;
  error_reason?: string | null;
  risk_decision?: string | null;
  status?: string | null;
}): boolean {
  if (normalize(input.reason_code) === DECISION_MANAGER_REJECT_REASON_CODE) return true;
  if (normalize(input.error_reason) === "DECISION_PROFILE_REJECT") return true;
  if (normalize(input.risk_decision) === "REJECT") return true;
  if (normalize(input.status) === "AUTHORIZED_RISK_DECLINED") return true;
  return false;
}

/** True when a refund failure is the "wrong instrument for an unsettled auth" failure. */
export function isRefundInvalidDataFailure(input: {
  reason_code?: string | null;
  message?: string | null;
}): boolean {
  if (normalize(input.reason_code) === REFUND_INVALID_DATA_REASON_CODE) return true;
  return /DINVALIDDATA|INVALID_DATA/i.test(input.message ?? "");
}

export type CardReturnAction = "refund" | "void" | "none" | "unknown";

export type CardReturnGuidance = {
  action: CardReturnAction;
  /** Short owner-facing title for the offered action. */
  title: string;
  /** Owner-facing sentence explaining why this instrument and not the other. */
  copy: string;
};

/**
 * Owner-facing guidance for a card receipt. Copy is deliberately plain: the
 * operator must be able to act without knowing what "settlement" means.
 */
export function describeCardReturnAction(input: {
  state: CardSettlementState;
  decision_manager_reject?: boolean;
}): CardReturnGuidance {
  if (input.state === "authorized_only") {
    return {
      action: "void",
      title: "Void authorization",
      copy: input.decision_manager_reject
        ? "The bank approved the card but the payment was rejected by the gateway's fraud screen (reason 481) and the money was never taken. A refund is the wrong instrument here and will fail — void the authorization to release the hold."
        : "The card was authorized but the money was never taken, so there is nothing to refund. Void the authorization to release the hold on the guest's card.",
    };
  }
  if (input.state === "reversed") {
    return {
      action: "none",
      title: "Already voided",
      copy: "This authorization has already been released at the bank. No money moved, and there is nothing to refund or void.",
    };
  }
  if (input.state === "settled") {
    return {
      action: "refund",
      title: "Refund card",
      copy: "The money was taken from the guest's card, so a refund is the correct action.",
    };
  }
  return {
    action: "unknown",
    title: "Check Business Center",
    copy: "Oraya could not confirm with the bank whether this money was actually taken. Open Business Center and check the transaction before refunding or voiding.",
  };
}

/** Owner copy after a refund the gateway refused. Points at void for 102. */
export function explainRefundFailure(input: {
  reason_code?: string | null;
  message?: string | null;
  settlement_state?: CardSettlementState;
}): string {
  if (
    isRefundInvalidDataFailure({ reason_code: input.reason_code, message: input.message }) ||
    input.settlement_state === "authorized_only"
  ) {
    return "The gateway refused the refund because this money was never actually taken from the card — only authorized. Do not retry the refund: void the authorization instead to release the hold.";
  }
  return input.message?.trim() || "The gateway did not accept the refund.";
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function readString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Read the provider reason code wherever CyberSource puts it for this
 * integration: top-level `reasonCode`, `errorInformation.reason`, or the
 * per-application reason codes in `applicationInformation.applications[]`.
 */
export function readProviderReasonCode(payload: unknown): string | null {
  const record = asRecord(payload);
  if (!record) return null;
  const direct = readString(record.reasonCode);
  if (direct) return direct;

  const applicationInformation = asRecord(record.applicationInformation);
  const applicationReason = applicationInformation
    ? readString(applicationInformation.reasonCode)
    : null;
  if (applicationReason) return applicationReason;

  const applications = applicationInformation?.applications;
  if (Array.isArray(applications)) {
    for (const entry of applications) {
      const application = asRecord(entry);
      const reason = application ? readString(application.reasonCode) : null;
      if (reason && reason !== "100") return reason;
    }
  }
  return null;
}

/** riskInformation.profile.decision — "REJECT" / "ACCEPT" / "REVIEW". */
export function readRiskDecision(payload: unknown): string | null {
  const record = asRecord(payload);
  const risk = record ? asRecord(record.riskInformation) : null;
  const profile = risk ? asRecord(risk.profile) : null;
  return profile ? readString(profile.decision) : null;
}

/** True when applicationInformation proves a capture/settlement application ran. */
export function readCapturePresent(payload: unknown): boolean {
  const record = asRecord(payload);
  const applicationInformation = record ? asRecord(record.applicationInformation) : null;
  const applications = applicationInformation?.applications;
  if (!Array.isArray(applications)) return false;
  return applications.some((entry) => {
    const application = asRecord(entry);
    const name = readString(application?.name)?.toLowerCase() ?? "";
    const status = readString(application?.status)?.toUpperCase() ?? "";
    const reason = readString(application?.reasonCode) ?? "";
    const ran = status !== "" ? status !== "NOT_RUN" : reason === "100";
    // CyberSource names the capture application "ics_bill".
    return ran && /capture|settle|bill/.test(name);
  });
}

/** Amount echo for a reversal response (reversalAmountDetails.reversedAmount). */
export function readReversalResponseAmountDetails(
  payload:
    | {
        reversalAmountDetails?: { reversedAmount?: unknown; currency?: unknown } | null;
        orderInformation?: { amountDetails?: unknown } | null;
      }
    | null
    | undefined,
): { authorizedAmount?: unknown; totalAmount?: unknown; currency?: unknown } | null {
  const reversal = payload?.reversalAmountDetails;
  if (reversal && typeof reversal === "object") {
    return {
      authorizedAmount: reversal.reversedAmount,
      totalAmount: reversal.reversedAmount,
      currency: reversal.currency,
    };
  }
  const details = payload?.orderInformation?.amountDetails;
  return (details as { authorizedAmount?: unknown; totalAmount?: unknown; currency?: unknown }) ?? null;
}

export function isProviderReversalSuccessStatus(status: string | null | undefined): boolean {
  return includesStatus(PROVIDER_REVERSAL_SUCCESS_STATUSES, status);
}

export type ProviderReversalOutcome = "approved" | "declined" | "ambiguous";

/**
 * Classify a parsed authorization-reversal response.
 * Mirrors classifyProviderRefundOutcome: declined = safe to release the claim,
 * ambiguous = the hold may already be released, never auto-retry.
 */
export function classifyProviderReversalOutcome(input: {
  http_ok: boolean;
  http_status: number;
  status: string | null;
  reversal_id: string | null;
  amount_verified: boolean;
  decrypt_failed?: boolean;
}): ProviderReversalOutcome {
  if (input.decrypt_failed) return "ambiguous";
  if (
    input.http_ok &&
    input.reversal_id &&
    isProviderReversalSuccessStatus(input.status) &&
    input.amount_verified
  ) {
    return "approved";
  }
  // Apparent success without a verifiable amount echo — fail closed.
  if (input.http_ok && input.reversal_id && isProviderReversalSuccessStatus(input.status)) {
    return "ambiguous";
  }
  if (input.reversal_id) return "ambiguous";
  if (!input.http_ok && input.http_status >= 400 && input.http_status < 500) {
    return "declined";
  }
  return "ambiguous";
}
