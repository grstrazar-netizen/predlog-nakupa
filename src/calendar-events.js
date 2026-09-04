import {
  CALENDAR_YEAR_MAX,
  CALENDAR_YEAR_MIN
} from "./calendar-planner.js";

export const DEFAULT_CALENDAR_EVENT_CATEGORIES = [
  "Usposabljanje",
  "Delavnica",
  "Tečaj",
  "Krožek",
  "Mojstrski tečaj"
];

export const DEFAULT_CALENDAR_EVENT_LOCATIONS = [
  "Laboratorij",
  "Prizidek",
  "Večnamenska soba",
  "Park"
];

export const CALENDAR_IMPORTANT_DATE_SUGGESTIONS = [
  "Dan soseda",
  "Prešernov dan",
  "Rog Design Days",
  "Rog Kreaton",
  "Rog Forum",
  "Kolektivni dopust",
  "Teambuilding",
  "Božična zabava"
];

export const CALENDAR_HEATMAP_IMPACTS = [
  { value: "avoid", label: "Ni primeren", description: "Termin naj bo praviloma prost" },
  { value: "caution", label: "Previdno", description: "Dogodek lahko vpliva na obisk ali prostor" },
  { value: "opportunity", label: "Dobra priložnost", description: "Datum podpira vsebino programa" }
];

