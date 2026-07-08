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

const CONNECTEAM_COLUMN_ALIASES = Object.freeze({
  users: ["users", "user", "uporabnik", "mentor", "mentorica", "izvajalec", "oseba", "name"],
  shiftTitle: ["shift title", "title", "opis izmene", "naziv izmene", "izmena"],
  job: ["job", "tip dela", "work type", "activity", "aktivnost", "projekt", "program"],
  date: ["date", "datum", "shift date", "day", "dan"],
  setTimes: ["set times", "times", "termin", "cas", "čas", "ure termina", "scheduled time"],
  shiftTotalHours: [
    "shift total hrs",
    "shift total hours",
    "total hrs",
    "total hours",
    "hours",
    "ure",
    "trajanje",
    "duration"
  ]
});

const CONNECTEAM_REQUIRED_FIELDS = Object.freeze([
  ["users", "Users"],
  ["shiftTitle", "Shift title"],
  ["job", "Job"],
  ["date", "Date"],
  ["setTimes", "Set times"]
]);

const ENGLISH_MONTHS = Object.freeze({
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12"
});

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
    .toLocaleLowerCase("sl-SI")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compactKey(value) {
  return normalizedKey(value).replace(/\s+/g, "");
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

function parseConnecteamDate(value, slashDateOrder = "mdy") {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
      value.getDate()
    ).padStart(2, "0")}`;
  }

  const text = normalizedText(value);
  if (!text) return "";
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const day = first > 12 || slashDateOrder === "dmy" ? first : second;
    const month = first > 12 || slashDateOrder === "dmy" ? second : first;
    return `${slash[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const sl = text.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (sl) return `${sl[3]}-${sl[2].padStart(2, "0")}-${sl[1].padStart(2, "0")}`;

  const english = text.match(/^(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (english) {
    const month = ENGLISH_MONTHS[english[1].toLocaleLowerCase("en-US")];
    if (month) return `${english[3]}-${month}-${english[2].padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(
      parsed.getDate()
    ).padStart(2, "0")}`;
  }
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

function columnScore(header, aliases) {
  const normalizedHeader = normalizedKey(header);
  const compactHeader = compactKey(header);
  return aliases.reduce((best, alias) => {
    const normalizedAlias = normalizedKey(alias);
    const compactAlias = compactKey(alias);
    if (normalizedHeader === normalizedAlias) return Math.max(best, 100);
    if (compactHeader === compactAlias) return Math.max(best, 96);
    if (normalizedHeader.includes(normalizedAlias)) return Math.max(best, 75);
    if (compactHeader.includes(compactAlias)) return Math.max(best, 70);
    return best;
  }, 0);
}

function resolveConnecteamColumns(headers) {
  const used = new Set();
  const columns = {};
  for (const [field, aliases] of Object.entries(CONNECTEAM_COLUMN_ALIASES)) {
    const best = headers
      .map((header) => ({ header, score: used.has(header) ? 0 : columnScore(header, aliases) }))
      .sort((left, right) => right.score - left.score)[0];
    if (best?.score > 0) {
      columns[field] = best.header;
      used.add(best.header);
    } else {
      columns[field] = "";
    }
  }
  return columns;
}

function missingRequiredColumns(columns) {
  return CONNECTEAM_REQUIRED_FIELDS.filter(([field]) => !columns[field]).map(([, label]) => label);
}

function valueForColumn(row, columns, field) {
  const actual = columns[field];
  return actual ? row[actual] : "";
}

function parseHoursFromRow(row, columns) {
  const explicitHours = parseHours(valueForColumn(row, columns, "shiftTotalHours"));
  if (explicitHours > 0) return explicitHours;
  const times = parseSetTimes(valueForColumn(row, columns, "setTimes"));
  return hoursBetweenTimes(times.startTime, times.endTime) || 0;
}

function inferSlashDateOrder(rows, columns) {
  let dmySignals = 0;
  let mdySignals = 0;
  rows.forEach((row) => {
    const match = normalizedText(valueForColumn(row, columns, "date")).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return;
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (first > 12 && second <= 12) dmySignals += 1;
    if (second > 12 && first <= 12) mdySignals += 1;
  });
  return dmySignals > mdySignals ? "dmy" : "mdy";
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

  const columns = resolveConnecteamColumns(Object.keys(rows[0]));
  const missing = missingRequiredColumns(columns);
  if (missing.length) {
    throw new Error(
      `V Excel datoteki ne najdem obveznih stolpcev: ${missing.join(
        ", "
      )}. Preveri, da je Connecteam izvoz iz pogleda List view.`
    );
  }

  const profileMap = new Map(
    profiles.map((profile) => [normalizedKey(profile.name), createHourProfile(profile.name, profile)])
  );
  const slashDateOrder = inferSlashDateOrder(rows, columns);
  const grouped = new Map();
  const rejectedRows = [];

  rows.forEach((sourceRow, sourceIndex) => {
    const personName = normalizedText(valueForColumn(sourceRow, columns, "users"));
    if (!personName || normalizedKey(personName) === "open shift") return;

    const date = parseConnecteamDate(valueForColumn(sourceRow, columns, "date"), slashDateOrder);
    const hours = parseHoursFromRow(sourceRow, columns);
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

    const times = parseSetTimes(valueForColumn(sourceRow, columns, "setTimes"));
    const rateCents = profileRateForDate(profile, date);
    const workType =
      normalizedText(valueForColumn(sourceRow, columns, "job")) || "Brez tipa dela";
    const shiftDescription =
      normalizedText(valueForColumn(sourceRow, columns, "shiftTitle")) || workType;

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

export function updateHourReportRow(row, fieldName, value, profile) {
  const next = { ...row };
  if (fieldName === "hours") {
    next.hours = normalizeHours(value);
  } else if (fieldName === "rateCents") {
    next.rateCents = normalizeRateCents(value);
    next.rateOverridden = true;
  } else {
    next[fieldName] = value;
    if (fieldName === "date") {
      const rate = profileRateForDate(profile, next.date);
      next.rateCents = rate;
      next.originalRateCents = rate;
      next.rateOverridden = false;
    }
    if (fieldName === "startTime" || fieldName === "endTime") {
      const calculatedHours = hoursBetweenTimes(next.startTime, next.endTime);
      if (calculatedHours !== null) next.hours = calculatedHours;
    }
  }
  return next;
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
