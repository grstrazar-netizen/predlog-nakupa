import test from "node:test";
import assert from "node:assert/strict";
import {
  formatCurrency,
  evaluateEuroExpression,
  extractEuroAmounts,
  extractEuroTotalCents,
  deriveLabCodeFromName,
  nextSerial,
  normalizeLabCode,
  parseMoneyToCents,
  proposalWithChangeLog,
  spendingBreakdownForYear,
  spendingForYear,
  uniqueSuggestions,
  validateProposalRequiredFields
} from "../src/utils.js";

test("normalizes lab codes for serial numbers", () => {
  assert.equal(normalizeLabCode(" kov "), "KOV");
  assert.equal(normalizeLabCode("lab-01"), "LAB01");
});

test("records proposal creation and later edited fields", () => {
  const created = proposalWithChangeLog(
    {
      id: "proposal-1",
      fullName: "Gregor Stražar",
      purpose: "Za potrebe kovinarskega laba",
      estimatedValueCents: 12000
    },
    null,
    "2026-06-01T08:00:00.000Z"
  );

  assert.equal(created.changeLog.length, 1);
  assert.equal(created.changeLog[0].type, "created");

  const unchanged = proposalWithChangeLog(
    { ...created },
    created,
    "2026-06-01T09:00:00.000Z"
  );
  assert.equal(unchanged.changeLog.length, 1);

  const edited = proposalWithChangeLog(
    { ...created, company: "Merkur d.o.o.", estimatedValueCents: 14500 },
    created,
    "2026-06-01T10:00:00.000Z"
  );

  assert.equal(edited.changeLog.length, 2);
  assert.deepEqual(edited.changeLog[1].fields, ["Podjetje", "Okvirna vrednost"]);
});

test("derives lab codes from Slovenian lab names", () => {
  assert.equal(deriveLabCodeFromName("Kovinarski lab"), "KOV");
  assert.equal(deriveLabCodeFromName("Lesarski lab"), "LES");
  assert.equal(deriveLabCodeFromName("Lab za nakit"), "NAK");
  assert.equal(deriveLabCodeFromName("Lab za tekstil"), "TEK");
  assert.equal(deriveLabCodeFromName("Oddelek za keramiko"), "KER");
});

test("parses Slovenian money values to cents", () => {
  assert.equal(parseMoneyToCents("1.240,50 €"), 124050);
  assert.equal(parseMoneyToCents("270 brez DDV"), 27000);
  assert.equal(parseMoneyToCents(""), 0);
});

test("extracts and sums euro amounts from explanation notes", () => {
  const text = "- transportna kolesa 120 €\n- vijaki 35,50 EUR\n- rezerva € 14,50";
  assert.deepEqual(extractEuroAmounts(text), [12000, 3550, 1450]);
  assert.equal(extractEuroTotalCents(text), 17000);
});

test("evaluates euro calculator expressions in explanation notes", () => {
  const text = "Slušalke 2*230 eur\nČelada 60 eur";
  assert.deepEqual(extractEuroAmounts(text), [46000, 6000]);
  assert.equal(extractEuroTotalCents(text), 52000);
});

test("treats a mixed eur line with operators as one calculator expression", () => {
  const text = "majice 6 eur+3 eur*100 eur";
  assert.deepEqual(extractEuroAmounts(text), [30600]);
  assert.equal(extractEuroTotalCents(text), 30600);
});

test("supports parenthesized calculator expressions in text", () => {
  assert.equal(extractEuroTotalCents("majice (3*100+6) eur"), 30600);
  assert.equal(extractEuroTotalCents("majice (3*100 + 6) €"), 30600);
});

test("does not confuse descriptive quantities with calculator expressions", () => {
  assert.deepEqual(extractEuroAmounts("transport 2 kosa 100 eur"), [10000]);
});

