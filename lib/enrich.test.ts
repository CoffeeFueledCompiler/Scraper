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

// Every value below came out of a real export and would have been mailed.
test("rejects asset filenames the address regex happens to match", () => {
  assert.equal(pickBestEmail(new Set(["ajax-loader@2x.gif"])), "");
  assert.equal(pickBestEmail(new Set(["flags@2x.png"])), "");
  assert.equal(pickBestEmail(new Set(["sprite@3x.svg", "hello@realsalon.com"])), "hello@realsalon.com");
});

test("rejects Sentry DSNs leaked by bundled JS", () => {
  assert.equal(pickBestEmail(new Set(["2062d0a4929b45348643784b5cb39c36@sentry.wixpress.com"])), "");
  assert.equal(pickBestEmail(new Set(["13e49d785d8d4f828038b6136f3b48ba@sentry.io"])), "");
});

test("rejects template placeholder addresses", () => {
  assert.equal(pickBestEmail(new Set(["user@domain.com"])), "");
  assert.equal(pickBestEmail(new Set(["you@example.com"])), "");
});

test("rejects site-builder placeholders", () => {
  assert.equal(pickBestEmail(new Set(["filler@godaddy.com"])), "");
  assert.equal(pickBestEmail(new Set(["youremail@yourbusiness.com"])), "");
});

test("prefers the business's own domain over a designer's footer address", () => {
  const found = new Set(["hello@webagency.com", "info@acmehvac.com"]);
  assert.equal(pickBestEmail(found, "https://www.acmehvac.com/?utm_source=gmb"), "info@acmehvac.com");
  // No own-domain address: fall back rather than return nothing.
  assert.equal(pickBestEmail(new Set(["acmehvac@gmail.com"]), "https://acmehvac.com"), "acmehvac@gmail.com");
});

test("keeps a real address found alongside junk", () => {
  assert.equal(pickBestEmail(new Set(["user@domain.com", "ajax-loader@2x.gif", "info@salon.com"])), "info@salon.com");
});
