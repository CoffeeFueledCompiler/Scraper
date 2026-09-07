import { test } from "node:test";
import assert from "node:assert/strict";
import { pickBestEmail } from "./enrich.ts";

test("prefers a non-generic email over info@/contact@", () => {
  assert.equal(pickBestEmail(new Set(["info@acme.com", "sales@acme.com"])), "sales@acme.com");
});

test("falls back to a generic email when nothing else is found", () => {
  assert.equal(pickBestEmail(new Set(["info@acme.com"])), "info@acme.com");
});

test("returns empty string when nothing was found", () => {
  assert.equal(pickBestEmail(new Set()), "");
});