test("supports x, division, addition, subtraction, and percentages", () => {
  assert.equal(evaluateEuroExpression("3 x 40"), 12000);
  assert.equal(evaluateEuroExpression("100/4"), 2500);
  assert.equal(evaluateEuroExpression("100 + 22%"), 12200);
  assert.equal(evaluateEuroExpression("200 - 10%"), 18000);
  assert.equal(evaluateEuroExpression("100+20-5"), 11500);
});

test("generates the next yearly serial per lab", () => {
  const proposals = [
    { id: "1", serial: "KOV-2026-001" },
    { id: "2", serial: "KOV-2026-004" },
    { id: "3", serial: "ELE-2026-002" },
    { id: "4", serial: "KOV-2025-009" }
  ];
  assert.equal(nextSerial("kov", 2026, proposals), "KOV-2026-005");
});

test("sums saved documents by year", () => {
  const proposals = [
    { year: 2026, estimatedValueCents: 10000 },
    { year: 2026, estimatedValueCents: 2500 },
    { year: 2026, estimatedValueCents: 3300, documentStatus: "submitted" },
    { year: 2026, estimatedValueCents: 4000, documentStatus: "approved" },
    { year: 2026, estimatedValueCents: 99900, documentStatus: "rejected" },
    { year: 2025, estimatedValueCents: 90000 }
  ];
  assert.equal(spendingForYear(proposals, 2026), 19800);
  assert.equal(formatCurrency(19800), "198,00 €");
});

test("breaks yearly spending down by purpose and excludes rejected proposals", () => {
  const proposals = [
    { year: 2026, purpose: "Kovinarski lab", estimatedValueCents: 10000 },
    { year: 2026, purpose: " kovinarski  lab ", estimatedValueCents: 2500 },
    { year: 2026, purpose: "Lab za nakit", estimatedValueCents: 4200 },
    { year: 2026, purpose: "Kovinarski lab", estimatedValueCents: 9900, documentStatus: "rejected" },
    { year: 2025, purpose: "Kovinarski lab", estimatedValueCents: 3000 }
  ];

  assert.deepEqual(spendingBreakdownForYear(proposals, 2026), [
    { label: "Kovinarski lab", cents: 12500, count: 2 },
    { label: "Lab za nakit", cents: 4200, count: 1 }
  ]);
});

test("derives unique autocomplete suggestions from documents", () => {
  const proposals = [
    { company: "AMAZON" },
    { company: "Amazon" },
    { company: "Metalshop d.o.o." },
    { company: "" }
  ];
  assert.deepEqual(uniqueSuggestions(proposals, "company", "met"), ["Metalshop d.o.o."]);
  assert.deepEqual(uniqueSuggestions(proposals, "company", ""), ["AMAZON", "Metalshop d.o.o."]);
});

test("validates required proposal fields before saving or exporting", () => {
  const invalid = validateProposalRequiredFields({
    fullName: "",
    jobTitle: "",
    purpose: "",
    explanation: "",
    company: "",
    issueDate: "",
    labCode: "",
    estimatedValueCents: 0
  });

  assert.equal(invalid.valid, false);
  assert.equal(invalid.message, "Pred nadaljevanjem izpolnite vsa obvezna polja.");
  assert.deepEqual(Object.keys(invalid.fields).sort(), [
    "company",
    "estimatedValueCents",
    "explanation",
    "fullName",
    "issueDate",
    "jobTitle",
    "labCode",
    "purpose"
  ]);

  const valid = validateProposalRequiredFields({
    fullName: "Gregor Stražar",
    jobTitle: "Vodja kovinarskega laba",
    purpose: "Za potrebe kovinarskega laba",
    explanation: "Merkur: vijaki 12,90 EUR",
    company: "Merkur trgovina d.o.o.",
    issueDate: "2026-06-01",
    labCode: "KOV",
    estimatedValueCents: 1290
  });

  assert.equal(valid.valid, true);
  assert.equal(valid.message, "");
  assert.deepEqual(valid.fields, {});
});
