/**
 * Focused tests for member-profile → canonical booking-view link minting.
 *
 * Runner: Node built-in `node:test` (Node ≥ 20).
 * Run from repo root:
 *   BOOKING_ACTION_SECRET=test-secret-for-unit-tests \
 *     node --experimental-strip-types --test lib/profile/member-booking-view.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { verifyViewToken } from "../booking-action-token.ts";
import {
  buildRelativeBookingViewPath,
  isSafeRelativeBookingViewPath,
} from "./booking-view-path.ts";
import {
  authorizeMemberBookingOwnership,
  mintRelativeBookingViewPath,
  resolveMemberBookingViewPath,
} from "./member-booking-view.ts";

const SECRET = "test-secret-for-unit-tests-profile-booking-view";
process.env.BOOKING_ACTION_SECRET = SECRET;

const MEMBER_A = "11111111-1111-1111-1111-111111111111";
const MEMBER_B = "22222222-2222-2222-2222-222222222222";
const BOOKING_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const ownedBooking = {
  id: BOOKING_ID,
  member_id: MEMBER_A,
  check_out: "2026-08-20",
};

// ─── Ownership / auth ─────────────────────────────────────────────────────────

test("unauthenticated rejection returns 401", () => {
  const r = authorizeMemberBookingOwnership(null, ownedBooking);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 401);
    assert.equal(r.error, "Unauthorized.");
  }
});

test("missing booking returns non-disclosing 404", () => {
  const r = authorizeMemberBookingOwnership(MEMBER_A, null);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 404);
    assert.equal(r.error, "Not found.");
  }
});

test("foreign booking returns non-disclosing 404", () => {
  const foreign = { ...ownedBooking, member_id: MEMBER_B };
  const r = authorizeMemberBookingOwnership(MEMBER_A, foreign);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 404);
    assert.equal(r.error, "Not found.");
  }
});

test("authenticated ownership success", () => {
  const r = authorizeMemberBookingOwnership(MEMBER_A, ownedBooking);
  assert.equal(r.ok, true);
});

// ─── Path generation ──────────────────────────────────────────────────────────

test("buildRelativeBookingViewPath produces a relative booking-view path", () => {
  const path = buildRelativeBookingViewPath("payload.sig");
  assert.equal(path, "/booking/view/payload.sig");
  assert.ok(path.startsWith("/booking/view/"));
  assert.ok(!path.startsWith("http"));
});

test("mintRelativeBookingViewPath yields a verifiable relative path", () => {
  const path = mintRelativeBookingViewPath(BOOKING_ID, "2026-08-20");
  assert.ok(isSafeRelativeBookingViewPath(path));

  const token = decodeURIComponent(path.slice("/booking/view/".length));
  const verified = verifyViewToken(token);
  assert.equal(verified.ok, true);
  if (verified.ok) {
    assert.equal(verified.booking_id, BOOKING_ID);
  }
});

test("resolveMemberBookingViewPath: ownership success returns relative path", () => {
  const r = resolveMemberBookingViewPath(MEMBER_A, BOOKING_ID, ownedBooking);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.ok(isSafeRelativeBookingViewPath(r.path));
    const token = decodeURIComponent(r.path.slice("/booking/view/".length));
    const verified = verifyViewToken(token);
    assert.equal(verified.ok, true);
    if (verified.ok) assert.equal(verified.booking_id, BOOKING_ID);
  }
});

test("resolveMemberBookingViewPath: unauthenticated → 401", () => {
  const r = resolveMemberBookingViewPath(null, BOOKING_ID, ownedBooking);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 401);
});

test("resolveMemberBookingViewPath: foreign booking → 404", () => {
  const foreign = { ...ownedBooking, member_id: MEMBER_B };
  const r = resolveMemberBookingViewPath(MEMBER_A, BOOKING_ID, foreign);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 404);
    assert.equal(r.error, "Not found.");
  }
});

test("resolveMemberBookingViewPath: missing booking_id → 400", () => {
  const r = resolveMemberBookingViewPath(MEMBER_A, "", ownedBooking);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 400);
});

// ─── Client-side path safety (profile navigation) ─────────────────────────────

test("isSafeRelativeBookingViewPath accepts only relative booking-view paths", () => {
  assert.equal(isSafeRelativeBookingViewPath("/booking/view/abc.def"), true);
  assert.equal(isSafeRelativeBookingViewPath("/booking/view/pay%3Dload.sig"), true);

  // Reject absolute / off-site / traversal / wrong surface
  assert.equal(isSafeRelativeBookingViewPath("https://evil.example/booking/view/x"), false);
  assert.equal(isSafeRelativeBookingViewPath("/booking/view/../admin"), false);
  assert.equal(isSafeRelativeBookingViewPath("/arrival/token"), false);
  assert.equal(isSafeRelativeBookingViewPath("/booking/view/"), false);
  assert.equal(isSafeRelativeBookingViewPath(null), false);
  assert.equal(isSafeRelativeBookingViewPath({ path: "/booking/view/x" }), false);
});

test("profile navigation helper: only safe paths would be pushed", () => {
  // Mirrors the client guard in app/profile/page.tsx before router.push.
  function shouldNavigate(path: unknown): boolean {
    return isSafeRelativeBookingViewPath(path);
  }

  const good = mintRelativeBookingViewPath(BOOKING_ID, "2026-08-20");
  assert.equal(shouldNavigate(good), true);
  assert.equal(shouldNavigate("https://stayoraya.com/booking/view/x"), false);
  assert.equal(shouldNavigate("/api/admin"), false);
});
