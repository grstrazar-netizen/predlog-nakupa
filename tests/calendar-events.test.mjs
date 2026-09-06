import assert from "node:assert/strict";
import test from "node:test";

import {
  calendarEventConflictsForDate,
  calendarEventOccurrence,
  calendarEventSuggestions,
  calendarEventsForDate,
  calendarYearPlanStatistics,
  expandCalendarEventDates,
  normalizeCalendarEvent,
  validateCalendarEventDraft
} from "../src/calendar-events.js";

test("detects overlapping programs at the same location", () => {
  const events = [
    normalizeCalendarEvent({ id: "first", title: "Prvi", location: "Laboratorij", startTime: "17:00", endTime: "20:00", dates: ["2026-09-03"] }),
    normalizeCalendarEvent({ id: "second", title: "Drugi", location: "laboratorij", startTime: "18:30", endTime: "21:00", dates: ["2026-09-03"] }),
    normalizeCalendarEvent({ id: "other-room", title: "Drug prostor", location: "Park", startTime: "18:00", endTime: "19:00", dates: ["2026-09-03"] }),
    normalizeCalendarEvent({ id: "later", title: "Kasneje", location: "Laboratorij", startTime: "21:00", endTime: "22:00", dates: ["2026-09-03"] })
  ];

  assert.deepEqual(calendarEventConflictsForDate(events, "2026-09-03"), [{
    date: "2026-09-03",
    location: "Laboratorij",
    startTime: "18:30",
    endTime: "20:00",
    eventIds: ["first", "second"]
  }]);
});

test("labels a date with its position in a repeating program", () => {
  const event = {
    dates: ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"]
  };

  assert.deepEqual(calendarEventOccurrence(event, "2026-01-12"), {
    current: 2,
    total: 4,
    label: "2/4"
  });
  assert.equal(calendarEventOccurrence(event, "2026-01-05").label, "1/4");
  assert.equal(calendarEventOccurrence({ dates: ["2026-01-05"] }, "2026-01-05").label, "");
});

test("keeps explicitly selected consecutive and irregular dates", () => {
  assert.deepEqual(
    expandCalendarEventDates(["2026-01-07", "2026-01-05", "2026-01-07"], "selected"),
    ["2026-01-05", "2026-01-07"]
  );
});

test("expands a daily event through the selected end date", () => {
  assert.deepEqual(
    expandCalendarEventDates(["2026-03-02"], "daily", "2026-03-05"),
    ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05"]
  );
});

test("repeats all selected weekdays without repeating date entry", () => {
  assert.deepEqual(
    expandCalendarEventDates(
      ["2026-01-05", "2026-01-07", "2026-01-08"],
      "weekly",
      "2026-01-15"
    ),
    [
      "2026-01-05",
      "2026-01-07",
      "2026-01-08",
      "2026-01-12",
      "2026-01-14",
      "2026-01-15"
    ]
  );
});

test("supports the first Monday of every month pattern", () => {
  assert.deepEqual(
    expandCalendarEventDates(["2026-01-05"], "monthly", "2026-04-30"),
    ["2026-01-05", "2026-02-02", "2026-03-02", "2026-04-06"]
  );
});

test("validates required event fields and time order", () => {
  const invalid = validateCalendarEventDraft({
    title: "",
    category: "Delavnica",
    location: "Laboratorij",
    startTime: "18:00",
    endTime: "17:00",
    ticketPrice: "12,345",
    selectedDates: ["2026-05-12"],
    recurrence: "selected"
  });

  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors.title, "Vnesi naziv dogodka.");
  assert.match(invalid.errors.endTime, /poznejša/);
  assert.match(invalid.errors.ticketPrice, /veljavno ceno/);
});

test("normalizes events and includes custom suggestions", () => {
  const event = normalizeCalendarEvent({
    id: "event-1",
    title: "  Popravilo koles  ",
    category: "Servisni dan",
    location: "V parku",
    ticketPrice: "25,50",
    dates: ["2036-01-01", "2026-06-08"]
  });
  const suggestions = calendarEventSuggestions([event]);

  assert.equal(event.title, "Popravilo koles");
  assert.equal(event.ticketPriceCents, 2550);
  assert.equal(event.color, "teal");
  assert.deepEqual(event.dates, ["2026-06-08"]);
  assert.ok(suggestions.categories.includes("Servisni dan"));
  assert.ok(suggestions.locations.includes("V parku"));
  assert.deepEqual(calendarEventsForDate([event], "2026-06-08"), [event]);
});

test("assigns a consistent program color from its category", () => {
  assert.equal(normalizeCalendarEvent({ category: "Usposabljanje", color: "red" }).color, "blue");
  assert.equal(normalizeCalendarEvent({ category: "Delavnica" }).color, "green");
  assert.equal(normalizeCalendarEvent({ category: "Tečaj" }).color, "amber");
  assert.equal(normalizeCalendarEvent({ category: "Krožek" }).color, "red");
  assert.equal(normalizeCalendarEvent({ category: "Mojstrski tečaj" }).color, "violet");
  assert.equal(normalizeCalendarEvent({ category: "Servisni dan" }).color, "teal");
  assert.equal(normalizeCalendarEvent({ kind: "important", color: "red" }).color, "");
});

test("accepts an important date without program fields", () => {
  const draft = {
    kind: "important",
    title: "Rog Forum",
    heatmapImpact: "avoid",
    selectedDates: ["2026-10-15"],
    recurrence: "selected"
  };
  const validation = validateCalendarEventDraft(draft);
  const event = normalizeCalendarEvent({ ...draft, dates: validation.dates });

  assert.equal(validation.valid, true);
  assert.equal(event.kind, "important");
  assert.equal(event.heatmapImpact, "avoid");
  assert.equal(event.category, "");
  assert.equal(event.location, "");
  assert.equal(event.startTime, "");
  assert.equal(event.endTime, "");
  assert.equal(event.ticketPriceCents, 0);
});

test("calculates annual program hours, occurrences and capacity by category", () => {
  const statistics = calendarYearPlanStatistics([
    {
      id: "course-1",
      title: "Kovinarski tečaj",
      category: "Tečaj",
      location: "Kovinarski lab",
      startTime: "17:00",
      endTime: "20:30",
      capacity: 12,
      dates: ["2026-01-05", "2026-01-12", "2027-01-04"]
    },
    {
      id: "workshop-1",
      title: "Delavnica",
      category: "Delavnica",
      location: "Prizidek",
      startTime: "10:00",
      endTime: "12:00",
      capacity: 8,
      dates: ["2026-02-10"]
    },
    {
      id: "important-1",
      kind: "important",
      title: "Rog Forum",
      dates: ["2026-02-10"]
    }
  ], 2026);

  assert.equal(statistics.programCount, 2);
  assert.equal(statistics.occurrenceCount, 3);
  assert.equal(statistics.hours, 9);
  assert.equal(statistics.participantCapacity, 20);
  assert.equal(statistics.participantHours, 100);
  assert.equal(statistics.averageHoursPerParticipant, 5);
  assert.equal(statistics.locationCount, 2);
  assert.deepEqual(statistics.categories.map(({ name, hours }) => ({ name, hours })), [
    { name: "Tečaj", hours: 7 },
    { name: "Delavnica", hours: 2 }
  ]);
});
