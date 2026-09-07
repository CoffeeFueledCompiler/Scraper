import { test } from "node:test";
import assert from "node:assert/strict";
import { guessNicheAndCityFromQuery } from "./scrapeMaps.ts";

test("splits 'niche in city' queries", () => {
  assert.deepEqual(guessNicheAndCityFromQuery("dentists in Bhopal"), { niche: "dentists", city: "Bhopal" });
});

test("falls back to the whole query as niche when there's no 'in'", () => {
  assert.deepEqual(guessNicheAndCityFromQuery("plumbers"), { niche: "plumbers", city: "" });
});
