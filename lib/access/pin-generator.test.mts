import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import {
  ACCESS_PIN_MEMORABILITY_THRESHOLD,
  AccessPinGenerationExhaustedError,
  formatAccessPinForDisplay,
  generateAccessPin,
  rejectAccessPin,
  scoreAccessPinMemorability,
} from "./pin-generator.ts";

// All literal PINs below are throwaway rejection-family exhibits, not
// operational values.

test("format family", () => {
  assert.equal(rejectAccessPin("12345"), "format");
  assert.equal(rejectAccessPin("1234567"), "format");
  assert.equal(rejectAccessPin("12a456"), "format");
  assert.equal(rejectAccessPin(""), "format");
});

test("leading zero is rejected (manual dual-lock copy workflow)", () => {
  assert.equal(rejectAccessPin("082415"), "leading_zero");
});

test("repeated digit runs and overuse", () => {
  assert.equal(rejectAccessPin("155578"), "repeated_digit_run"); // 555 run
  assert.equal(rejectAccessPin("111111"), "digit_overuse"); // six 1s
  assert.equal(rejectAccessPin("991999"), "digit_overuse"); // five 9s
  // Four occurrences WITHOUT a 3-run stay acceptable (the 25-56-55 shape).
  assert.equal(rejectAccessPin("255655"), null);
});

test("sequential runs ascending and descending", () => {
  assert.equal(rejectAccessPin("123456"), "sequential_run");
  assert.equal(rejectAccessPin("654321"), "sequential_run");
  assert.equal(rejectAccessPin("812345"), "sequential_run"); // embedded 2345... 12345 run of 5
  assert.equal(rejectAccessPin("987612"), "sequential_run"); // 9876 descending run of 4
});

test("repeated halves, alternating pairs, palindromes", () => {
  assert.equal(rejectAccessPin("258258"), "repeated_half");
  assert.equal(rejectAccessPin("282828"), "alternating_pair");
  assert.equal(rejectAccessPin("265562"), "palindrome");
});

test("common PINs", () => {
  assert.equal(rejectAccessPin("159753"), "common_pin");
  assert.equal(rejectAccessPin("789456"), "common_pin");
});

test("keypad straight-line patterns", () => {
  assert.equal(rejectAccessPin("147963"), "keypad_line"); // column + reverse column
  assert.equal(rejectAccessPin("357951"), "keypad_line"); // diagonal + reverse diagonal
});

test("year patterns", () => {
  assert.equal(rejectAccessPin("198345"), "year_pattern"); // starts 1983
  assert.equal(rejectAccessPin("452031"), "year_pattern"); // ends 2031
});

test("date patterns (DDMMYY / MMDDYY / YYMMDD)", () => {
  assert.equal(rejectAccessPin("150697"), "date_pattern"); // 15 June '97 (DDMMYY)
  assert.equal(rejectAccessPin("970612"), "date_pattern"); // '97 June 12 (YYMMDD)
});

test("context-derived digits (phone / booking / property values)", () => {
  const context = { forbiddenDigitStrings: ["+961 71 555 214", "A1B2C3D4"] };
  assert.equal(rejectAccessPin("652149", context), "context_digits"); // contains phone window 5214
  assert.equal(rejectAccessPin("961715", context), "context_digits"); // contains phone window 9617
  assert.equal(rejectAccessPin("681145", context), null); // no window overlap
});

test("historical duplicate rejection via keyed fingerprints", () => {
  const fingerprint = (pin: string) =>
    createHmac("sha256", "test-only-fingerprint-key").update(pin).digest("hex");
  const used = "681145";
  const context = {
    existingFingerprints: new Set([fingerprint(used)]),
    fingerprint,
  };
  assert.equal(rejectAccessPin(used, context), "already_used");
  assert.equal(rejectAccessPin("681146", context), null);
});

test("acceptable PINs pass with null reason", () => {
  assert.equal(rejectAccessPin("681145"), null);
  assert.equal(rejectAccessPin("255655"), null);
});

test("memorability scoring rewards varied independent features", () => {
  // Doubled pair + repeated group + few distinct digits...
  assert.ok(scoreAccessPinMemorability("255655") >= ACCESS_PIN_MEMORABILITY_THRESHOLD);
  // A flat, featureless spread scores low.
  assert.ok(scoreAccessPinMemorability("172839") < ACCESS_PIN_MEMORABILITY_THRESHOLD);
});

test("display grouping is presentation-only", () => {
  assert.equal(formatAccessPinForDisplay("255655"), "25-56-55");
  assert.throws(() => formatAccessPinForDisplay("25565"));
});

test("generator returns valid, non-rejected, memorable six-digit PINs", () => {
  for (let i = 0; i < 25; i++) {
    const pin = generateAccessPin();
    assert.match(pin, /^[1-9][0-9]{5}$/);
    assert.equal(rejectAccessPin(pin), null);
    assert.ok(scoreAccessPinMemorability(pin) >= ACCESS_PIN_MEMORABILITY_THRESHOLD);
  }
});

test("generator honors context rejection end-to-end", () => {
  const fingerprint = (pin: string) =>
    createHmac("sha256", "test-only-fingerprint-key").update(pin).digest("hex");
  const seen = new Set<string>();
  const context = { existingFingerprints: seen, fingerprint };
  for (let i = 0; i < 10; i++) {
    const pin = generateAccessPin(context);
    assert.equal(seen.has(fingerprint(pin)), false, "must never repeat a fingerprinted PIN");
    seen.add(fingerprint(pin));
  }
});

test("generator output varies (no single-template collapse)", () => {
  const pins = new Set<string>();
  for (let i = 0; i < 40; i++) pins.add(generateAccessPin());
  assert.ok(pins.size >= 35, `expected variety, got ${pins.size} distinct of 40`);
});

test("bounded failure: reject-everything context throws instead of looping forever", () => {
  const rejectAll = {
    existingFingerprints: new Set(["*"]),
    fingerprint: () => "*",
  };
  assert.throws(() => generateAccessPin(rejectAll, 50), AccessPinGenerationExhaustedError);
  assert.throws(() => generateAccessPin({}, 0));
});
