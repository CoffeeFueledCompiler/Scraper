import { test } from "node:test";
import assert from "node:assert/strict";
import { domainOf, firstPhone, webhookToken } from "./apollo.ts";

test("finds the phone number wherever Apollo nests it", () => {
  const number = { raw_number: "+1 512-528-4258", sanitized_number: "+15125284258" };
  assert.equal(firstPhone({ people: [{ id: "a", phone_numbers: [number] }] }), "+15125284258");
  assert.equal(firstPhone({ person: { phone_numbers: [number] } }), "+15125284258");
  assert.equal(firstPhone({ phone_numbers: [{ raw_number: "+1 512-528-4258" }] }), "+1 512-528-4258");
});

test("returns empty when the webhook carried no number", () => {
  assert.equal(firstPhone({ people: [{ id: "a", phone_numbers: [] }] }), "");
  assert.equal(firstPhone(null), "");
});

test("strips www and tracking params down to the bare domain", () => {
  assert.equal(domainOf("https://www.RPMalamo.com/?utm_source=gmb"), "rpmalamo.com");
  assert.equal(domainOf("not a url"), "");
});

test("webhook tokens are per-lead", () => {
  assert.notEqual(webhookToken("A::Austin"), webhookToken("B::Austin"));
  assert.equal(webhookToken("A::Austin"), webhookToken("A::Austin"));
});
