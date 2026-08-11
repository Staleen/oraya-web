/**
 * `/book` guest-path audit, 2026-08-12.
 *
 * Runner: node --experimental-strip-types --test lib/booking/guest-reachability.test.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assessRequesterReachability } from "./guest-reachability.ts";

test("an email address means the guest is acknowledged automatically", () => {
  const r = assessRequesterReachability({ email: "mira@example.com", phone: "+96170123456" });
  assert.equal(r.can_email, true);
  assert.equal(r.email_line, "mira@example.com");
  assert.equal(r.operator_action, null);
});

test("a phone-only guest is flagged, because Oraya sends them nothing", () => {
  const r = assessRequesterReachability({ email: null, phone: "+96170123456" });
  assert.equal(r.can_email, false);
  assert.match(r.email_line, /no confirmation email was sent/);
  assert.match(r.operator_action ?? "", /WhatsApp: \+96170123456/);
});

test("whitespace is not an email address", () => {
  const r = assessRequesterReachability({ email: "   ", phone: "+96170123456" });
  assert.equal(r.can_email, false);
  assert.match(r.operator_action ?? "", /WhatsApp/);
});

test("no email and no phone says so plainly rather than implying a channel", () => {
  const r = assessRequesterReachability({ email: null, phone: null });
  assert.equal(r.can_email, false);
  assert.match(r.operator_action ?? "", /no way to reach them/);
  assert.doesNotMatch(r.operator_action ?? "", /WhatsApp/);
});

test("the email line is never blank, so the operator email cannot show an empty cell", () => {
  for (const contact of [{}, { email: null }, { phone: "+9611" }, { email: "a@b.co" }]) {
    assert.notEqual(assessRequesterReachability(contact).email_line.trim(), "");
  }
});
