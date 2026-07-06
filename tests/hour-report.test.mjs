import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createRequire } from "node:module";

import {
  createHourProfile,
  hoursBetweenTimes,
  hourReportBreakdown,
  hourReportTotals,
  parseConnecteamWorkbook,
  removeHourReportRow,
  updateReportProfile
} from "../src/hour-report.js";

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
globalThis.window = { XLSX: context.exports };

function workbookBytes(rows) {
  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(
    workbook,
    window.XLSX.utils.json_to_sheet(rows),
    "List view"
  );
  return window.XLSX.write(workbook, { type: "array", bookType: "xlsx" });
}

test("parses Connecteam rows, ignores Open shift and applies weekend rates", () => {
  const bytes = workbookBytes([
    {
      Users: "Ana Novak",
      "Shift title": "Dopoldne",
      Job: "Odprti termini",
      Date: "05/01/2026",
      "Set times": "08:00 > 14:00 (06:00 total)",
      "shift total hrs": "06:00"
    },
    {
      Users: "Ana Novak",
      "Shift title": "MIG/MAG",
      Job: "Usposabljanje",
      Date: "05/02/2026",
      "Set times": "09:00 > 13:00 (04:00 total)",
      "shift total hrs": "04:00"
    },
    {
      Users: "Open shift",
      "Shift title": "Brez osebe",
      Job: "Odprti termini",
      Date: "05/03/2026",
      "Set times": "10:00 > 12:00 (02:00 total)",
      "shift total hrs": "02:00"
    }
  ]);

  const batch = parseConnecteamWorkbook(bytes, "connecteam.xlsx", []);
  assert.equal(batch.reports.length, 1);
  assert.equal(batch.reports[0].rows.length, 2);
  assert.deepEqual(
    batch.reports[0].rows.map((row) => [row.startTime, row.endTime, row.rateCents]),
    [
      ["08:00", "14:00", 1500],
      ["09:00", "13:00", 1600]
    ]
  );
  assert.equal(hourReportTotals(batch.reports[0]).totalCents, 15400);
});

test("parses Connecteam exports with European and long English date formats", () => {
  const bytes = workbookBytes([
    {
      Users: "Dalija Sega",
      "Shift title": "redno delo",
      Job: "Odprti termin",
      Date: "05/06/2026",
      "Set times": "09:00 > 16:00 (07:00 total)",
      "shift total hrs": "07:00",
      "Total planned": "86:30",
      Difference: "-86:30"
    },
    {
      Users: "Dalija Sega",
      "Shift title": "redno delo",
      Job: "Odprti termin",
      Date: "15/06/2026",
      "Set times": "09:00 > 17:00 (08:00 total)",
      "shift total hrs": "08:00",
      "Total planned": "86:30",
      Difference: "-86:30"
    },
    {
      Users: "Barbara Gogala",
      "Shift title": "POPOLDAN",
      Job: "KERAMIKA - DELAVNICA",
      Date: "Saturday, June 06, 2026",
      "Set times": "09:00 > 15:00 (06:00 total)",
      "shift total hrs": "06:00",
      Notes: "DAN SOSEDA"
    }
  ]);

  const batch = parseConnecteamWorkbook(bytes, "connecteam-june.xlsx", []);

  assert.equal(batch.reports.length, 2);
  assert.deepEqual(
    batch.reports.map((report) => [
      report.personName,
      report.monthKey,
      report.rows.map((row) => row.date),
      report.rows.reduce((sum, row) => sum + row.hours, 0)
    ]),
    [
      ["Barbara Gogala", "2026-06", ["2026-06-06"], 6],
      ["Dalija Sega", "2026-06", ["2026-06-05", "2026-06-15"], 15]
    ]
  );
});

test("maps Connecteam columns by aliases and ignores additional columns", () => {
  const bytes = workbookBytes([
    {
      "Total planned": "34:00",
      Izvajalec: "Nina Podobnikar",
      "Naziv izmene": "DOPOLDAN",
      "Tip dela": "ODPRTI TERMINI",
      Opombe: "nepomembno",
      Datum: "10. 06. 2026",
      Termin: "09:30 > 16:30 (07:00 total)",
      "Total hrs": "07:00",
      Address: "Trubarjeva cesta 72"
    },
    {
      "Total planned": "",
      Izvajalec: "Nina Podobnikar",
      "Naziv izmene": "POPOLDAN",
      "Tip dela": "TEČAJ",
      Datum: "11. 06. 2026",
      Termin: "13:30 > 20:30 (07:00 total)",
      Address: ""
    }
  ]);

  const batch = parseConnecteamWorkbook(bytes, "connecteam-aliases.xlsx", []);
  const report = batch.reports[0];

  assert.equal(batch.reports.length, 1);
  assert.equal(report.personName, "Nina Podobnikar");
  assert.deepEqual(
    report.rows.map((row) => [row.date, row.startTime, row.endTime, row.workType, row.shiftDescription, row.hours]),
    [
      ["2026-06-10", "09:30", "16:30", "ODPRTI TERMINI", "DOPOLDAN", 7],
      ["2026-06-11", "13:30", "20:30", "TEČAJ", "POPOLDAN", 7]
    ]
  );
});

test("calculates worked hours from editable start and end times", () => {
  assert.equal(hoursBetweenTimes("14:30", "20:30"), 6);
  assert.equal(hoursBetweenTimes("08:15", "16:45"), 8.5);
  assert.equal(hoursBetweenTimes("22:00", "02:30"), 4.5);
  assert.equal(hoursBetweenTimes("", "16:00"), null);
});

test("recalculates rows from a profile and groups the final values", () => {
  const report = {
    personName: "Ana Novak",
    profile: createHourProfile("Ana Novak"),
    rows: [
      {
        date: "2026-05-01",
        workType: "Odprti termini",
        shiftDescription: "Dopoldne",
        hours: 6,
        rateCents: 1500,
        rateOverridden: false
      },
      {
        date: "2026-05-02",
        workType: "Odprti termini",
        shiftDescription: "Popoldne",
        hours: 4,
        rateCents: 1600,
        rateOverridden: false
      }
    ]
  };
  const updated = updateReportProfile(report, {
    ...report.profile,
    weekdayRateCents: 1700,
    saturdayRateCents: 1800,
    bonusHours: 2,
    bonusCents: 2500
  });
  const totals = hourReportTotals(updated);
  assert.equal(totals.totalHours, 12);
  assert.equal(totals.totalCents, 23300);
  assert.deepEqual(
    hourReportBreakdown(updated)[0].descriptions.map((item) => item.label),
    ["Dopoldne", "Popoldne"]
  );
});

test("removes a single hour row and recalculates totals from remaining rows", () => {
  const report = {
    personName: "Ana Novak",
    profile: createHourProfile("Ana Novak"),
    rows: [
      {
        id: "row-1",
        date: "2026-05-01",
        workType: "Odprti termini",
        shiftDescription: "Dopoldne",
        hours: 6,
        rateCents: 1500,
        rateOverridden: false
      },
      {
        id: "row-2",
        date: "2026-05-02",
        workType: "Usposabljanje",
        shiftDescription: "MIG/MAG",
        hours: 4,
        rateCents: 1600,
        rateOverridden: false
      }
    ]
  };

  const updated = removeHourReportRow(report, "row-1");

  assert.deepEqual(updated.rows.map((row) => row.id), ["row-2"]);
  assert.equal(hourReportTotals(updated).workedHours, 4);
  assert.equal(hourReportTotals(updated).rowsCents, 6400);
});
