const DAY_MS = 24 * 60 * 60 * 1000;

export const CALENDAR_YEAR_MIN = 2026;
export const CALENDAR_YEAR_MAX = 2035;

export const CALENDAR_MONTHS = [
  "Januar",
  "Februar",
  "Marec",
  "April",
  "Maj",
  "Junij",
  "Julij",
  "Avgust",
  "September",
  "Oktober",
  "November",
  "December"
];

export const CALENDAR_WEEKDAYS = ["P", "T", "S", "Č", "P", "S", "N"];

export const CALENDAR_FILTERS = [
  { key: "holidays", label: "Prazniki" },
  { key: "school", label: "Šolske počitnice" },
  { key: "academic", label: "Študijski koledar" },
  { key: "theme", label: "Tematski dnevi" },
  { key: "internal", label: "Interni datumi" }
];

export const DEFAULT_CALENDAR_FILTERS = Object.freeze({
  holidays: true,
  school: true,
  academic: true,
  theme: true,
  internal: true
});

export const CALENDAR_SOURCES = [
  {
    label: "Prazniki in dela prosti dnevi",
    href: "https://www.gov.si/teme/drzavni-prazniki-in-dela-prosti-dnevi/"
  },
  {
    label: "Šolski koledar MVI",
    href: "https://www.gov.si/teme/solski-koledar-za-osnovne-sole/"
  },
  {
    label: "Študijski koledar UL",
    href: "https://www.uni-lj.si/studij"
  },
  {
    label: "Mednarodni dnevi OZN",
    href: "https://www.un.org/en/observances/list-days-weeks"
  }
];

function utcDate(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day));
}

function dateFromIso(isoDate) {
  const [year, month, day] = String(isoDate).split("-").map(Number);
  return utcDate(year, month - 1, day);
}

export function calendarDateKey(value) {
  const date = value instanceof Date ? value : dateFromIso(value);
  return date.toISOString().slice(0, 10);
}

function addDays(value, amount) {
  return new Date(value.getTime() + amount * DAY_MS);
}

function weekdayOnOrAfter(year, monthIndex, day, weekday) {
  const date = utcDate(year, monthIndex, day);
  return addDays(date, (weekday - date.getUTCDay() + 7) % 7);
}

function weekdayOnOrBefore(year, monthIndex, day, weekday) {
  const date = utcDate(year, monthIndex, day);
  return addDays(date, -((date.getUTCDay() - weekday + 7) % 7));
}

function event(id, title, category, start, end = start, impact = 0, meta = {}) {
  return { id, title, category, start, end, impact, ...meta };
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcDate(year, month - 1, day);
}

function publicHolidayEvents(year) {
  const fixed = [
    [1, 1, "Novo leto"],
    [1, 2, "Novo leto"],
    [2, 8, "Prešernov dan, slovenski kulturni praznik"],
    [4, 27, "Dan upora proti okupatorju"],
    [5, 1, "Praznik dela"],
    [5, 2, "Praznik dela"],
    [6, 25, "Dan državnosti"],
    [8, 15, "Marijino vnebovzetje"],
    [10, 31, "Dan reformacije"],
    [11, 1, "Dan spomina na mrtve"],
    [12, 25, "Božič"],
    [12, 26, "Dan samostojnosti in enotnosti"]
  ];
  const commemorations = [
    [6, 8, "Dan Primoža Trubarja"],
    [8, 17, "Združitev prekmurskih Slovencev z matičnim narodom"],
    [9, 15, "Priključitev Primorske k matični domovini"],
    [9, 23, "Dan slovenskega športa"],
    [10, 25, "Dan suverenosti"],
    [11, 10, "Dan znanosti"],
    [11, 23, "Dan Rudolfa Maistra"]
  ];
  const easter = easterSunday(year);

  return [
    ...fixed.map(([month, day, title]) =>
      event(
        `holiday-${year}-${month}-${day}`,
        title,
        "holiday",
        calendarDateKey(utcDate(year, month - 1, day)),
        undefined,
        -58,
        { nonWorking: true }
      )
    ),
    ...commemorations.map(([month, day, title]) =>
      event(
        `commemoration-${year}-${month}-${day}`,
        title,
        "holiday",
        calendarDateKey(utcDate(year, month - 1, day)),
        undefined,
        -3,
        { nonWorking: false, commemoration: true }
      )
    ),
    event(
      `easter-${year}`,
      "Velikonočna nedelja",
      "holiday",
      calendarDateKey(easter),
      undefined,
      -58,
      { nonWorking: true }
    ),
    event(
      `easter-monday-${year}`,
      "Velikonočni ponedeljek",
      "holiday",
      calendarDateKey(addDays(easter, 1)),
      undefined,
      -58,
      { nonWorking: true }
    ),
    event(
      `pentecost-${year}`,
      "Binkoštna nedelja",
      "holiday",
      calendarDateKey(addDays(easter, 49)),
      undefined,
      -58,
      { nonWorking: true }
    )
  ];
}

