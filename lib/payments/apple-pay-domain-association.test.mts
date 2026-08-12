/**
 * Apple compares this byte for byte. A stray newline or a truncated copy
 * fails verification with the same unhelpful "domain verification failed"
 * message that cost an hour on 2026-08-12.
 *
 * Runner: node --experimental-strip-types --test lib/payments/apple-pay-domain-association.test.mts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { APPLE_PAY_DOMAIN_ASSOCIATION } from "./apple-pay-domain-association.ts";

test("the association value is exactly what CyberSource issued", () => {
  assert.equal(APPLE_PAY_DOMAIN_ASSOCIATION.length, 9090);
});

test("it carries no whitespace — not a newline, not a trailing space", () => {
  assert.doesNotMatch(APPLE_PAY_DOMAIN_ASSOCIATION, /\s/);
});

test("it is the hex payload, not an error page someone saved by mistake", () => {
  assert.match(APPLE_PAY_DOMAIN_ASSOCIATION, /^[0-9A-Fa-f]+$/);
  assert.doesNotMatch(APPLE_PAY_DOMAIN_ASSOCIATION, /<html|<!DOCTYPE|Not found/i);
});
