import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createRequire } from "node:module";

import {
  createProposalRegisterWorkbook,
  proposalRegisterFileName,
  proposalRegisterRows
} from "../src/proposal-register.js";

const require = createRequire(import.meta.url);
const context = {
  module: { exports: {} },
  exports: {},
  require,
  Buffer,
  Uint8Array,
  ArrayBuffer,
  TextDecoder,
  TextEncoder,
  Date,
  console,
  process,
  setTimeout,
  clearTimeout
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(new URL("../assets/vendor/xlsx.full.min.js", import.meta.url), "utf8"),
  context
);
const XLSX = context.exports;

const PROPOSALS = [
  {
    id: "older",
    serial: "KOV-2026-001",
    issueDate: "2026-06-02",
    documentStatus: "approved",
    fullName: "Ana Novak",
    jobTitle: "Vodja laba",
    purpose: "Kovinarski lab",
    company: "Staro podjetje",
    explanation: "Vijaki in matice",
    estimatedValueCents: 12550,
    accountingNumber: "2026-18",
    offerAttachmentId: "attachment-1",
    createdAt: "2026-06-02T08:00:00.000Z",
    updatedAt: "2026-06-03T09:00:00.000Z"
  },
  {
    id: "newer-rejected",
    serial: "KOV-2026-002",
    issueDate: "2026-07-10",
    documentStatus: "rejected",
    fullName: "Bine Kralj",
    purpose: "Lesarski lab",
    company: "Drugo podjetje",
    companyAddress: "Cesta 2, Ljubljana",
    companyTaxNumber: "SI12345678",
    explanation: "Zaščitna oprema",
    estimatedValueCents: 9900,
    offerAttachmentId: ""
  }
];

test("prepares every saved proposal for the accounting register", () => {
  const rows = proposalRegisterRows(PROPOSALS, [
    {
      name: "Staro podjetje",
      address: "Glavna ulica 1, Ljubljana",
      taxNumber: "SI87654321"
    }
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].serial, "KOV-2026-002");
  assert.equal(rows[0].status, "Zavrnjeno");
  assert.equal(rows[0].estimatedValueEur, 99);
  assert.equal(rows[0].hasAttachment, "Ne");
  assert.equal(rows[1].companyAddress, "Glavna ulica 1, Ljubljana");
  assert.equal(rows[1].companyTaxNumber, "SI87654321");
  assert.equal(rows[1].estimatedValueEur, 125.5);
  assert.equal(rows[1].hasAttachment, "Da");
  assert.ok(rows[1].issueDate instanceof Date);
});

test("creates a readable XLSX register with typed dates and values", () => {
  const { workbook, rowCount } = createProposalRegisterWorkbook(PROPOSALS, [], XLSX);
  assert.equal(rowCount, 2);
  assert.equal(Array.from(workbook.SheetNames).join("|"), "Predlogi nakupa");

  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx", cellDates: true });
  const parsed = XLSX.read(bytes, { type: "array", cellDates: true });
  const sheet = parsed.Sheets["Predlogi nakupa"];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  assert.equal(rows.length, 2);
  assert.equal(rows[0]["Interna evidenca"], "KOV-2026-002");
  assert.equal(rows[0]["Podjetje"], "Drugo podjetje");
  assert.equal(rows[0]["Opis / obrazložitev"], "Zaščitna oprema");
  assert.equal(rows[0]["Vrednost brez DDV (EUR)"], 99);
  assert.equal(typeof rows[0]["Datum izdaje"]?.getTime, "function");
  assert.equal(sheet["!autofilter"].ref, "A1:O3");
});

test("uses a dated and recognizable Excel filename", () => {
  assert.equal(
    proposalRegisterFileName(new Date(2026, 7, 28, 12)),
    "register-predlogov-center-rog-2026-08-28.xlsx"
  );
});
