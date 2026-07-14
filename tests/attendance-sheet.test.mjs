import assert from "node:assert/strict";
import test from "node:test";

import {
  ATTENDANCE_MIN_ROWS,
  ATTENDANCE_ROWS_PER_PAGE,
  attendanceParticipantEmailDisplay,
  attendanceVisibleRowCount,
  attendanceSheetFromImportGroup,
  attendanceStatistics,
  attendanceSuggestions,
  createAttendanceParticipant,
  createBlankAttendanceSheet,
  isRelatedAttendanceParticipant,
  normalizeAttendanceCategories,
  normalizePhotoConsent,
  parseWagtailAttendanceCsv,
  photoConsentLabel,
  searchAttendance,
  validateAttendanceSheet
} from "../src/attendance-sheet.js";

test("supports sixteen imported participants per landscape page", () => {
  assert.equal(ATTENDANCE_ROWS_PER_PAGE, 16);
});

test("shows eight empty places and expands only to actual participants", () => {
  assert.equal(ATTENDANCE_MIN_ROWS, 8);
  assert.equal(attendanceVisibleRowCount(0, 0), 8);
  assert.equal(attendanceVisibleRowCount(4, 4), 8);
  assert.equal(attendanceVisibleRowCount(12, 12), 12);
  assert.equal(attendanceVisibleRowCount(17, 1), 1);
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

test("parses quoted Wagtail CSV into one current event attendance sheet", () => {
  const groups = parseWagtailAttendanceCsv(sampleCsv, "export.csv");
  assert.equal(groups.length, 1);
  assert.equal(groups[0].programName, "Zunanje kovinsko kurišče");
  assert.equal(groups[0].eventDate, "2026-06-10");
  assert.equal(groups[0].eventTime, "17:00");
  assert.equal(groups[0].participants.length, 4);
  assert.equal(groups[0].participants[3].lastName, "Horvat");
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
  assert.equal(photoConsentLabel(group.participants[0].photoConsent), "✓");
  assert.equal(photoConsentLabel(group.participants[1].photoConsent), "✕");
  assert.equal(normalizePhotoConsent("Da"), true);
  assert.equal(normalizePhotoConsent("Ne"), false);
});

test("prioritizes detailed photo consent and understands Wagtail answer variants", () => {
  const csv = `email,event,start_time,start_day,name,surname,allow_photos,question 0
ana@example.com,Delavnica,09:00,2026-06-15,Ana,Novak,False,"Ali dovoljujete fotografiranje? -> ['Da']"
bor@example.com,Delavnica,09:00,2026-06-15,Bor,Kovač,False,"Dovoljenje za fotografiranje -> Seznanjen_a sem, da so dogodki foto dokumentirani, in se s tem strinjam."`;
  const [group] = parseWagtailAttendanceCsv(csv);
  assert.equal(group.participants[0].photoConsent, true);
  assert.equal(group.participants[1].photoConsent, true);
});

test("parses child-program Wagtail CSV rows into child participants", () => {
  const csv = `email,event,start_time,start_day,name,surname,no. children,allow_photos,question 0,question 1
stars1@example.com,Mali mojster: Mizarski tečaj za otroke,10:00:00,2026-07-06,Maja,Novak,1,False,Opremo v delavnicah bom uporabljal_a na lastno odgovornost. -> Da,Ali dovoljujete fotografiranje in snemanje izključno za potrebe promocije programa Centra Rog? -> Da
↳ (child),,,,Liam,Žigon,,,,,
stars2@example.com,Mali mojster: Mizarski tečaj za otroke,10:00:00,2026-07-06,,,1,True,Opremo v delavnicah bom uporabljal_a na lastno odgovornost. -> Da,Ali dovoljujete fotografiranje in snemanje izključno za potrebe promocije programa Centra Rog? -> Ne
↳ (child),,,,Dmytro,Lysenko,,,,,`;

  const [group] = parseWagtailAttendanceCsv(csv, "otroski-program.csv");

  assert.equal(group.programName, "Mali mojster: Mizarski tečaj za otroke");
  assert.equal(group.eventDate, "2026-07-06");
  assert.equal(group.eventTime, "10:00");
  assert.deepEqual(
    group.participants.map((participant) => [
      participant.firstName,
      participant.lastName,
      participant.email,
      participant.contactName,
      attendanceParticipantEmailDisplay(participant),
      participant.photoConsent
    ]),
    [
      ["Liam", "Žigon", "stars1@example.com", "Maja Novak", "Maja Novak - stars1@example.com", true],
      ["Dmytro", "Lysenko", "stars2@example.com", "", "stars2@example.com", false]
    ]
  );
});

test("keeps related children and extra people without requiring their own contact data", () => {
  const csv = `email,event,start_time,start_day,name,surname,no. children,no. extra people,allow_photos
parent@example.com,Otroški program,10:00:00,2026-07-06,Maja,Novak,1,0,False
↳ (child),,,,Liam,Žigon,,,,
info@example.com,Skupnostna kuhinja,10:00:00,2026-07-07,Rezervacija,Skupine,0,1,True
↳ (extra person),,,,Nika,Kovač,,,,`;
  const [group] = parseWagtailAttendanceCsv(csv, "povezane-osebe.csv");
  assert.deepEqual(
    group.participants.map((participant) => [
      participant.firstName,
      participant.participantType,
      participant.email,
      participant.photoConsent
    ]),
    [
      ["Liam", "child", "parent@example.com", false],
      ["Nika", "extra", "info@example.com", true]
    ]
  );
  assert.equal(group.participants.every(isRelatedAttendanceParticipant), true);
  assert.equal(validateAttendanceSheet(validSheet({ participants: group.participants })).valid, true);
});

test("keeps ordinary registrations with zero dependants and ignores repeated reservation placeholders", () => {
  const csv = `email,event,start_time,start_day,name,surname,no. children,no. extra people,allow_photos
ana@example.com,Delavnica,10:00:00,2026-07-06,Ana,Novak,0,0,True
info@example.com,Skupnostna kuhinja,10:00:00,2026-07-07,Rezervacija,Skupine,0,2,False
↳ (extra person),,,,Rezervacija,Skupine,,,,
↳ (extra person),,,,Nika,Kovač,,,,`;
  const [group] = parseWagtailAttendanceCsv(csv);
  assert.deepEqual(
    group.participants.map((participant) => `${participant.firstName} ${participant.lastName}`),
    ["Ana Novak", "Nika Kovač"]
  );
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

test("keeps one import group even when rows contain different Wagtail event metadata", () => {
  const groups = parseWagtailAttendanceCsv(sampleCsv, "export.csv");
  assert.equal(groups.length, 1);
  assert.equal(groups[0].programName, "Zunanje kovinsko kurišče");
  assert.equal(groups[0].participants.map((participant) => participant.firstName).join(", "), "Ana, Bor, Cilka, David");
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
    "Izberite kljukico ali križec."
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
  assert.equal(sheet.participants.length, 4);
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
