import test from "node:test";
import assert from "node:assert/strict";
import {
  createBlankMaterialIssue,
  materialIssueTotalCents,
  materialIssueWithSaveMetadata,
  materialRowAmountCents,
  nextMaterialIssueSerial,
  parseQuantity,
  validateMaterialIssue
} from "../src/material-issue.js";

test("parses Slovenian decimal quantities", () => {
  assert.equal(parseQuantity("2,5"), 2.5);
  assert.equal(parseQuantity(" 12.75 "), 12.75);
  assert.equal(parseQuantity(""), 0);
});

test("calculates material row and document totals", () => {
  const rows = [
    { quantity: "2,5", tariffCents: 1200 },
    { quantity: "3", tariffCents: 450 }
  ];
  assert.equal(materialRowAmountCents(rows[0]), 3000);
  assert.equal(materialIssueTotalCents({ items: rows }), 4350);
});

test("generates a separate yearly material issue serial", () => {
  const issues = [
    { id: "1", serial: "IZD-KOV-2026-001" },
    { id: "2", serial: "IZD-KOV-2026-004" },
    { id: "3", serial: "IZD-LES-2026-002" }
  ];
  assert.equal(nextMaterialIssueSerial("kov", 2026, issues), "IZD-KOV-2026-005");
});

test("prefills material issue from the latest profile data", () => {
  const issue = createBlankMaterialIssue(null, {
    fullName: "Gregor Stražar",
    jobTitle: "Vodja kovinarskega laba",
    labCode: "KOV",
    purpose: "Za potrebe kovinarskega laba"
  });
  assert.equal(issue.issuerName, "Gregor Stražar");
  assert.equal(issue.issuerRole, "Vodja kovinarskega laba");
  assert.equal(issue.labCode, "KOV");
  assert.equal(issue.labName, "Kovinarski lab");
  assert.equal(issue.items.length, 1);
});

test("validates required issue fields and every dynamic row", () => {
  const invalid = {
    ...createBlankMaterialIssue(),
    issuerName: "",
    labName: "",
    buyerName: "",
    items: [{ id: "row-1", name: "", unit: "", quantity: "", tariffCents: 0 }]
  };
  const result = validateMaterialIssue(invalid);
  assert.equal(result.valid, false);
  assert.equal(result.fields.issuerName, "To polje je obvezno.");
  assert.equal(result.fields["items.row-1.name"], "To polje je obvezno.");
  assert.equal(result.fields["items.row-1.quantity"], "Vnesite količino, večjo od 0.");
  assert.equal(result.fields["items.row-1.tariffCents"], "Vnesite tarifo, večjo od 0.");
});

test("saves metadata without requiring a complete draft", () => {
  const draft = createBlankMaterialIssue();
  const saved = materialIssueWithSaveMetadata(draft, []);
  assert.match(saved.serial, /^IZD-KOV-\d{4}-001$/);
  assert.equal(saved.status, "draft");
  assert.ok(saved.id);
});
