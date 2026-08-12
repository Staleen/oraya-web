/**
 * A wrong phone number on a guest booking means an uncontactable guest —
 * for anyone who leaves no email it is the only channel Oraya has.
 *
 * Runner: node --experimental-strip-types --test lib/booking/phone-rules.test.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPhoneNumber, normalisePhoneInput, phonePlaceholder } from "./phone-rules.ts";

test("a good Lebanese mobile passes", () => {
  const r = checkPhoneNumber("+961", "70 123 456");
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.national, "70123456");
});

test("Lebanon accepts landline 7 and mobile 8, nothing between or beyond", () => {
  assert.equal(checkPhoneNumber("+961", "1234567").ok, true);
  assert.equal(checkPhoneNumber("+961", "12345678").ok, true);
  assert.equal(checkPhoneNumber("+961", "123456").ok, false);
  assert.equal(checkPhoneNumber("+961", "123456789").ok, false);
});

test("the guest's own dial code, pasted twice, is stripped rather than rejected", () => {
  // "+96170123456" typed into a field that already says +961.
  assert.equal(normalisePhoneInput("+961", "+961 70 123 456"), "70123456");
  assert.equal(normalisePhoneInput("+961", "0096170123456"), "70123456");
  assert.equal(checkPhoneNumber("+961", "+96170123456").ok, true);
});

test("the domestic trunk zero is dropped", () => {
  assert.equal(normalisePhoneInput("+961", "070123456"), "70123456");
  assert.equal(normalisePhoneInput("+44", "07700900123"), "7700900123");
  assert.equal(checkPhoneNumber("+44", "07700 900123").ok, true);
});

test("the message tells the guest what is actually expected", () => {
  const r = checkPhoneNumber("+971", "12345");
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.message : "", /\+971 number has 9 digits/);

  const lb = checkPhoneNumber("+961", "12345");
  assert.match(lb.ok === false ? lb.message : "", /7 or 8 digits/);
});

test("an unlisted country is never blocked on a guess", () => {
  // Oraya has no rule for +995. Refusing the guest would be worse than the
  // typo this exists to catch.
  assert.equal(checkPhoneNumber("+995", "555123456").ok, true);
  // Only the obviously impossible is refused.
  assert.equal(checkPhoneNumber("+995", "12").ok, false);
  assert.equal(checkPhoneNumber("+995", "123456789012345").ok, false);
});

test("an empty number is reported as empty, not as a wrong length", () => {
  const r = checkPhoneNumber("+961", "   ");
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "empty");
});

test("letters and punctuation are ignored rather than counted", () => {
  assert.equal(checkPhoneNumber("+961", "(70) 123-456").ok, true);
});

test("the placeholder shows the shape of the chosen country", () => {
  assert.equal(phonePlaceholder("+961"), "00 000 000");
  assert.equal(phonePlaceholder("+971"), "000 000 000");
  assert.equal(phonePlaceholder("+1"), "0 000 000 000");
});
