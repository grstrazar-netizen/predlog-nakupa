import { generateId, safeFileName } from "./utils.js";

export const DEFAULT_HOUR_PROFILE = Object.freeze({
  weekdayRateCents: 1500,
  saturdayRateCents: 1600,
  sundayRateCents: 1600,
  bonusHours: 0,
  bonusCents: 0
});

export const REQUIRED_CONNECTEAM_HEADERS = Object.freeze([
  "Users",
  "Shift title",
  "Job",
  "Date",
  "Set times",
  "shift total hrs"
]);

const SLOVENIAN_MONTHS = Object.freeze([
  "januar",
  "februar",
  "marec",
  "april",
  "maj",
  "junij",
  "julij",
  "avgust",
  "september",
  "oktober",
  "november",
  "december"
]);

function normalizedText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizedKey(value) {
  return normalizedText(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("sl-SI");
}

function numberValue(value, fallback = 0) {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  const parsed = Number(text.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseHours(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  const text = normalizedText(value);
  if (!text) return 0;
  const timeMatch = text.match(/^(-?\d+):(\d{1,2})$/);
  if (timeMatch) {
    const sign = Number(timeMatch[1]) < 0 ? -1 : 1;
    const hours = Math.abs(Number(timeMatch[1]));
    const minutes = Math.min(59, Math.abs(Number(timeMatch[2])));
    return Math.max(0, sign * (hours + minutes / 60));
  }
  return Math.max(0, numberValue(text));
}

export function normalizeHours(value) {
  return Math.round(parseHours(value) * 100) / 100;
}

export function hoursBetweenTimes(startTime, endTime) {
  const timeToMinutes = (value) => {
    const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  };

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  if (startMinutes === null || endMinutes === null) return null;

  let durationMinutes = endMinutes - startMinutes;
  if (durationMinutes < 0) durationMinutes += 24 * 60;
  return normalizeHours(durationMinutes / 60);
}

export function hoursInputValue(value) {
  const hours = normalizeHours(value);
  return Number.isInteger(hours)
    ? String(hours)
    : hours.toLocaleString("sl-SI", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

export function formatHours(value) {
  const hours = normalizeHours(value);
  return `${hours.toLocaleString("sl-SI", {
    minimumFractionDigits: Number.isInteger(hours) ? 0 : 1,
    maximumFractionDigits: 2
  })} h`;
}

export function normalizeRateCents(value, fallback = 0) {
  if (typeof value === "number" && Number.isInteger(value)) return Math.max(0, value);
  return Math.max(0, Math.round(numberValue(value, fallback / 100) * 100));
}

function parseConnecteamDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
      value.getDate()
    ).padStart(2, "0")}`;
  }

  const text = normalizedText(value);
  if (!text) return "";
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const sl = text.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (sl) return `${sl[3]}-${sl[2].padStart(2, "0")}-${sl[1].padStart(2, "0")}`;
  return "";
}

function parseSetTimes(value) {
  const text = normalizedText(value);
  const match = text.match(/(\d{1,2}:\d{2})\s*(?:>|-|–|—)\s*(\d{1,2}:\d{2})/);
  return {
    startTime: match?.[1] || "",
    endTime: match?.[2] || ""
  };
}

function dayType(dateIso) {
  const date = new Date(`${dateIso}T12:00:00`);
  const weekday = date.getDay();
  if (weekday === 6) return "saturday";
  if (weekday === 0) return "sunday";
  return "weekday";
}

export function createHourProfile(name, profile = {}) {
  const normalizedName = normalizedText(name || profile.name);
  return {
    id: profile.id || `hour-profile:${normalizedKey(normalizedName)}`,
    name: normalizedName,
    weekdayRateCents: normalizeRateCents(
      profile.weekdayRateCents,
      DEFAULT_HOUR_PROFILE.weekdayRateCents
    ),
    saturdayRateCents: normalizeRateCents(
      profile.saturdayRateCents,
      DEFAULT_HOUR_PROFILE.saturdayRateCents
    ),
    sundayRateCents: normalizeRateCents(
      profile.sundayRateCents,
      DEFAULT_HOUR_PROFILE.sundayRateCents
    ),
    bonusHours: normalizeHours(profile.bonusHours ?? DEFAULT_HOUR_PROFILE.bonusHours),
    bonusCents: normalizeRateCents(profile.bonusCents, DEFAULT_HOUR_PROFILE.bonusCents),
    createdAt: profile.createdAt || "",
    updatedAt: profile.updatedAt || ""
  };
}

export function profileRateForDate(profile, dateIso) {
  const normalized = createHourProfile(profile?.name || "", profile);
  const type = dayType(dateIso);
  if (type === "saturday") return normalized.saturdayRateCents;
  if (type === "sunday") return normalized.sundayRateCents;
  return normalized.weekdayRateCents;
}

function monthLabel(monthKey) {
  const [year, month] = String(monthKey).split("-").map(Number);
  return `${SLOVENIAN_MONTHS[month - 1] || monthKey} ${year}`;
}

export function hourReportMonthLabel(report) {
  return monthLabel(report?.monthKey || "");
}

function normalizedHeaderMap(headers) {
  const result = new Map();
  headers.forEach((header) => result.set(normalizedKey(header), header));
  return result;
}

function valueForHeader(row, headerMap, expected) {
  const actual = headerMap.get(normalizedKey(expected));
  return actual === undefined ? "" : row[actual];
}

function reportIdFor(name, monthKey) {
  return `hour-report:${normalizedKey(name)}:${monthKey}`;
}

export function parseConnecteamWorkbook(arrayBuffer, fileName, profiles = []) {
  if (!window.XLSX) throw new Error("Knjižnica za branje Excel datotek ni naložena.");
  const workbook = window.XLSX.read(arrayBuffer, {
    type: "array",
    cellDates: true,
    raw: false
  });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("Excel datoteka nima delovnega lista.");
  const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    defval: "",
    raw: false
  });
  if (!rows.length) throw new Error("Prvi delovni list ne vsebuje podatkov.");

  const headerMap = normalizedHeaderMap(Object.keys(rows[0]));
  const missing = REQUIRED_CONNECTEAM_HEADERS.filter(
    (header) => !headerMap.has(normalizedKey(header))
  );
  if (missing.length) {
    throw new Error(`V Excel datoteki manjkajo stolpci: ${missing.join(", ")}.`);
  }

  const profileMap = new Map(
    profiles.map((profile) => [normalizedKey(profile.name), createHourProfile(profile.name, profile)])
  );
  const grouped = new Map();
  const rejectedRows = [];

  rows.forEach((sourceRow, sourceIndex) => {
    const personName = normalizedText(valueForHeader(sourceRow, headerMap, "Users"));
    if (!personName || normalizedKey(personName) === "open shift") return;

    const date = parseConnecteamDate(valueForHeader(sourceRow, headerMap, "Date"));
    const hours = parseHours(valueForHeader(sourceRow, headerMap, "shift total hrs"));
    if (!date || hours <= 0) {
      rejectedRows.push(sourceIndex + 2);
      return;
    }

    const monthKey = date.slice(0, 7);
    const key = `${normalizedKey(personName)}|${monthKey}`;
    const profile =
      profileMap.get(normalizedKey(personName)) || createHourProfile(personName);
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: reportIdFor(personName, monthKey),
        personName,
        monthKey,
        included: true,
        profile: { ...profile },
        rows: []
      });
    }

    const times = parseSetTimes(valueForHeader(sourceRow, headerMap, "Set times"));
    const rateCents = profileRateForDate(profile, date);
    const workType =
      normalizedText(valueForHeader(sourceRow, headerMap, "Job")) || "Brez tipa dela";
    const shiftDescription =
      normalizedText(valueForHeader(sourceRow, headerMap, "Shift title")) || workType;

    grouped.get(key).rows.push({
      id: generateId("hour-row"),
      sourceRow: sourceIndex + 2,
      date,
      startTime: times.startTime,
      endTime: times.endTime,
      workType,
      shiftDescription,
      originalHours: normalizeHours(hours),
      hours: normalizeHours(hours),
      originalRateCents: rateCents,
      rateCents,
      rateOverridden: false
    });
  });

  const reports = [...grouped.values()]
    .map((report) => ({
      ...report,
      rows: report.rows.sort(
        (left, right) =>
          left.date.localeCompare(right.date) || left.startTime.localeCompare(right.startTime)
      )
    }))
    .sort(
      (left, right) =>
        left.monthKey.localeCompare(right.monthKey) ||
        left.personName.localeCompare(right.personName, "sl-SI")
    );

  if (!reports.length) throw new Error("Excel datoteka ne vsebuje veljavnih izmen oseb.");
  return {
    fileName: normalizedText(fileName),
    sheetName: firstSheetName,
    importedAt: new Date().toISOString(),
    reports,
    rejectedRows
  };
}

export function hourRowAmountCents(row) {
  return Math.round(normalizeHours(row?.hours) * normalizeRateCents(row?.rateCents));
}

export function hourReportTotals(report) {
  const rows = report?.rows || [];
  const workedHours = rows.reduce((sum, row) => sum + normalizeHours(row.hours), 0);
  const rowsCents = rows.reduce((sum, row) => sum + hourRowAmountCents(row), 0);
  const profile = createHourProfile(report?.personName || "", report?.profile);
  const bonusHours = normalizeHours(profile.bonusHours);
  const bonusHoursCents = Math.round(bonusHours * profile.weekdayRateCents);
  const fixedBonusCents = normalizeRateCents(profile.bonusCents);
  return {
    workedHours: normalizeHours(workedHours),
    bonusHours,
    totalHours: normalizeHours(workedHours + bonusHours),
    rowsCents,
    bonusHoursCents,
    fixedBonusCents,
    totalCents: rowsCents + bonusHoursCents + fixedBonusCents
  };
}

export function hourReportBreakdown(report) {
  const typeMap = new Map();
  (report?.rows || []).forEach((row) => {
    const type = normalizedText(row.workType) || "Brez tipa dela";
    const description = normalizedText(row.shiftDescription) || "Brez opisa";
    if (!typeMap.has(type)) {
      typeMap.set(type, { label: type, hours: 0, cents: 0, descriptions: new Map() });
    }
    const typeItem = typeMap.get(type);
    const hours = normalizeHours(row.hours);
    const cents = hourRowAmountCents(row);
    typeItem.hours += hours;
    typeItem.cents += cents;
    if (!typeItem.descriptions.has(description)) {
      typeItem.descriptions.set(description, {
        label: description,
        hours: 0,
        cents: 0
      });
    }
    const descriptionItem = typeItem.descriptions.get(description);
    descriptionItem.hours += hours;
    descriptionItem.cents += cents;
  });

  return [...typeMap.values()]
    .map((item) => ({
      label: item.label,
      hours: normalizeHours(item.hours),
      cents: item.cents,
      descriptions: [...item.descriptions.values()]
        .map((description) => ({
          ...description,
          hours: normalizeHours(description.hours)
        }))
        .sort((left, right) => left.label.localeCompare(right.label, "sl-SI"))
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "sl-SI"));
}

export function updateReportProfile(report, profile) {
  const normalized = createHourProfile(report.personName, profile);
  return {
    ...report,
    profile: normalized,
    rows: report.rows.map((row) => ({
      ...row,
      rateCents: row.rateOverridden
        ? row.rateCents
        : profileRateForDate(normalized, row.date),
      originalRateCents: profileRateForDate(normalized, row.date)
    }))
  };
}

export function resetHourRow(row) {
  return {
    ...row,
    hours: row.originalHours,
    rateCents: row.originalRateCents,
    rateOverridden: false
  };
}

export function removeHourReportRow(report, rowId) {
  return {
    ...report,
    rows: (report?.rows || []).filter((row) => row.id !== rowId)
  };
}

export function hourReportFileName(report) {
  const [year, month] = report.monthKey.split("-").map(Number);
  return `${safeFileName(
    `porocilo_ur_${report.personName}_${SLOVENIAN_MONTHS[month - 1] || month}_${year}`
  )}.pdf`;
}

export function validateHourReport(report) {
  const errors = [];
  if (!normalizedText(report?.personName)) errors.push("Manjka ime osebe.");
  (report?.rows || []).forEach((row, index) => {
    if (!row.date) errors.push(`Vrstica ${index + 1}: manjka datum.`);
    if (!normalizedText(row.workType)) errors.push(`Vrstica ${index + 1}: manjka tip dela.`);
    if (!normalizedText(row.shiftDescription)) errors.push(`Vrstica ${index + 1}: manjka opis izmene.`);
    if (normalizeHours(row.hours) <= 0) errors.push(`Vrstica ${index + 1}: ure morajo biti večje od 0.`);
    if (normalizeRateCents(row.rateCents) <= 0) errors.push(`Vrstica ${index + 1}: postavka mora biti večja od 0.`);
  });
  return errors;
}
