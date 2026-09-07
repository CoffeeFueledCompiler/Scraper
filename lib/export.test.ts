import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFinalCsv, buildFinalRows } from "./export.ts";
import { emptyLead } from "./schema.ts";
import type { Lead } from "./schema.ts";

const lead = (overrides: Partial<Lead>): Lead => ({ ...emptyLead(), ...overrides });

test("rejects rows missing Business Name or Phone Number", () => {
  const leads = [lead({ name: "Acme", phone: "" }), lead({ name: "", phone: "555" }), lead({ name: "Bob's", phone: "555" })];
  const { csv, rejected } = buildFinalCsv(leads);
  assert.equal(rejected.length, 2);
  assert.equal(csv.split("\n").length, 2); // header + 1 kept row
});

test("assigns sequential S. No starting at 1", () => {
  const leads = [lead({ name: "A", phone: "1" }), lead({ name: "B", phone: "2" })];
  const { csv } = buildFinalCsv(leads);
  const rows = csv.split("\n").slice(1);
  assert.deepEqual(rows.map((r) => r.split(",")[0]), ["1", "2"]);
});

test("logs missing email but keeps the row", () => {
  const leads = [lead({ name: "A", phone: "1", email: "" })];
  const { csv, missingEmail } = buildFinalCsv(leads);
  assert.equal(missingEmail.length, 1);
  assert.equal(csv.split("\n").length, 2);
});

test("escapes commas, quotes, and newlines", () => {
  const leads = [lead({ name: 'Acme, "The" Best\nCo', phone: "1" })];
  const { csv } = buildFinalCsv(leads);
  assert.match(csv, /"Acme, ""The"" Best\nCo"/);
});

test("prefixes phone numbers with an apostrophe so Sheets/Excel don't read them as a formula", () => {
  const leads = [lead({ name: "Acme", phone: "+1 626-359-0204" })];
  const { header, rows } = buildFinalRows(leads);
  assert.equal(rows[0][header.indexOf("Phone Number")], "'+1 626-359-0204");
});
