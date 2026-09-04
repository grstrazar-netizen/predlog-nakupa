import assert from "node:assert/strict";
import test from "node:test";

import {
  calendarEventSuggestions,
  calendarEventsForDate,
  calendarYearPlanStatistics,
  expandCalendarEventDates,
  normalizeCalendarEvent,
  validateCalendarEventDraft
} from "../src/calendar-events.js";

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
    selectedDates: ["2026-05-12"],
    recurrence: "selected"
  });

  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors.title, "Vnesi naziv dogodka.");
  assert.match(invalid.errors.endTime, /poznejša/);
});

test("normalizes events and includes custom suggestions", () => {
  const event = normalizeCalendarEvent({
    id: "event-1",
    title: "  Popravilo koles  ",
    category: "Servisni dan",
    location: "V parku",
    dates: ["2036-01-01", "2026-06-08"]
  });
  const suggestions = calendarEventSuggestions([event]);

  assert.equal(event.title, "Popravilo koles");
  assert.deepEqual(event.dates, ["2026-06-08"]);
  assert.ok(suggestions.categories.includes("Servisni dan"));
  assert.ok(suggestions.locations.includes("V parku"));
  assert.deepEqual(calendarEventsForDate([event], "2026-06-08"), [event]);
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
  assert.equal(statistics.locationCount, 2);
  assert.deepEqual(statistics.categories.map(({ name, hours }) => ({ name, hours })), [
    { name: "Tečaj", hours: 7 },
    { name: "Delavnica", hours: 2 }
  ]);
});