const SCHOOL_EVENTS = [
  event("school-new-year-2026", "Novoletne počitnice", "school", "2026-01-01", "2026-01-02", -20),
  event(
    "school-winter-2026",
    "Zimske počitnice (Ljubljana in osrednjeslovenska regija)",
    "school",
    "2026-02-16",
    "2026-02-20",
    -24
  ),
  event("school-may-2026", "Prvomajske počitnice", "school", "2026-04-27", "2026-05-01", -24),
  event("school-summer-2026", "Poletne počitnice", "school", "2026-06-26", "2026-08-31", -22),
  event("school-autumn-2026", "Jesenske počitnice", "school", "2026-10-26", "2026-10-30", -24),
  event("school-new-year-end-2026", "Novoletne počitnice", "school", "2026-12-25", "2026-12-31", -24),
  event("school-new-year-2027", "Novoletne počitnice", "school", "2027-01-01", "2027-01-02", -24),
  event(
    "school-winter-2027",
    "Zimske počitnice (Ljubljana in osrednjeslovenska regija)",
    "school",
    "2027-02-22",
    "2027-02-26",
    -24
  ),
  event("school-free-2027", "Pouka prost dan", "school", "2027-04-26", undefined, -20),
  event("school-may-2027", "Prvomajske počitnice", "school", "2027-04-27", "2027-05-02", -24),
  event("school-summer-2027", "Poletne počitnice", "school", "2027-06-28", "2027-08-31", -22)
];

const ACADEMIC_EVENTS = [
  event("ul-winter-exams-2026", "Zimsko izpitno obdobje UL", "academic", "2026-01-19", "2026-02-13", -14),
  event("ul-spring-exams-2026", "Spomladansko izpitno obdobje UL", "academic", "2026-06-04", "2026-07-03", -14),
  event("ul-autumn-exams-2026", "Jesensko izpitno obdobje UL", "academic", "2026-08-24", "2026-09-18", -14),
  event("ul-week-2026", "Teden Univerze v Ljubljani", "academic", "2026-11-30", "2026-12-04", -5),
  event("ul-winter-exams-2027", "Zimsko izpitno obdobje UL", "academic", "2027-01-18", "2027-02-12", -14),
  event("ul-spring-exams-2027", "Spomladansko izpitno obdobje UL", "academic", "2027-06-03", "2027-06-30", -14),
  event("ul-autumn-exams-2027", "Jesensko izpitno obdobje UL", "academic", "2027-08-23", "2027-09-17", -14)
];

function estimatedSchoolEvents(year) {
  const winterStart = weekdayOnOrAfter(year, 1, 15, 1);
  const summerStart = weekdayOnOrAfter(year, 5, 26, 1);
  const autumnStart = weekdayOnOrBefore(year, 9, 31, 1);
  const estimated = { estimated: true };

  return [
    event(`school-est-new-year-start-${year}`, "Predvidene novoletne počitnice", "school", `${year}-01-01`, `${year}-01-02`, -16, estimated),
    event(
      `school-est-winter-${year}`,
      "Predvideno obdobje zimskih počitnic",
      "school",
      calendarDateKey(winterStart),
      calendarDateKey(addDays(winterStart, 11)),
      -14,
      estimated
    ),
    event(`school-est-may-${year}`, "Predvidene prvomajske počitnice", "school", `${year}-04-27`, `${year}-05-02`, -18, estimated),
    event(
      `school-est-summer-${year}`,
      "Predvidene poletne počitnice",
      "school",
      calendarDateKey(summerStart),
      `${year}-08-31`,
      -18,
      estimated
    ),
    event(
      `school-est-autumn-${year}`,
      "Predvidene jesenske počitnice",
      "school",
      calendarDateKey(autumnStart),
      calendarDateKey(addDays(autumnStart, 4)),
      -18,
      estimated
    ),
    event(`school-est-new-year-end-${year}`, "Predvidene novoletne počitnice", "school", `${year}-12-25`, `${year}-12-31`, -18, estimated)
  ];
}

