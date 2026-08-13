/**
 * W7 slice 3/5 — the step-up deadline and the only handle the bank's post-back
 * is allowed to carry.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/payments/step-up.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildStepUpReturnUrl,
  isStepUpExpired,
  signStepUpReturnToken,
  stepUpDeadlineIso,
  verifyStepUpReturnToken,
  STEP_UP_TTL_MINUTES,
} from "./step-up.ts";

const SECRET = "test-secret-not-a-real-one";
const ATTEMPT = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-08-13T12:00:00.000Z");

test("the window is 15 minutes, and it sits INSIDE the 20-minute capture context", () => {
  assert.equal(STEP_UP_TTL_MINUTES, 15);
  // The transient token call 2 re-presents dies with the capture context that
  // minted it (DEFAULT_CAPTURE_CONTEXT_TTL_MINUTES = 20). A longer step-up
  // window would hand the guest a challenge they can finish and a token that
  // can no longer pay with it.
  assert.ok(STEP_UP_TTL_MINUTES < 20);
});

test("the deadline is a stored instant, not an interval", () => {
  assert.equal(stepUpDeadlineIso(NOW), "2026-08-13T12:15:00.000Z");
});

test("a challenge is live before its deadline and dead after it", () => {
  const deadline = stepUpDeadlineIso(NOW);
  assert.equal(isStepUpExpired(deadline, new Date("2026-08-13T12:14:59.000Z")), false);
  assert.equal(isStepUpExpired(deadline, new Date("2026-08-13T12:15:00.000Z")), true);
  assert.equal(isStepUpExpired(deadline, new Date("2026-08-13T12:15:01.000Z")), true);
});

test("a deadline Oraya cannot read counts as EXPIRED", () => {
  // Fail toward not authorizing. A row that cannot be dated must not be
  // validated against.
  for (const bad of [null, undefined, "", "   ", "not-a-date"]) {
    assert.equal(isStepUpExpired(bad, NOW), true, `expected expired for ${JSON.stringify(bad)}`);
  }
});

test("a token Oraya minted names its attempt, and nothing else does", () => {
  const token = signStepUpReturnToken(ATTEMPT, SECRET);
  assert.equal(verifyStepUpReturnToken(token, SECRET), ATTEMPT);
});

test("a forged or tampered token names nothing", () => {
  const token = signStepUpReturnToken(ATTEMPT, SECRET);
  const [payload, signature] = token.split(".");
  const otherAttempt = Buffer.from("22222222-2222-4222-8222-222222222222", "utf8").toString("base64url");

  // Swapping the attempt id keeps the old signature — this is the attack that
  // would let one guest drive another guest's payment.
  assert.equal(verifyStepUpReturnToken(`${otherAttempt}.${signature}`, SECRET), null);
  // A bare attempt id is not a token.
  assert.equal(verifyStepUpReturnToken(ATTEMPT, SECRET), null);
  // Signed with a different secret.
  assert.equal(verifyStepUpReturnToken(signStepUpReturnToken(ATTEMPT, "other"), SECRET), null);
  // Structural rubbish.
  for (const bad of [null, undefined, "", "   ", ".", `${payload}.`, `.${signature}`]) {
    assert.equal(verifyStepUpReturnToken(bad, SECRET), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

test("verification fails closed when there is no secret", () => {
  const token = signStepUpReturnToken(ATTEMPT, SECRET);
  assert.equal(verifyStepUpReturnToken(token, ""), null);
});

test("the return URL is absolute, on the given origin, and carries only the token", () => {
  const url = buildStepUpReturnUrl("https://www.stayoraya.com", ATTEMPT, SECRET);
  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://www.stayoraya.com");
  assert.ok(parsed.pathname.startsWith("/api/payments/3ds-return/"));
  // The attempt id must not be legible in the URL as a bare parameter.
  assert.ok(!url.includes(ATTEMPT));
  assert.equal(parsed.search, "");

  const handle = decodeURIComponent(parsed.pathname.split("/").pop()!);
  assert.equal(verifyStepUpReturnToken(handle, SECRET), ATTEMPT);
});

test("a trailing slash on the origin does not produce a double slash", () => {
  const url = buildStepUpReturnUrl("https://www.stayoraya.com/", ATTEMPT, SECRET);
  assert.ok(url.startsWith("https://www.stayoraya.com/api/payments/3ds-return/"));
});
