import assert from "node:assert/strict";
import test from "node:test";

import {
  ATTENDANCE_ROWS_PER_PAGE,
  attendanceSheetFromImportGroup,
  attendanceStatistics,
  attendanceSuggestions,
  createAttendanceParticipant,
  createBlankAttendanceSheet,
  normalizeAttendanceCategories,
  normalizePhotoConsent,
  parseWagtailAttendanceCsv,
  photoConsentLabel,
  searchAttendance,
  validateAttendanceSheet
} from "../src/attendance-sheet.js";

test("keeps twelve signature rows on each landscape page", () => {
  assert.equal(ATTENDANCE_ROWS_PER_PAGE, 12);
});

const sampleCsv = `email,event,start_time,start_day,name,surname,question 0,question 0
"ana@example.com","Zunanje kovinsko kurišče","17:00:00","2026-06-10","Ana","Novak","a","b"
"bor@example.com","Zunanje kovinsko kurišče","17:00:00","2026-06-10","Bor","Kovač","c","d"
"cilka@example.com","Tečaj varjenja","18:00:00","2026-06-12","Cilka","Zupan","e","f"
"david@example.com","Tečaj varjenja","18:00:00","2026-06-12","David","Horvat","g","h"`;

function validSheet(overrides = {}) {
  return {
    ...createBlankAttendanceSheet(),
    programName: "Zunanje kovinsko kurišče",
    categoryId: "workshop",
    mentorName: "Gregor Stražar",
    labName: "Kovinarski lab",
    location: "Center Rog",
    eventDate: "2026-06-10",
    eventTime: "17:00",
    participants: [
      createAttendanceParticipant({
        firstName: "Ana",
        lastName: "Novak",
        email: "ana@example.com",
        photoConsent: false
      })
    ],
    ...overrides
  };
}

test("parses quoted Wagtail CSV and groups participants by event, day and time", () => {
  const groups = parseWagtailAttendanceCsv(sampleCsv, "export.csv");
  assert.equal(groups.length, 2);
  assert.equal(groups[0].programName, "Zunanje kovinsko kurišče");
  assert.equal(groups[0].eventDate, "2026-06-10");
  assert.equal(groups[0].eventTime, "17:00");
  assert.equal(groups[0].participants.length, 2);
  assert.equal(groups[1].participants[1].lastName, "Horvat");
});

test("supports semicolon CSV and strips a UTF-8 BOM", () => {
  const csv = "\uFEFFemail;event;start_time;start_day;name;surname\nana@example.com;Delavnica;09:00:00;2026-06-15;Ana;Novak";
  const [group] = parseWagtailAttendanceCsv(csv, "udelezenci.csv");
  assert.equal(group.programName, "Delavnica");
  assert.equal(group.participants[0].email, "ana@example.com");
});

test("reads photo consent from the Wagtail allow_photos column", () => {
  const csv = `email,event,start_time,start_day,name,surname,allow_photos
ana@example.com,Delavnica,09:00,2026-06-15,Ana,Novak,True
bor@example.com,Delavnica,09:00,2026-06-15,Bor,Kovač,False`;
  const [group] = parseWagtailAttendanceCsv(csv);
  assert.equal(group.participants[0].photoConsent, true);
  assert.equal(group.participants[1].photoConsent, false);
  assert.equal(photoConsentLabel(group.participants[0].photoConsent), "DA");
  assert.equal(photoConsentLabel(group.participants[1].photoConsent), "NE");
  assert.equal(normalizePhotoConsent("Da"), true);
  assert.equal(normalizePhotoConsent("Ne"), false);
});

test("reports missing required Wagtail headers", () => {
  assert.throws(
    () => parseWagtailAttendanceCsv("name,surname\nAna,Novak"),
    /manjkajo stolpci/i
  );
});

test("marks duplicate email addresses but keeps both participants", () => {
  const csv = `email,event,start_time,start_day,name,surname
ana@example.com,Delavnica,09:00,2026-06-15,Ana,Novak
ana@example.com,Delavnica,09:00,2026-06-15,Ana,Novak`;
  const [group] = parseWagtailAttendanceCsv(csv);
  assert.equal(group.participants.length, 2);
  assert.equal(group.participants.every((participant) => participant.duplicateEmail), true);
});

test("validates metadata, participant names and email format", () => {
  const invalid = validSheet({
    mentorName: "",
    participants: [
      createAttendanceParticipant({
        firstName: "",
        lastName: "Novak",
        email: "napačen naslov",
        photoConsent: null
      })
    ]
  });
  const validation = validateAttendanceSheet(invalid);
  assert.equal(validation.valid, false);
  assert.equal(validation.fields.mentorName, "To polje je obvezno.");
  const participantId = invalid.participants[0].id;
  assert.equal(validation.fields[`participants.${participantId}.firstName`], "To polje je obvezno.");
  assert.equal(
    validation.fields[`participants.${participantId}.email`],
    "Vnesite veljaven e-poštni naslov."
  );
  assert.equal(
    validation.fields[`participants.${participantId}.photoConsent`],
    "Izberite DA ali NE."
  );
});

test("creates an attendance sheet from an import group and supplied defaults", () => {
  const [group] = parseWagtailAttendanceCsv(sampleCsv);
  const sheet = attendanceSheetFromImportGroup(group, {
    categoryId: "workshop",
    mentorName: "Gregor Stražar",
    labName: "Kovinarski lab",
    location: "Center Rog"
  });
  assert.equal(sheet.categoryId, "workshop");
  assert.equal(sheet.mentorName, "Gregor Stražar");
  assert.equal(sheet.participants.length, 2);
});

test("returns at most three closest remembered values", () => {
  const suggestions = attendanceSuggestions(
    [
      { mentorName: "Gregor Stražar", updatedAt: "2026-06-11" },
      { mentorName: "Grega Novak", updatedAt: "2026-06-10" },
      { mentorName: "Gregor Kovač", updatedAt: "2026-06-09" },
      { mentorName: "Ana Horvat", updatedAt: "2026-06-08" }
    ],
    "mentorName",
    "Gre"
  );
  assert.deepEqual(suggestions, ["Grega Novak", "Gregor Kovač", "Gregor Stražar"]);
});

test("search and statistics count only confirmed attendance", () => {
  const sheet = validSheet({
    participants: [
      createAttendanceParticipant({
        firstName: "Ana",
        lastName: "Novak",
        email: "ana@example.com",
        attended: true
      }),
      createAttendanceParticipant({
        firstName: "Bor",
        lastName: "Kovač",
        email: "bor@example.com",
        attended: false
      })
    ]
  });
  const results = searchAttendance([{ ...sheet, id: "sheet-1" }], "ana@");
  assert.equal(results.length, 1);
  assert.equal(results[0].attended, true);

  const statistics = attendanceStatistics(
    [sheet],
    normalizeAttendanceCategories()
  );
  assert.equal(statistics.totalConfirmed, 1);
  assert.deepEqual(statistics.byCategory, [{ label: "Delavnica", count: 1 }]);
});
