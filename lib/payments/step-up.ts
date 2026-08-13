/**
 * 3-D Secure step-up: the deadline, and the only handle the bank's post-back is
 * allowed to carry.
 *
 * Pure — `node:crypto` and relative `.ts` imports only, so node:test can load
 * it and so the two dangerous rules in W7 §3 are testable without a provider.
 */

import crypto from "node:crypto";

/**
 * How long a parked challenge stays validatable.
 *
 * 15 minutes, and it is deliberately SHORTER than the 20-minute capture-context
 * TTL (`DEFAULT_CAPTURE_CONTEXT_TTL_MINUTES` in credit-libanais.ts), not longer.
 * Call 2 re-presents the same transient token, which dies with the capture
 * context that minted it. A window longer than the context would hand the guest
 * a challenge they can finish and a token that can no longer pay with it — a
 * dead form, which is the failure the plan names.
 *
 * The residual case is a guest who sat on the card form for a while before
 * submitting: call 1 happens at T+n, so the deadline can in principle land past
 * the context's own expiry. That is safe, not silent — call 2 then fails as a
 * retry-safe non-charge (no payment resource is created) and the guest is
 * released to try again. It is never a lock and never a charge.
 */
export const STEP_UP_TTL_MINUTES = 15;

export function stepUpDeadlineIso(now: Date = new Date()): string {
  return new Date(now.getTime() + STEP_UP_TTL_MINUTES * 60 * 1000).toISOString();
}

/**
 * Has the window closed? Unparseable or missing deadlines read as EXPIRED —
 * a row Oraya cannot date is a row it must not authorize against.
 */
export function isStepUpExpired(deadlineIso: string | null | undefined, now: Date = new Date()): boolean {
  if (typeof deadlineIso !== "string" || !deadlineIso.trim()) return true;
  const deadline = Date.parse(deadlineIso);
  if (Number.isNaN(deadline)) return true;
  return deadline <= now.getTime();
}

/**
 * The bank posts its result back through the GUEST'S BROWSER, to a route that
 * by construction cannot require an Oraya session. Everything in that request
 * is attacker-controlled.
 *
 * So the return URL carries a token Oraya minted itself and signs: it names the
 * attempt, and nothing else in the post-back is allowed to. A bare attempt id
 * in the URL would let one guest drive another guest's payment.
 *
 * This proves only "Oraya issued this handle for this attempt". It proves
 * NOTHING about whether authentication succeeded — that answer comes from call
 * 2, server-side, and from nowhere else.
 */
export function signStepUpReturnToken(attemptId: string, secret: string): string {
  const id = attemptId.trim();
  if (!id) throw new Error("[payments/step-up] attempt id is required");
  if (!secret.trim()) throw new Error("[payments/step-up] signing secret is required");
  const payload = Buffer.from(id, "utf8").toString("base64url");
  return `${payload}.${hmac(payload, secret)}`;
}

/** The attempt id this token names, or null if it was not minted by Oraya. */
export function verifyStepUpReturnToken(token: string | null | undefined, secret: string): string | null {
  if (typeof token !== "string") return null;
  const trimmed = token.trim();
  if (!trimmed || !secret.trim()) return null;
  const separator = trimmed.lastIndexOf(".");
  if (separator <= 0 || separator === trimmed.length - 1) return null;
  const payload = trimmed.slice(0, separator);
  const signature = trimmed.slice(separator + 1);
  const expected = hmac(payload, secret);
  if (!timingSafeEqualStrings(signature, expected)) return null;
  try {
    const attemptId = Buffer.from(payload, "base64url").toString("utf8");
    return attemptId.trim() ? attemptId : null;
  } catch {
    return null;
  }
}

function hmac(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/** Absolute return URL for call 1. CyberSource bakes it into the step-up JWT. */
export function buildStepUpReturnUrl(origin: string, attemptId: string, secret: string): string {
  const base = origin.trim().replace(/\/+$/, "");
  if (!base) throw new Error("[payments/step-up] origin is required");
  return `${base}/api/payments/3ds-return/${encodeURIComponent(signStepUpReturnToken(attemptId, secret))}`;
}
