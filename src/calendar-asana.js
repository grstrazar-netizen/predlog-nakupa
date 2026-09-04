import { formatCalendarDate } from "./calendar-planner.js";
import { normalizeCalendarEvent } from "./calendar-events.js";

export const ASANA_CALENDAR_HEADERS = Object.freeze([
  "Name",
  "Section/Column",
  "Start Date",
  "Due Date",
  "Tags",
  "Notes",
  "Projects",
  "FORMAT DOGODKA",
  "TIP PROGRAMA",
  "Št. udeležencev:",
  "Ura začetka",
  "Ura konca",
  "Lokacija"
]);

function eventDurationHours(event) {
  const [startHours, startMinutes] = event.startTime.split(":").map(Number);
  const [endHours, endMinutes] = event.endTime.split(":").map(Number);
  const minutes = endHours * 60 + endMinutes - startHours * 60 - startMinutes;
  return Number.isFinite(minutes) && minutes > 0 ? minutes / 60 : 0;
}

function formatHours(value) {
  return Number(value || 0).toLocaleString("sl-SI", { maximumFractionDigits: 1 });
}

function asanaProgramType(category) {
  if (category.toLocaleLowerCase("sl-SI") === "mojstrski tečaj") return "MASTERCLASS";
  return category.toLocaleUpperCase("sl-SI");
}

function eventNotes(event, dates) {
  const duration = eventDurationHours(event) * dates.length;
  const lines = [
    `KATEGORIJA: ${event.category}`,
    `LOKACIJA: ${event.location}`,
    `URA: ${event.startTime}–${event.endTime}`,
    event.capacity ? `PREDVIDENO ŠT. UDELEŽENCEV: ${event.capacity}` : "",
    event.ticketPriceCents ? `PREDVIDENA CENA VSTOPNICE: ${formatHours(event.ticketPriceCents / 100)} EUR` : "",
    `SKUPNO UR: ${formatHours(duration)}`,
    "",
    "TERMINI:",
    ...dates.map((date) => `- ${formatCalendarDate(date)}, ${event.startTime}–${event.endTime}`)
  ];
  return lines.filter((line, index) => line || index === 6).join("\n");
}

export function asanaCalendarRows(events = [], year) {
  const yearPrefix = `${year}-`;
  return events
    .map(normalizeCalendarEvent)
    .filter((event) => event.kind === "program")
    .map((event) => {
      const dates = event.dates.filter((date) => date.startsWith(yearPrefix)).sort();
      if (!dates.length) return null;
      return {
        "Name": event.title,
        "Section/Column": `Koledar programov ${year}`,
        "Start Date": dates[0],
        "Due Date": dates.at(-1),
        "Tags": event.category,
        "Notes": eventNotes(event, dates),
        "Projects": "",
        "FORMAT DOGODKA": "PROGRAM LABI",
        "TIP PROGRAMA": asanaProgramType(event.category),
        "Št. udeležencev:": event.capacity || "",
        "Ura začetka": event.startTime,
        "Ura konca": event.endTime,
        "Lokacija": event.location
      };
    })
    .filter(Boolean)
    .sort((left, right) => left["Start Date"].localeCompare(right["Start Date"]) || left.Name.localeCompare(right.Name, "sl"));
}

function escapeCsvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function createAsanaCalendarCsv(events = [], year) {
  const rows = asanaCalendarRows(events, year);
  const lines = [
    ASANA_CALENDAR_HEADERS.map(escapeCsvCell).join(","),
    ...rows.map((row) => ASANA_CALENDAR_HEADERS.map((header) => escapeCsvCell(row[header])).join(","))
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function asanaCalendarFileName(year) {
  return `asana-koledar-programov-${year}.csv`;
}