function estimatedAcademicEvents(year) {
  const winterStart = weekdayOnOrAfter(year, 0, 15, 1);
  const springStart = weekdayOnOrAfter(year, 5, 1, 4);
  const autumnStart = weekdayOnOrAfter(year, 7, 22, 1);
  const universityWeekStart = weekdayOnOrBefore(year, 11, 1, 1);
  const estimated = { estimated: true };

  return [
    event(
      `ul-est-winter-${year}`,
      "Predvideno zimsko izpitno obdobje UL",
      "academic",
      calendarDateKey(winterStart),
      calendarDateKey(addDays(winterStart, 25)),
      -10,
      estimated
    ),
    event(
      `ul-est-spring-${year}`,
      "Predvideno spomladansko izpitno obdobje UL",
      "academic",
      calendarDateKey(springStart),
      `${year}-06-30`,
      -10,
      estimated
    ),
    event(
      `ul-est-autumn-${year}`,
      "Predvideno jesensko izpitno obdobje UL",
      "academic",
      calendarDateKey(autumnStart),
      calendarDateKey(addDays(autumnStart, 25)),
      -10,
      estimated
    ),
    event(
      `ul-est-week-${year}`,
      "Predvideni Teden Univerze v Ljubljani",
      "academic",
      calendarDateKey(universityWeekStart),
      calendarDateKey(addDays(universityWeekStart, 4)),
      -4,
      estimated
    )
  ];
}

function schoolEventsForYear(year) {
  const official = SCHOOL_EVENTS.filter(
    (item) => item.start.startsWith(String(year)) || item.end.startsWith(String(year))
  );
  if (year === 2026) return official;

  const estimated = estimatedSchoolEvents(year);
  if (year === 2027) {
    return [...official, ...estimated.filter((item) => item.start >= "2027-09-01")];
  }
  return estimated;
}

function academicEventsForYear(year) {
  const official = ACADEMIC_EVENTS.filter(
    (item) => item.start.startsWith(String(year)) || item.end.startsWith(String(year))
  );
  if (year === 2026) return official;

  const estimated = estimatedAcademicEvents(year);
  if (year === 2027) {
    return [...official, ...estimated.filter((item) => item.start >= "2027-09-18")];
  }
  return estimated;
}

export function calendarCoverageForYear(year) {
  if (year === 2026) {
    return {
      key: "official",
      label: "uradni koledarji",
      description: "Šolski in študijski termini temeljijo na objavljenih uradnih koledarjih za leto 2026."
    };
  }
  if (year === 2027) {
    return {
      key: "mixed",
      label: "uradni in ocenjeni podatki",
      description: "Šolski podatki so uradni do avgusta, študijski do septembra 2027; poznejši termini so jasno označene načrtovalne ocene."
    };
  }
  return {
    key: "estimated",
    label: "dolgoročna ocena",
    description: "Prazniki in tematski dnevi so izračunani po znanih pravilih. Šolske in študijske termine bo treba uskladiti z uradnimi koledarji, ko bodo objavljeni."
  };
}

