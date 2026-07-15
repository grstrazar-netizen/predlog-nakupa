import assert from "node:assert/strict";
import test from "node:test";

import { createProposalLayout, wrapTextLines } from "../src/document-layout.js";

const measureText = (text, style = {}) => String(text || "").length * (style.weight === "semibold" ? 6.2 : 6);

function validProposal(overrides = {}) {
  return {
    fullName: "Gregor Strazar",
    jobTitle: "Vodja kovinarskega laba",
    purpose: "Za potrebe kovinarskega laba",
    explanation: "Vijaki 3 x 12,90 EUR\nBrusni papir 25 EUR",
    company: "Merkur trgovina, d. o. o.",
    ...overrides
  };
}

test("wraps explicit paragraphs without silently discarding text", () => {
  assert.deepEqual(wrapTextLines("Prva vrstica\nDruga vrstica", 500, (text) => text.length), [
    "Prva vrstica",
    "Druga vrstica"
  ]);
});

test("accepts proposal content that fits the shared A4 layout", () => {
  const layout = createProposalLayout(validProposal(), measureText);
  assert.equal(layout.fits, true);
  assert.deepEqual(layout.overflowFields, []);
});

test("keeps all company data on one PDF line and scales it to fit", () => {
  const layout = createProposalLayout(
    validProposal({
      company: "Altos d.o.o.",
      companyAddress: "Ižanska cesta 13, Ljubljana",
      companyTaxNumber: "SI36432234"
    }),
    measureText
  );

  assert.deepEqual(layout.lines.company, [
    "Altos d.o.o., Ižanska cesta 13, Ljubljana, Davčna št.: SI36432234"
  ]);
  assert.equal(layout.fits, true);
  assert.ok(layout.text.companyFontSizePt <= layout.fonts.bodyPt);
});

test("reports fields that would overflow the one-page A4 document", () => {
  const layout = createProposalLayout(
    validProposal({
      purpose: "Zelo dolg namen nakupa ".repeat(20),
      explanation: "Dolga obrazlozitev z vrednostjo 12,90 EUR. ".repeat(80)
    }),
    measureText
  );

  assert.equal(layout.fits, false);
  assert.ok(layout.overflowFields.includes("purpose"));
  assert.ok(layout.overflowFields.includes("explanation"));
});
