import { test } from "node:test";
import assert from "node:assert/strict";

import { isCanonicalOriginFamily, resolveEffectiveCheckoutOrigin } from "./target-origin.ts";

test("www request origin is trusted against the bare canonical origin", () => {
  assert.equal(
    resolveEffectiveCheckoutOrigin("https://www.stayoraya.com", "https://stayoraya.com"),
    "https://www.stayoraya.com",
  );
});

test("bare request origin is trusted against a www canonical origin", () => {
  assert.equal(
    resolveEffectiveCheckoutOrigin("https://stayoraya.com", "https://www.stayoraya.com"),
    "https://stayoraya.com",
  );
});

test("exact canonical request origin passes through", () => {
  assert.equal(
    resolveEffectiveCheckoutOrigin("https://stayoraya.com", "https://stayoraya.com"),
    "https://stayoraya.com",
  );
});

test("foreign hosts fall back to the canonical origin", () => {
  assert.equal(
    resolveEffectiveCheckoutOrigin("https://evil.example.com", "https://stayoraya.com"),
    "https://stayoraya.com",
  );
  assert.equal(
    resolveEffectiveCheckoutOrigin("https://www.stayoraya.com.evil.com", "https://stayoraya.com"),
    "https://stayoraya.com",
  );
  assert.equal(
    resolveEffectiveCheckoutOrigin("https://staging.stayoraya.com", "https://stayoraya.com"),
    "https://stayoraya.com",
  );
});

test("non-https and missing request origins fall back to canonical", () => {
  assert.equal(
    resolveEffectiveCheckoutOrigin("http://www.stayoraya.com", "https://stayoraya.com"),
    "https://stayoraya.com",
  );
  assert.equal(
    resolveEffectiveCheckoutOrigin(null, "https://stayoraya.com"),
    "https://stayoraya.com",
  );
  assert.equal(
    resolveEffectiveCheckoutOrigin("not a url", "https://stayoraya.com"),
    "https://stayoraya.com",
  );
});

test("family check itself is strict about ports", () => {
  assert.equal(isCanonicalOriginFamily("https://www.stayoraya.com:8443", "https://stayoraya.com"), false);
  assert.equal(isCanonicalOriginFamily("https://www.stayoraya.com", "https://stayoraya.com"), true);
});