const THEME_DAYS = [
  [1, 24, "Mednarodni dan izobraževanja"],
  [2, 11, "Mednarodni dan žensk in deklet v znanosti"],
  [3, 4, "Svetovni dan inženirstva za trajnostni razvoj"],
  [3, 8, "Mednarodni dan žensk"],
  [3, 14, "Mednarodni dan matematike"],
  [4, 15, "Svetovni dan umetnosti"],
  [4, 21, "Svetovni dan ustvarjalnosti in inovacij"],
  [4, 22, "Mednarodni dan Zemlje"],
  [5, 21, "Svetovni dan kulturne raznolikosti"],
  [6, 5, "Svetovni dan okolja"],
  [8, 12, "Mednarodni dan mladih"],
  [9, 8, "Mednarodni dan pismenosti"],
  [9, 21, "Mednarodni dan miru"],
  [10, 5, "Svetovni dan učiteljev"],
  [11, 10, "Svetovni dan znanosti za mir in razvoj"],
  [11, 20, "Svetovni dan otrok"],
  [12, 3, "Mednarodni dan invalidov"],
  [12, 10, "Dan človekovih pravic"]
];

function themeEvents(year) {
  return THEME_DAYS.map(([month, day, title]) =>
    event(
      `theme-${year}-${month}-${day}`,
      title,
      "theme",
      calendarDateKey(utcDate(year, month - 1, day)),
      undefined,
      6,
      { opportunity: true }
    )
  );
}

export function calendarEventsForYear(year) {
  return [
    ...publicHolidayEvents(year),
    ...schoolEventsForYear(year),
    ...academicEventsForYear(year),
    ...themeEvents(year)
  ];
}

function dateIsInRange(dateKey, start, end) {
  return dateKey >= start && dateKey <= end;
}

function activeEventsForDate(dateKey, filters, events) {
  return events.filter(
    (item) => filters[item.category === "holiday" ? "holidays" : item.category] &&
      dateIsInRange(dateKey, item.start, item.end)
  );
}

function publicHolidayOn(dateKey, events) {
  return events.some(
    (item) => item.category === "holiday" && item.nonWorking && dateIsInRange(dateKey, item.start, item.end)
  );
}

function planningPatterns(date, filters, events) {
  const dateKey = calendarDateKey(date);
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const weekday = date.getUTCDay();
  const patterns = [];

  if (month === 6 && day >= 15 || month === 7 && day <= 16) {
    patterns.push({
      id: `summer-leave-${dateKey}`,
      title: "Običajno obdobje letnih in kolektivnih dopustov",
      category: "pattern",
      impact: -16,
      heuristic: true
    });
  }
  if (month === 11 && day >= 20) {
    patterns.push({
      id: `holiday-leave-${dateKey}`,
      title: "Običajno obdobje prazničnih dopustov",
      category: "pattern",
      impact: -18,
      heuristic: true
    });
  }

  if (filters.holidays && weekday >= 1 && weekday <= 5 && !publicHolidayOn(dateKey, events)) {
    const previousDate = addDays(date, -1);
    const nextDate = addDays(date, 1);
    const previous = calendarDateKey(previousDate);
    const next = calendarDateKey(nextDate);
    const bridge =
      (weekday === 1 && publicHolidayOn(next, events)) ||
      (weekday === 5 && publicHolidayOn(previous, events));
    if (bridge) {
      patterns.push({
        id: `bridge-${dateKey}`,
        title: "Možen podaljšan praznični konec tedna",
        category: "pattern",
        impact: -24,
        heuristic: true
      });
    } else if (nextDate.getUTCDay() >= 1 && nextDate.getUTCDay() <= 5 && publicHolidayOn(next, events)) {
      patterns.push({
        id: `before-holiday-${dateKey}`,
        title: "Dan pred dela prostim praznikom",
        category: "pattern",
        impact: -12,
        heuristic: true
      });
    } else if (
      previousDate.getUTCDay() >= 1 &&
      previousDate.getUTCDay() <= 5 &&
      publicHolidayOn(previous, events)
    ) {
      patterns.push({
        id: `after-holiday-${dateKey}`,
        title: "Dan po dela prostem prazniku",
        category: "pattern",
        impact: -9,
        heuristic: true
      });
    }
  }

  return patterns;
}

function scoreLevel(score) {
  if (score >= 78) return { key: "recommended", label: "Priporočljivo" };
  if (score >= 58) return { key: "neutral", label: "Nevtralno" };
  if (score >= 35) return { key: "caution", label: "Previdno" };
  return { key: "avoid", label: "Odsvetovano" };
}

