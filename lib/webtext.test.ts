import { test } from "node:test";
import assert from "node:assert/strict";
import { looksUnusable } from "./webtext.ts";

const pad = (s: string) => s + " lorem ipsum dolor sit amet ".repeat(20); // past the length floor

test("treats Cloudflare interstitials as unreadable", () => {
  assert.equal(looksUnusable(pad("Just a moment... Enable JavaScript and cookies to continue")), true);
  assert.equal(looksUnusable(pad("Checking your browser before accessing atlasroofingpro.com")), true);
  assert.equal(looksUnusable(pad("Attention Required! | Cloudflare Ray ID 8f2c")), true);
});

test("treats other bot walls as unreadable", () => {
  assert.equal(looksUnusable(pad("Access Denied You do not have permission")), true);
  assert.equal(looksUnusable(pad("Verify you are human by completing the action below")), true);
});

test("treats a JS-only shell as unreadable", () => {
  assert.equal(looksUnusable("<div id=root></div>"), true);
  assert.equal(looksUnusable(""), true);
});

test("accepts real page copy", () => {
  const real =
    "Atlas Roofing San Diego. Residential and commercial roof repair, replacement and inspection. " +
    "Serving San Diego County since 1998. Free estimates. Call us or book an inspection online today. " +
    "Our services include tile roofing, shingle roofing, flat roofs and emergency leak repair.";
  assert.equal(looksUnusable(real), false);
});

test("only checks the top of the page for block phrases", () => {
  const real = "Atlas Roofing San Diego. Residential and commercial roof repair. ".repeat(40);
  assert.equal(looksUnusable(real + " Customer portal: access denied without login."), false);
});
