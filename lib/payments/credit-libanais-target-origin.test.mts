import { test } from "node:test";
import assert from "node:assert/strict";

import { expandTargetOrigins } from "./target-origin.ts";

test("bare production origin also allows the www variant", () => {
  assert.deepEqual(expandTargetOrigins("https://stayoraya.com"), [
    "https://stayoraya.com",
    "https://www.stayoraya.com",
  ]);
});

test("www production origin also allows the bare variant", () => {
  assert.deepEqual(expandTargetOrigins("https://www.stayoraya.com"), [
    "https://www.stayoraya.com",
    "https://stayoraya.com",
  ]);
});

test("vercel preview origins stay exact", () => {
  assert.deepEqual(expandTargetOrigins("https://oraya-abc123.vercel.app"), [
    "https://oraya-abc123.vercel.app",
  ]);
});

test("localhost stays exact", () => {
  assert.deepEqual(expandTargetOrigins("https://localhost:3000"), ["https://localhost:3000"]);
});

test("deep subdomains are not guessed", () => {
  assert.deepEqual(expandTargetOrigins("https://pay.eu.example.com"), [
    "https://pay.eu.example.com",
  ]);
});
