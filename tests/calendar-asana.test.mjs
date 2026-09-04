import assert from "node:assert/strict";
import test from "node:test";

import {
  ASANA_CALENDAR_HEADERS,
  asanaCalendarFileName,
  asanaCalendarRows,
  createAsanaCalendarCsv
} from "../src/calendar-asana.js";

const events = [
  {
    id: "program-1",
    kind: "program",
    title: 'Tečaj "Osnove kovinarstva"',
    category: "Tečaj",
    location: "Prizidek",
    startTime: "09:30",
    endTime: "12:00",
    capacity: 12,
    ticketPriceCents: 2550,
    dates: ["2026-01-05", "2026-01-12", "2027-01-04"]
  },
  {
    id: "important-1",
    kind: "important",
    title: "Rog Forum",
    category: "Interni dogodek",
    location: "Center Rog",
    dates: ["2026-01-06"]
  }
];

test("maps each calendar program to one Asana task for the selected year", () => {
  const rows = asanaCalendarRows(events, 2026);

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    Name: 'Tečaj "Osnove kovinarstva"',
    "Section/Column": "Koledar programov 2026",
    "Start Date": "2026-01-05",
    "Due Date": "2026-01-12",
    Tags: "Tečaj",
    Notes: rows[0].Notes,
    Projects: "",
    "FORMAT DOGODKA": "PROGRAM LABI",
    "TIP PROGRAMA": "TEČAJ",
    "Št. udeležencev:": 12,
    "Ura začetka": "09:30",
    "Ura konca": "12:00",
    Lokacija: "Prizidek"
  });
  assert.match(rows[0].Notes, /SKUPNO UR: 5/);
  assert.match(rows[0].Notes, /PREDVIDENA CENA VSTOPNICE: 25,5 EUR/);
  assert.match(rows[0].Notes, /Ponedeljek, 5\. januar 2026/);
  assert.match(rows[0].Notes, /Ponedeljek, 12\. januar 2026/);
  assert.doesNotMatch(rows[0].Notes, /2027/);
});

test("creates a UTF-8 Asana CSV with exact headers and escaped multiline values", () => {
  const csv = createAsanaCalendarCsv(events, 2026);

  assert.ok(csv.startsWith("\uFEFF"));
  assert.equal(csv.slice(1).split("\r\n")[0], ASANA_CALENDAR_HEADERS.map((header) => `"${header}"`).join(","));
  assert.match(csv, /"Tečaj ""Osnove kovinarstva"""/);
  assert.match(csv, /"KATEGORIJA: Tečaj\nLOKACIJA: Prizidek/);
  assert.equal(asanaCalendarFileName(2026), "asana-koledar-programov-2026.csv");
});

test("uses the existing Asana value for masterclasses", () => {
  const rows = asanaCalendarRows([
    {
      kind: "program",
      title: "Mojstrski tečaj",
      category: "Mojstrski tečaj",
      location: "Laboratorij",
      startTime: "10:00",
      endTime: "13:00",
      dates: ["2026-03-04"]
    }
  ], 2026);

  assert.equal(rows[0]["TIP PROGRAMA"], "MASTERCLASS");
  assert.equal(rows[0]["FORMAT DOGODKA"], "PROGRAM LABI");
});
