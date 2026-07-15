import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPANY_DIRECTORY_CSV_TEMPLATE,
  companyDocumentLines,
  companyDocumentText,
  companyLookupKey,
  enrichProposalCompanyDetails,
  parseCompanyDirectoryCsv
} from "../src/company-directory.js";

test("company CSV template contains the supported headers", () => {
  assert.match(COMPANY_DIRECTORY_CSV_TEMPLATE, /ime_podjetja,naslov,davcna_stevilka/);
});

test("formats all saved company data for the document and PDF", () => {
  const proposal = {
    company: "Altos d.o.o.",
    companyAddress: "Testna cesta 1, Ljubljana",
    companyTaxNumber: "SI12345678"
  };
  assert.deepEqual(companyDocumentLines(proposal), [
    "Altos d.o.o.",
    "Testna cesta 1, Ljubljana",
    "Davčna št.: SI12345678"
  ]);
  assert.equal(
    companyDocumentText(proposal),
    "Altos d.o.o., Testna cesta 1, Ljubljana, Davčna št.: SI12345678"
  );
  assert.equal(companyDocumentText(proposal).includes("\n"), false);
});

test("company lookup tolerates punctuation and enriches older proposals", () => {
  assert.equal(companyLookupKey(" ALTOS d.o.o. "), companyLookupKey("Altos d o o"));

  assert.deepEqual(
    enrichProposalCompanyDetails(
      { company: "Altos d.o.o" },
      [
        {
          name: "Altos d.o.o.",
          address: "Celovška cesta 10, Ljubljana",
          taxNumber: "SI12345678"
        }
      ]
    ),
    {
      company: "Altos d.o.o.",
      companyAddress: "Celovška cesta 10, Ljubljana",
      companyTaxNumber: "SI12345678"
    }
  );
});

test("existing proposal company details are not overwritten", () => {
  const proposal = {
    company: "Altos d.o.o.",
    companyAddress: "Stari naslov 1",
    companyTaxNumber: "SI00000000"
  };

  assert.deepEqual(
    enrichProposalCompanyDetails(proposal, [
      {
        name: "Altos d.o.o.",
        address: "Novi naslov 2",
        taxNumber: "SI99999999"
      }
    ]),
    proposal
  );
});

test("parses quoted comma-separated company data", () => {
  const result = parseCompanyDirectoryCsv(`ime_podjetja,naslov,davcna_stevilka
Merkur d.o.o.,"Cesta na Brdo 1, 1000 Ljubljana",SI12345678`);
  assert.deepEqual(result.companies, [
    {
      name: "Merkur d.o.o.",
      address: "Cesta na Brdo 1, 1000 Ljubljana",
      taxNumber: "SI12345678"
    }
  ]);
});

test("supports Slovenian aliases, semicolons and an optional tax number", () => {
  const result = parseCompanyDirectoryCsv(`Ime podjetja;Naslov podjetja;Davčna številka
Center Rog;Trubarjeva cesta 72, Ljubljana;`);
  assert.equal(result.companies[0].name, "Center Rog");
  assert.equal(result.companies[0].taxNumber, "");
});

test("skips incomplete and duplicate rows", () => {
  const result = parseCompanyDirectoryCsv(`ime_podjetja,naslov,davcna_stevilka
Prvo d.o.o.,Naslov 1,
Prvo d.o.o.,Naslov 2,
Brez naslova,,SI1`);
  assert.equal(result.companies.length, 1);
  assert.equal(result.skippedRows.length, 2);
});

test("reports missing required columns clearly", () => {
  assert.throws(
    () => parseCompanyDirectoryCsv("podjetje,davcna_stevilka\nPrimer,SI1"),
    /obveznih stolpcev: naslov/
  );
});