export const CALENDAR_RECURRENCE_OPTIONS = [
  { value: "selected", label: "Samo izbrani dnevi" },
  { value: "daily", label: "Vsak dan" },
  { value: "weekly", label: "Vsak teden" },
  { value: "monthly", label: "Vsak mesec" }
];

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function dateFromIso(value) {
  if (!ISO_DATE_PATTERN.test(String(value || ""))) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function isoFromDate(date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isSupportedDate(value) {
  const date = dateFromIso(value);
  if (!date) return false;
  const year = date.getUTCFullYear();
  return year >= CALENDAR_YEAR_MIN && year <= CALENDAR_YEAR_MAX;
}

export function uniqueCalendarDates(values) {
  return [...new Set((values || []).filter(isSupportedDate))].sort();
}

export function expandCalendarEventDates(selectedDates, recurrence = "selected", recurrenceEnd = "") {
  const selected = uniqueCalendarDates(selectedDates);
  if (!selected.length || recurrence === "selected") return selected;

  const start = dateFromIso(selected[0]);
  const end = dateFromIso(recurrenceEnd);
  if (!start || !end || end < start) return selected;

  const dates = [];
  if (recurrence === "daily") {
    for (let cursor = start; cursor <= end; cursor = addUtcDays(cursor, 1)) {
      dates.push(isoFromDate(cursor));
    }
    return uniqueCalendarDates(dates);
  }

  if (recurrence === "weekly") {
    const weekdays = new Set(selected.map((value) => dateFromIso(value)?.getUTCDay()));
    for (let cursor = start; cursor <= end; cursor = addUtcDays(cursor, 1)) {
      if (weekdays.has(cursor.getUTCDay())) dates.push(isoFromDate(cursor));
    }
    return uniqueCalendarDates(dates);
  }

  if (recurrence === "monthly") {
    const patterns = selected.map((value) => {
      const date = dateFromIso(value);
      return {
        weekday: date.getUTCDay(),
        ordinal: Math.ceil(date.getUTCDate() / 7)
      };
    });
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const endMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));

    while (cursor <= endMonth) {
      const year = cursor.getUTCFullYear();
      const month = cursor.getUTCMonth();
      patterns.forEach(({ weekday, ordinal }) => {
        const first = new Date(Date.UTC(year, month, 1));
        const day = 1 + ((weekday - first.getUTCDay() + 7) % 7) + (ordinal - 1) * 7;
        const occurrence = new Date(Date.UTC(year, month, day));
        if (
          occurrence.getUTCMonth() === month &&
          occurrence >= start &&
          occurrence <= end
        ) {
          dates.push(isoFromDate(occurrence));
        }
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return uniqueCalendarDates(dates);
  }

  return selected;
}

export function normalizeCalendarEvent(record = {}) {
  const kind = record.kind === "important" ? "important" : "program";
  const heatmapImpact = CALENDAR_HEATMAP_IMPACTS.some((item) => item.value === record.heatmapImpact)
    ? record.heatmapImpact
    : "caution";
  return {
    id: String(record.id || ""),
    kind,
    title: String(record.title || "").trim(),
    category: kind === "program"
      ? String(record.category || DEFAULT_CALENDAR_EVENT_CATEGORIES[0]).trim()
      : "",
    location: kind === "program"
      ? String(record.location || DEFAULT_CALENDAR_EVENT_LOCATIONS[0]).trim()
      : "",
    startTime: kind === "program" ? String(record.startTime || "17:00") : "",
    endTime: kind === "program" ? String(record.endTime || "20:00") : "",
    capacity: kind === "program"
      ? Math.max(0, Math.round(Number(record.capacity) || 0))
      : 0,
    heatmapImpact,
    dates: uniqueCalendarDates(record.dates),
    createdAt: String(record.createdAt || ""),
    updatedAt: String(record.updatedAt || "")
  };
}

export function validateCalendarEventDraft(draft = {}) {
  const errors = {};
  if (!String(draft.title || "").trim()) errors.title = "Vnesi naziv dogodka.";
  if (draft.kind !== "important") {
    if (!String(draft.category || "").trim()) errors.category = "Izberi ali vnesi kategorijo.";
    if (!String(draft.location || "").trim()) errors.location = "Izberi ali vnesi lokacijo.";
    if (!/^\d{2}:\d{2}$/.test(String(draft.startTime || ""))) errors.startTime = "Vnesi uro začetka.";
    if (!/^\d{2}:\d{2}$/.test(String(draft.endTime || ""))) errors.endTime = "Vnesi uro konca.";
    if (!errors.startTime && !errors.endTime && draft.endTime <= draft.startTime) {
      errors.endTime = "Ura konca mora biti poznejša od ure začetka.";
    }
    const capacity = String(draft.capacity ?? "").trim();
    if (capacity && (!Number.isInteger(Number(capacity)) || Number(capacity) < 1)) {
      errors.capacity = "Vnesi celo število, večje od 0.";
    }
  } else if (!CALENDAR_HEATMAP_IMPACTS.some((item) => item.value === draft.heatmapImpact)) {
    errors.heatmapImpact = "Izberi vpliv pomembnega datuma.";
  }
  const dates = expandCalendarEventDates(
    draft.selectedDates,
    draft.recurrence,
    draft.recurrenceEnd
  );
  if (!dates.length) errors.dates = "Izberi vsaj en dan dogodka.";
  if (draft.recurrence !== "selected") {
    const end = dateFromIso(draft.recurrenceEnd);
    const first = dateFromIso(uniqueCalendarDates(draft.selectedDates)[0]);
    if (!end || !first || end < first) {
      errors.recurrenceEnd = "Končni datum mora biti enak ali poznejši od prvega dogodka.";
    }
  }
  return { valid: Object.keys(errors).length === 0, errors, dates };
}

export function calendarEventSuggestions(events = []) {
  const merge = (defaults, field) => [
    ...new Set([
      ...defaults,
      ...events.map((event) => String(event?.[field] || "").trim()).filter(Boolean)
    ])
  ];
  return {
    categories: merge(DEFAULT_CALENDAR_EVENT_CATEGORIES, "category"),
    locations: merge(DEFAULT_CALENDAR_EVENT_LOCATIONS, "location")
  };
}

export function calendarEventsForDate(events, date) {
  return (events || [])
    .map(normalizeCalendarEvent)
    .filter((event) => event.dates.includes(date))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "important" ? -1 : 1;
      return a.startTime.localeCompare(b.startTime) || a.title.localeCompare(b.title, "sl");
    });
}

function eventDurationHours(event) {
  const [startHours, startMinutes] = event.startTime.split(":").map(Number);
  const [endHours, endMinutes] = event.endTime.split(":").map(Number);
  const durationMinutes = endHours * 60 + endMinutes - startHours * 60 - startMinutes;
  return Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes / 60 : 0;
}

function roundedHours(value) {
  return Math.round(value * 100) / 100;
}

export function calendarYearPlanStatistics(events = [], year) {
  const targetYear = String(year);
  const categories = new Map();
  const locations = new Set();
  const monthlyHours = Array(12).fill(0);
  let programCount = 0;
  let occurrenceCount = 0;
  let hours = 0;
  let participantCapacity = 0;
  let capacityDefinedCount = 0;

  events.map(normalizeCalendarEvent).forEach((event) => {
    if (event.kind !== "program") return;
    const dates = event.dates.filter((date) => date.startsWith(`${targetYear}-`));
    if (!dates.length) return;

    const duration = eventDurationHours(event);
    const eventHours = duration * dates.length;
    const category = categories.get(event.category) || {
      name: event.category,
      programCount: 0,
      occurrenceCount: 0,
      hours: 0,
      participantCapacity: 0,
      capacityDefinedCount: 0
    };

    programCount += 1;
    occurrenceCount += dates.length;
    hours += eventHours;
    participantCapacity += event.capacity;
    if (event.capacity > 0) capacityDefinedCount += 1;
    if (event.location) locations.add(event.location);

    category.programCount += 1;
    category.occurrenceCount += dates.length;
    category.hours += eventHours;
    category.participantCapacity += event.capacity;
    if (event.capacity > 0) category.capacityDefinedCount += 1;
    categories.set(event.category, category);

    dates.forEach((date) => {
      const monthIndex = Number(date.slice(5, 7)) - 1;
      if (monthIndex >= 0 && monthIndex < 12) monthlyHours[monthIndex] += duration;
    });
  });

  const normalizedMonths = monthlyHours.map(roundedHours);
  const busiestMonthIndex = normalizedMonths.reduce(
    (bestIndex, value, index) => value > normalizedMonths[bestIndex] ? index : bestIndex,
    0
  );

  return {
    year: Number(year),
    programCount,
    occurrenceCount,
    hours: roundedHours(hours),
    participantCapacity,
    capacityDefinedCount,
    locationCount: locations.size,
    monthlyHours: normalizedMonths,
    busiestMonth: hours > 0
      ? { monthIndex: busiestMonthIndex, hours: normalizedMonths[busiestMonthIndex] }
      : null,
    categories: [...categories.values()]
      .map((category) => ({ ...category, hours: roundedHours(category.hours) }))
      .sort((left, right) => right.hours - left.hours || left.name.localeCompare(right.name, "sl"))
  };
}