function internalReasonsForDate(isoDate, filters, customEvents) {
  if (!filters.internal) return [];
  const impacts = {
    avoid: -55,
    caution: -25,
    opportunity: 8
  };
  return (customEvents || [])
    .filter((event) => event?.kind === "important" && event.dates?.includes(isoDate))
    .map((event) => ({
      id: event.id,
      title: event.title,
      category: "internal",
      impact: impacts[event.heatmapImpact] ?? impacts.caution,
      internal: true,
      heatmapImpact: event.heatmapImpact || "caution"
    }));
}

export function analyzeCalendarDate(isoDate, filters = DEFAULT_CALENDAR_FILTERS, customEvents = []) {
  const date = dateFromIso(isoDate);
  const year = date.getUTCFullYear();
  const weekday = date.getUTCDay();
  const baseScores = [52, 82, 84, 84, 82, 72, 66];
  const events = calendarEventsForYear(year);
  const matchedEvents = [
    ...activeEventsForDate(isoDate, filters, events),
    ...internalReasonsForDate(isoDate, filters, customEvents)
  ];
  const patterns = planningPatterns(date, filters, events);
  const reasons = [...matchedEvents, ...patterns];
  const score = Math.max(
    0,
    Math.min(100, Math.round(baseScores[weekday] + reasons.reduce((sum, item) => sum + item.impact, 0)))
  );

  return {
    date: isoDate,
    score,
    level: scoreLevel(score),
    weekend: weekday === 0 || weekday === 6,
    events: matchedEvents,
    reasons,
    hasHoliday: matchedEvents.some((item) => item.category === "holiday" && item.nonWorking),
    hasTheme: matchedEvents.some((item) => item.category === "theme")
  };
}

export function calendarMonth(year, monthIndex, filters = DEFAULT_CALENDAR_FILTERS, customEvents = []) {
  const firstDay = utcDate(year, monthIndex, 1);
  const mondayIndex = (firstDay.getUTCDay() + 6) % 7;
  const daysInMonth = utcDate(year, monthIndex + 1, 0).getUTCDate();
  const cells = [];

  for (let index = 0; index < 42; index += 1) {
    const day = index - mondayIndex + 1;
    if (day < 1 || day > daysInMonth) {
      cells.push(null);
      continue;
    }
    const date = utcDate(year, monthIndex, day);
    const dateKey = calendarDateKey(date);
    cells.push({
      day,
      date: dateKey,
      analysis: analyzeCalendarDate(dateKey, filters, customEvents)
    });
  }

  return {
    year,
    monthIndex,
    name: CALENDAR_MONTHS[monthIndex],
    cells
  };
}

export function bestCalendarDays(year, monthIndex, filters = DEFAULT_CALENDAR_FILTERS, limit = 3, customEvents = []) {
  return calendarMonth(year, monthIndex, filters, customEvents).cells
    .filter(Boolean)
    .filter((cell) => !cell.analysis.hasHoliday && !cell.analysis.weekend)
    .sort((left, right) => right.analysis.score - left.analysis.score || left.date.localeCompare(right.date))
    .slice(0, limit);
}

export function calendarYearSummary(year, filters = DEFAULT_CALENDAR_FILTERS, customEvents = []) {
  const days = [];
  for (let month = 0; month < 12; month += 1) {
    days.push(...calendarMonth(year, month, filters, customEvents).cells.filter(Boolean));
  }
  return {
    recommended: days.filter((item) => item.analysis.level.key === "recommended").length,
    caution: days.filter((item) => ["caution", "avoid"].includes(item.analysis.level.key)).length,
    themes: days.filter((item) => item.analysis.hasTheme).length
  };
}

export function formatCalendarDate(isoDate, options = {}) {
  const formatted = new Intl.DateTimeFormat("sl-SI", {
    weekday: options.weekday === false ? undefined : "long",
    day: "numeric",
    month: "long",
    year: options.year === false ? undefined : "numeric",
    timeZone: "UTC"
  }).format(dateFromIso(isoDate));
  return `${formatted.charAt(0).toUpperCase()}${formatted.slice(1)}`;
}

export function todayCalendarDate(now = new Date()) {
  return calendarDateKey(utcDate(now.getFullYear(), now.getMonth(), now.getDate()));
}
