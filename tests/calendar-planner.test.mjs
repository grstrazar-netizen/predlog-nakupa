import assert from "node:assert/strict";
import test from "node:test";

import {
  CALENDAR_YEAR_MAX,
  CALENDAR_YEAR_MIN,
  DEFAULT_CALENDAR_FILTERS,
  analyzeCalendarDate,
  bestCalendarDays,
  calendarCoverageForYear,
  calendarEventsForYear,
  calendarMonth,
  calendarYearSummary
} from "../src/calendar-planner.js";

test("covers ten planning years from 2026 through 2035", () => {
  assert.equal(CALENDAR_YEAR_MIN, 2026);
  assert.equal(CALENDAR_YEAR_MAX, 2035);
  assert.equal(CALENDAR_YEAR_MAX - CALENDAR_YEAR_MIN + 1, 10);
});

test("marks Slovenian public holidays as unsuitable", () => {
  const analysis = analyzeCalendarDate("2026-06-25");

  assert.equal(analysis.hasHoliday, true);
  assert.equal(analysis.level.key, "avoid");
  assert.ok(analysis.reasons.some((reason) => reason.title === "Dan državnosti"));
});

test("detects bridge days next to a Thursday public holiday", () => {
  const analysis = analyzeCalendarDate("2026-06-26");

  assert.ok(analysis.reasons.some((reason) => reason.title.includes("praznični konec tedna")));
  assert.ok(analysis.score < 60);
});

test("does not invent a bridge before a Sunday public holiday", () => {
  const analysis = analyzeCalendarDate("2026-02-06");

  assert.equal(
    analysis.reasons.some((reason) => reason.title.includes("praznični konec tedna")),
    false
  );
});

test("does not penalize weekdays next to weekend-only holidays", () => {
  const mondayAfterSundayHoliday = analyzeCalendarDate("2026-02-09");
  const holidayFollowedByHoliday = analyzeCalendarDate("2026-01-01");

  assert.equal(
    mondayAfterSundayHoliday.reasons.some((reason) => reason.title === "Dan po dela prostem prazniku"),
    false
  );
  assert.equal(
    holidayFollowedByHoliday.reasons.some((reason) => reason.title === "Dan pred dela prostim praznikom"),
    false
  );
});

test("uses the Ljubljana school break and UL exam periods", () => {
  const schoolBreak = analyzeCalendarDate("2026-02-18");
  const examPeriod = analyzeCalendarDate("2026-06-12");

  assert.ok(schoolBreak.events.some((item) => item.category === "school"));
  assert.ok(examPeriod.events.some((item) => item.category === "academic"));
});

test("keeps future public holidays exact and labels calendar estimates", () => {
  const holiday = analyzeCalendarDate("2035-06-25");
  const estimatedEvents = calendarEventsForYear(2035).filter((item) => item.estimated);
  const coverage = calendarCoverageForYear(2035);

  assert.ok(holiday.reasons.some((reason) => reason.title === "Dan državnosti"));
  assert.equal(holiday.level.key, "avoid");
  assert.ok(estimatedEvents.some((item) => item.category === "school"));
  assert.ok(estimatedEvents.some((item) => item.category === "academic"));
  assert.equal(coverage.key, "estimated");
});

test("combines published and estimated data in 2027 without overlaps", () => {
  const events = calendarEventsForYear(2027);

  assert.ok(events.some((item) => item.id === "school-winter-2027" && !item.estimated));
  assert.ok(events.some((item) => item.id === "school-est-autumn-2027" && item.estimated));
  assert.equal(calendarCoverageForYear(2027).key, "mixed");
});

test("allows each source to be excluded from the score", () => {
  const withSchool = analyzeCalendarDate("2026-02-18");
  const withoutSchool = analyzeCalendarDate("2026-02-18", {
    ...DEFAULT_CALENDAR_FILTERS,
    school: false
  });

  assert.ok(withoutSchool.score > withSchool.score);
  assert.equal(withoutSchool.events.some((item) => item.category === "school"), false);
});

test("includes internal important dates in the heatmap score", () => {
  const importantDates = [{
    id: "rog-forum",
    kind: "important",
    title: "Rog Forum",
    heatmapImpact: "avoid",
    dates: ["2026-09-08"]
  }];
  const regularDay = analyzeCalendarDate("2026-09-08");
  const affectedDay = analyzeCalendarDate("2026-09-08", DEFAULT_CALENDAR_FILTERS, importantDates);
  const excludedDay = analyzeCalendarDate("2026-09-08", {
    ...DEFAULT_CALENDAR_FILTERS,
    internal: false
  }, importantDates);

  assert.ok(affectedDay.score < regularDay.score);
  assert.ok(affectedDay.reasons.some((reason) => reason.title === "Rog Forum"));
  assert.equal(excludedDay.score, regularDay.score);
  assert.equal(excludedDay.reasons.some((reason) => reason.title === "Rog Forum"), false);
});

test("treats relevant international days as positive programming opportunities", () => {
  const analysis = analyzeCalendarDate("2026-04-21");

  assert.equal(analysis.hasTheme, true);
  assert.ok(analysis.events.some((item) => item.title.includes("ustvarjalnosti")));
  assert.ok(analysis.score >= 80);
});

test("builds a stable six-week month grid and useful yearly summary", () => {
  const february = calendarMonth(2026, 1);
  const summary = calendarYearSummary(2026);

  assert.equal(february.cells.length, 42);
  assert.equal(february.cells.filter(Boolean).length, 28);
  assert.ok(summary.recommended > 100);
  assert.ok(summary.caution > 0);
  assert.ok(summary.themes > 0);
});

test("suggests high-scoring weekdays within the selected month", () => {
  const best = bestCalendarDays(2026, 8);

  assert.equal(best.length, 3);
  assert.ok(best.every((item) => !item.analysis.weekend));
  assert.ok(best.every((item) => !item.analysis.hasHoliday));
  assert.ok(best[0].analysis.score >= best[1].analysis.score);
});
