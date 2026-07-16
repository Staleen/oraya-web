/**
 * Focused tests for the Phase 16C confirmed-stay WhatsApp webhook dispatcher.
 *
 * Runner: Node built-in `node:test` (Node ≥ 20).
 * Run from repo root:
 *   node --experimental-strip-types --test lib/whatsapp/confirmed-stay-notification.test.mts
 *
 * All runtime I/O (supabase claim, member lookup, reference helper, webhook
 * POST) is injected; the real Arrival Guide mint is exercised in one test via
 * a test BOOKING_ACTION_SECRET.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CONFIRMED_STAY_TEMPLATE_NAME,
  buildConfirmedStayWebhookPayload,
  dispatchConfirmedStayWhatsAppNotification,
  isEventInquiryStay,
  isStayCheckOutInPast,
  normalizeWhatsAppPhone,
  resolveDispatchEnvironmentGate,
  type ConfirmedStayBookingInput,
  type ConfirmedStayDispatchDeps,
  type ConfirmedStayWebhookPayload,
} from "./confirmed-stay-notification.ts";

const BOOKING_ID = "0f28c563-9a1b-4c2d-8e3f-a4b5c6d7e8f9";
const REFERENCE = "0F28C563";
const GUIDE_URL = "https://stayoraya.com/arrival/test-signed-view-token";
const WEBHOOK_URL = "https://example-whatchimp.test/workflow/abc";

const PROD_ENV = {
  WHATCHIMP_CONFIRMED_STAY_WEBHOOK_URL: WEBHOOK_URL,
  VERCEL_ENV: "production",
};

function baseBooking(overrides: Partial<ConfirmedStayBookingInput> = {}): ConfirmedStayBookingInput {
  return {
    booking_id: BOOKING_ID,
    status: "confirmed",
    villa: "Villa Byblos",
    check_in: "2026-08-19",
    check_out: "2026-08-20",
    event_type: null,
    message: null,
    guest_name: "David Hourany",
    guest_phone: "+961 3-123 456",
    member_id: null,
    ...overrides,
  };
}

interface Recorder {
  claims: string[];
  posts: Array<{ url: string; payload: ConfirmedStayWebhookPayload; secret: string | null }>;
  memberLookups: string[];
}

function makeDeps(
  recorder: Recorder,
  overrides: Partial<ConfirmedStayDispatchDeps> = {},
): ConfirmedStayDispatchDeps {
  return {
    env: PROD_ENV,
    todayUtc: () => "2026-07-17",
    claimWhatsAppConfirmation: async (id) => {
      recorder.claims.push(id);
      return "claimed";
    },
    lookupMemberContact: async (memberId) => {
      recorder.memberLookups.push(memberId);
      return { full_name: "Member Name", phone: "+961 70 999 888" };
    },
    formatReference: async () => REFERENCE,
    mintArrivalGuideUrl: () => GUIDE_URL,
    postWebhook: async (url, payload, secret) => {
      recorder.posts.push({ url, payload, secret });
      return { ok: true, status: 200 };
    },
    ...overrides,
  };
}

function newRecorder(): Recorder {
  return { claims: [], posts: [], memberLookups: [] };
}

// ─── Happy path ───────────────────────────────────────────────────────────────

test("confirmed eligible stay dispatches exactly once with the exact payload", async () => {
  const recorder = newRecorder();
  const result = await dispatchConfirmedStayWhatsAppNotification(baseBooking(), makeDeps(recorder));

  assert.deepEqual(result, { dispatched: true, httpStatus: 200 });
  assert.equal(recorder.claims.length, 1);
  assert.equal(recorder.posts.length, 1);
  assert.equal(recorder.posts[0].url, WEBHOOK_URL);
  assert.equal(recorder.posts[0].secret, null);
  assert.deepEqual(recorder.posts[0].payload, {
    event: "booking_confirmed",
    template: CONFIRMED_STAY_TEMPLATE_NAME,
    guest_name: "David Hourany",
    phone: "9613123456",
    villa: "Villa Byblos",
    check_in: "2026-08-19",
    check_out: "2026-08-20",
    booking_reference: REFERENCE,
    arrival_guide_url: GUIDE_URL,
  });
});

test("payload allow-list carries no UUID / PIN / access / payment keys", async () => {
  const recorder = newRecorder();
  await dispatchConfirmedStayWhatsAppNotification(baseBooking(), makeDeps(recorder));
  const keys = Object.keys(recorder.posts[0].payload).sort();
  assert.deepEqual(keys, [
    "arrival_guide_url",
    "booking_reference",
    "check_in",
    "check_out",
    "event",
    "guest_name",
    "phone",
    "template",
    "villa",
  ]);
});

test("shared secret is passed to the POST only when configured", async () => {
  const recorder = newRecorder();
  await dispatchConfirmedStayWhatsAppNotification(
    baseBooking(),
    makeDeps(recorder, {
      env: { ...PROD_ENV, WHATCHIMP_CONFIRMED_STAY_WEBHOOK_SECRET: "shh-shared" },
    }),
  );
  assert.equal(recorder.posts[0].secret, "shh-shared");
});

test("real Arrival Guide helper mints /arrival/<token> into the payload", async () => {
  process.env.BOOKING_ACTION_SECRET = "test-secret-confirmed-stay-dispatch";
  delete process.env.NEXT_PUBLIC_SITE_URL;
  try {
    const recorder = newRecorder();
    const result = await dispatchConfirmedStayWhatsAppNotification(
      baseBooking(),
      makeDeps(recorder, { mintArrivalGuideUrl: undefined }),
    );
    assert.equal(result.dispatched, true);
    assert.ok(
      recorder.posts[0].payload.arrival_guide_url.startsWith("https://stayoraya.com/arrival/"),
    );
  } finally {
    delete process.env.BOOKING_ACTION_SECRET;
  }
});

// ─── Environment gates (fail closed, no claim, no POST) ──────────────────────

test("missing webhook URL skips as not_configured without claiming or posting", async () => {
  const recorder = newRecorder();
  const result = await dispatchConfirmedStayWhatsAppNotification(
    baseBooking(),
    makeDeps(recorder, { env: { VERCEL_ENV: "production" } }),
  );
  assert.deepEqual(result, { dispatched: false, reason: "not_configured" });
  assert.equal(recorder.claims.length, 0);
  assert.equal(recorder.posts.length, 0);
});

test("non-production without the opt-in skips as non_production", async () => {
  const recorder = newRecorder();
  const result = await dispatchConfirmedStayWhatsAppNotification(
    baseBooking(),
    makeDeps(recorder, {
      env: { WHATCHIMP_CONFIRMED_STAY_WEBHOOK_URL: WEBHOOK_URL, VERCEL_ENV: "preview" },
    }),
  );
  assert.deepEqual(result, { dispatched: false, reason: "non_production" });
  assert.equal(recorder.posts.length, 0);
});

test('non-production dispatches only when the opt-in is exactly "true"', async () => {
  const allowed = newRecorder();
  const blocked = newRecorder();
  const base = { WHATCHIMP_CONFIRMED_STAY_WEBHOOK_URL: WEBHOOK_URL, VERCEL_ENV: "preview" };

  await dispatchConfirmedStayWhatsAppNotification(
    baseBooking(),
    makeDeps(allowed, { env: { ...base, WHATSAPP_CONFIRMATION_ALLOW_NONPROD: "true" } }),
  );
  assert.equal(allowed.posts.length, 1);

  const result = await dispatchConfirmedStayWhatsAppNotification(
    baseBooking(),
    makeDeps(blocked, { env: { ...base, WHATSAPP_CONFIRMATION_ALLOW_NONPROD: "TRUE" } }),
  );
  assert.deepEqual(result, { dispatched: false, reason: "non_production" });
  assert.equal(blocked.posts.length, 0);
});

// ─── Booking-state gates ─────────────────────────────────────────────────────

test("non-confirmed statuses never dispatch", async () => {
  for (const status of ["pending", "cancelled", null, "requested"]) {
    const recorder = newRecorder();
    const result = await dispatchConfirmedStayWhatsAppNotification(
      baseBooking({ status }),
      makeDeps(recorder),
    );
    assert.deepEqual(result, { dispatched: false, reason: "not_confirmed" });
    assert.equal(recorder.claims.length + recorder.posts.length, 0);
  }
});

test("event inquiry confirmations never dispatch", async () => {
  const recorder = newRecorder();
  const result = await dispatchConfirmedStayWhatsAppNotification(
    baseBooking({ event_type: "wedding", message: "[Event Inquiry] Garden ceremony" }),
    makeDeps(recorder),
  );
  assert.deepEqual(result, { dispatched: false, reason: "event_inquiry" });
  assert.equal(recorder.claims.length + recorder.posts.length, 0);
});

test("missing phone everywhere skips as missing_phone", async () => {
  const recorder = newRecorder();
  const result = await dispatchConfirmedStayWhatsAppNotification(
    baseBooking({ guest_phone: null, member_id: null }),
    makeDeps(recorder),
  );
  assert.deepEqual(result, { dispatched: false, reason: "missing_phone" });
  assert.equal(recorder.claims.length + recorder.posts.length, 0);
});

test("member phone + full name fall back when the booking row has neither", async () => {
  const recorder = newRecorder();
  const result = await dispatchConfirmedStayWhatsAppNotification(
    baseBooking({ guest_phone: null, guest_name: null, member_id: "member-1" }),
    makeDeps(recorder),
  );
  assert.equal(result.dispatched, true);
  assert.equal(recorder.memberLookups.length, 1);
  assert.equal(recorder.posts[0].payload.phone, "96170999888");
  assert.equal(recorder.posts[0].payload.guest_name, "Member Name");
});

test("guest_name is omitted (not null) when unavailable anywhere", async () => {
  const recorder = newRecorder();
  await dispatchConfirmedStayWhatsAppNotification(
    baseBooking({ guest_name: null, member_id: null }),
    makeDeps(recorder),
  );
  assert.equal("guest_name" in recorder.posts[0].payload, false);
});

test("stay already checked out skips as expired_stay; checkout day itself still sends", async () => {
  const expired = newRecorder();
  const result = await dispatchConfirmedStayWhatsAppNotification(
    baseBooking({ check_out: "2026-07-16" }),
    makeDeps(expired),
  );
  assert.deepEqual(result, { dispatched: false, reason: "expired_stay" });
  assert.equal(expired.claims.length + expired.posts.length, 0);

  const sameDay = newRecorder();
  const sameDayResult = await dispatchConfirmedStayWhatsAppNotification(
    baseBooking({ check_in: "2026-07-15", check_out: "2026-07-17" }),
    makeDeps(sameDay),
  );
  assert.equal(sameDayResult.dispatched, true);
});

test("URL mint failure skips as no_arrival_guide_url before any claim", async () => {
  const recorder = newRecorder();
  const result = await dispatchConfirmedStayWhatsAppNotification(
    baseBooking(),
    makeDeps(recorder, { mintArrivalGuideUrl: () => null }),
  );
  assert.deepEqual(result, { dispatched: false, reason: "no_arrival_guide_url" });
  assert.equal(recorder.claims.length + recorder.posts.length, 0);
});

// ─── Idempotency ─────────────────────────────────────────────────────────────

test("already-claimed booking skips without posting (duplicate confirm is silent)", async () => {
  const recorder = newRecorder();
  const result = await dispatchConfirmedStayWhatsAppNotification(
    baseBooking(),
    makeDeps(recorder, { claimWhatsAppConfirmation: async () => "already" }),
  );
  assert.deepEqual(result, { dispatched: false, reason: "already_claimed" });
  assert.equal(recorder.posts.length, 0);
});

test("claim error fails closed without posting", async () => {
  const recorder = newRecorder();
  const result = await dispatchConfirmedStayWhatsAppNotification(
    baseBooking(),
    makeDeps(recorder, { claimWhatsAppConfirmation: async () => "error" }),
  );
  assert.deepEqual(result, { dispatched: false, reason: "claim_failed" });
  assert.equal(recorder.posts.length, 0);
});

test("POST failure after claiming reports post_failed and never auto-retries", async () => {
  const recorder = newRecorder();
  let attempts = 0;
  const result = await dispatchConfirmedStayWhatsAppNotification(
    baseBooking(),
    makeDeps(recorder, {
      postWebhook: async () => {
        attempts += 1;
        return { ok: false, status: 308 };
      },
    }),
  );
  assert.deepEqual(result, { dispatched: false, reason: "post_failed", httpStatus: 308 });
  assert.equal(attempts, 1);
  assert.equal(recorder.claims.length, 1);
});

// ─── Pure helper units ───────────────────────────────────────────────────────

test("normalizeWhatsAppPhone strips to digits and rejects empties", () => {
  assert.equal(normalizeWhatsAppPhone("+961 3-123 456"), "9613123456");
  assert.equal(normalizeWhatsAppPhone("wa.me/96170111222"), "96170111222");
  assert.equal(normalizeWhatsAppPhone("   "), null);
  assert.equal(normalizeWhatsAppPhone("+()- "), null);
  assert.equal(normalizeWhatsAppPhone(null), null);
});

test("isEventInquiryStay mirrors the confirmation writers' detection", () => {
  assert.equal(isEventInquiryStay("wedding", "[Event Inquiry] details"), true);
  assert.equal(isEventInquiryStay("wedding", "plain message"), false);
  assert.equal(isEventInquiryStay(null, "[Event Inquiry] details"), false);
});

test("isStayCheckOutInPast is a date-only string comparison", () => {
  assert.equal(isStayCheckOutInPast("2026-07-16", "2026-07-17"), true);
  assert.equal(isStayCheckOutInPast("2026-07-17", "2026-07-17"), false);
  assert.equal(isStayCheckOutInPast("2026-07-18", "2026-07-17"), false);
  assert.equal(isStayCheckOutInPast("not-a-date", "2026-07-17"), false);
  assert.equal(isStayCheckOutInPast(null, "2026-07-17"), false);
});

test("resolveDispatchEnvironmentGate trims and gates correctly", () => {
  assert.deepEqual(resolveDispatchEnvironmentGate({}), { allowed: false, reason: "not_configured" });
  assert.deepEqual(resolveDispatchEnvironmentGate({ WHATCHIMP_CONFIRMED_STAY_WEBHOOK_URL: "  " }), {
    allowed: false,
    reason: "not_configured",
  });
  assert.deepEqual(
    resolveDispatchEnvironmentGate({
      WHATCHIMP_CONFIRMED_STAY_WEBHOOK_URL: WEBHOOK_URL,
      VERCEL_ENV: "production",
      WHATCHIMP_CONFIRMED_STAY_WEBHOOK_SECRET: " s3cret ",
    }),
    { allowed: true, webhookUrl: WEBHOOK_URL, secret: "s3cret" },
  );
});

test("buildConfirmedStayWebhookPayload requires villa and both dates", () => {
  const base = {
    guestName: null,
    phone: "9613123456",
    bookingReference: REFERENCE,
    arrivalGuideUrl: GUIDE_URL,
  };
  assert.equal(
    buildConfirmedStayWebhookPayload({ ...base, villa: null, checkIn: "2026-08-19", checkOut: "2026-08-20" }),
    null,
  );
  assert.equal(
    buildConfirmedStayWebhookPayload({ ...base, villa: "Villa Byblos", checkIn: "19/08/2026", checkOut: "2026-08-20" }),
    null,
  );
  assert.equal(
    buildConfirmedStayWebhookPayload({ ...base, villa: "Villa Byblos", checkIn: "2026-08-19", checkOut: null }),
    null,
  );
});
