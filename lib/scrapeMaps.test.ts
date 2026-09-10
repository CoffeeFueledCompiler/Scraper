import { test } from "node:test";
import assert from "node:assert/strict";
import { guessNicheAndCityFromQuery } from "./scrapeMaps.ts";
import { dedupeKey, placeIdFromMapsUrl } from "./schema.ts";

// Real URLs from an export.
const BON_BON =
  "https://www.google.com/maps/place/Bon+Bon+Salon/data=!4m7!3m6!1s0x89c2590422aa991f:0x34060c6c2e6eebc4!8m2!3d40.7498373!4d-73.976924!16s%2Fg%2F1tfscr_9!19sChIJH5mqIgRZwokRxOtuLmwMBjQ?authuser=0&hl=en&g_ep=EgoyMDI2MDkwNi4wIJJjKgBIAVAD&rclk=1";

test("pulls the Place ID out of a maps URL", () => {
  assert.equal(placeIdFromMapsUrl(BON_BON), "ChIJH5mqIgRZwokRxOtuLmwMBjQ");
});

test("falls back to the hex feature ID when there's no Place ID", () => {
  const url = "https://www.google.com/maps/place/X/data=!4m7!3m6!1s0x89c2590422aa991f:0x34060c6c2e6eebc4!8m2!3d40.7!4d-73.9";
  assert.equal(placeIdFromMapsUrl(url), "0x89c2590422aa991f:0x34060c6c2e6eebc4");
});

test("returns empty for a non-place URL", () => {
  assert.equal(placeIdFromMapsUrl(""), "");
  assert.equal(placeIdFromMapsUrl("https://example.com/"), "");
});

test("the same listing dedupes across differing display names", () => {
  // Google returned this business both ways in a single run.
  const a = { name: "d.garrison roofing co inc", mapsUrl: BON_BON };
  const b = { name: "D.Garrison Roofing Co. Inc.", mapsUrl: BON_BON };
  assert.equal(dedupeKey(a), dedupeKey(b));
});

test("falls back to the name for legacy rows with no mapsUrl", () => {
  assert.equal(dedupeKey({ name: "Acme Roofing", mapsUrl: "" }), "Acme Roofing");
});

test("splits 'niche in city' queries", () => {
  assert.deepEqual(guessNicheAndCityFromQuery("dentists in Bhopal"), { niche: "dentists", city: "Bhopal" });
});

test("falls back to the whole query as niche when there's no 'in'", () => {
  assert.deepEqual(guessNicheAndCityFromQuery("plumbers"), { niche: "plumbers", city: "" });
});
