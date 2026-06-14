import { DEFAULTS, generateId, todayIso } from "./utils.js";

export const ATTENDANCE_CATEGORY_ASSET_ID = "attendance-categories";
export const ATTENDANCE_ROWS_PER_PAGE = 16;

export const DEFAULT_ATTENDANCE_CATEGORIES = Object.freeze([
  {
    id: "training",
    label: "Usposabljanje",
    builtIn: true,
    hidden: false
  },
  {
    id: "workshop",
    label: "Delavnica",
    builtIn: true,
    hidden: false
  },
  {
    id: "course",
    label: "Tečaj",
    builtIn: true,
    hidden: false
  }
]);

const REQUIRED_CSV_HEADERS = Object.freeze([
  "event",
  "start_day",
  "start_time",
  "name",
  "surname",
  "email"
]);
const OPTIONAL_CSV_HEADERS = Object.freeze(["allow_photos"]);

function localTimeValue(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function normalizedText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizedSearch(value) {
  return normalizedText(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("sl-SI");
}

function requiredText(value) {
  return normalizedText(value).length > 0;
}

export function normalizePhotoConsent(value) {
  if (value === true || value === false) return value;
  const normalized = normalizedSearch(value);
  if (["true", "yes", "da", "1"].includes(normalized)) return true;
  if (["false", "no", "ne", "0"].includes(normalized)) return false;
  return null;
}

export function photoConsentLabel(value) {
  const normalized = normalizePhotoConsent(value);
  if (normalized === true) return "✓";
  if (normalized === false) return "✕";
  return "—";
}

export function createAttendanceParticipant(values = {}) {
  return {
    id: values.id || generateId("participant"),
    firstName: normalizedText(values.firstName),
    lastName: normalizedText(values.lastName),
    email: normalizedText(values.email).toLocaleLowerCase("sl-SI"),
    photoConsent: normalizePhotoConsent(values.photoConsent),
    attended: Boolean(values.attended),
    duplicateEmail: Boolean(values.duplicateEmail)
  };
}

export function normalizeAttendanceCategories(categories = []) {
  const byId = new Map();
  DEFAULT_ATTENDANCE_CATEGORIES.forEach((category) => {
    byId.set(category.id, { ...category });
  });

  categories.forEach((category) => {
    const id = normalizedText(category?.id);
    const label = normalizedText(category?.label);
    if (!id || !label) return;
    const builtIn = byId.get(id)?.builtIn === true;
    byId.set(id, {
      id,
      label,
      builtIn,
      hidden: Boolean(category.hidden)
    });
  });

  return [...byId.values()];
}

export function createCustomAttendanceCategory(label) {
  const normalizedLabel = normalizedText(label);
  if (!normalizedLabel) return null;
  return {
    id: generateId("attendance-category"),
    label: normalizedLabel,
    builtIn: false,
    hidden: false
  };
}

export function createBlankAttendanceSheet(lastSheet, profile = {}) {
  const now = new Date();
  return {
    id: "",
    programName: "",
    categoryId: lastSheet?.categoryId || DEFAULT_ATTENDANCE_CATEGORIES[0].id,
    mentorName: lastSheet?.mentorName || profile.fullName || "",
    labName: lastSheet?.labName || profile.labName || "",
    location: lastSheet?.location || DEFAULTS.city,
    eventDate: todayIso(),
    eventTime: localTimeValue(now),
    sourceFileName: "",
    participants: [],
    createdAt: "",
    updatedAt: ""
  };
}

function parseDelimitedRows(text, delimiter) {
  const source = String(text ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === delimiter) {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      if (row.some((cell) => normalizedText(cell))) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  row.push(value.replace(/\r$/, ""));
  if (row.some((cell) => normalizedText(cell))) rows.push(row);
  return rows;
}

function headerScore(row = []) {
  const headers = new Set(row.map((cell) => normalizedText(cell).toLocaleLowerCase("en-US")));
  return REQUIRED_CSV_HEADERS.filter((header) => headers.has(header)).length;
}

function parseCsvTable(text) {
  const candidates = [",", ";", "\t"].map((delimiter) => {
    const rows = parseDelimitedRows(text, delimiter);
    return { delimiter, rows, score: headerScore(rows[0]) };
  });
  return candidates.sort((left, right) => right.score - left.score || right.rows[0]?.length - left.rows[0]?.length)[0];
}

function csvHeaderIndexes(headerRow) {
  const indexes = {};
  headerRow.forEach((header, index) => {
    const key = normalizedText(header).toLocaleLowerCase("en-US");
    if (
      [...REQUIRED_CSV_HEADERS, ...OPTIONAL_CSV_HEADERS].includes(key) &&
      indexes[key] === undefined
    ) {
      indexes[key] = index;
    }
  });
  return indexes;
}

function markDuplicateEmails(participants) {
  const counts = new Map();
  participants.forEach((participant) => {
    const email = normalizedSearch(participant.email);
    if (!email) return;
    counts.set(email, (counts.get(email) || 0) + 1);
  });
  return participants.map((participant) => ({
    ...participant,
    duplicateEmail: (counts.get(normalizedSearch(participant.email)) || 0) > 1
  }));
}

export function parseWagtailAttendanceCsv(text, fileName = "") {
  const parsed = parseCsvTable(text);
  if (!parsed.rows.length || parsed.score < REQUIRED_CSV_HEADERS.length) {
    const found = new Set((parsed.rows[0] || []).map((header) => normalizedText(header).toLocaleLowerCase("en-US")));
    const missing = REQUIRED_CSV_HEADERS.filter((header) => !found.has(header));
    throw new Error(
      missing.length
        ? `V datoteki manjkajo stolpci: ${missing.join(", ")}.`
        : "CSV datoteke ni bilo mogoče prebrati."
    );
  }

  const indexes = csvHeaderIndexes(parsed.rows[0]);
  const groups = new Map();
  parsed.rows.slice(1).forEach((row) => {
    const programName = normalizedText(row[indexes.event]);
    const eventDate = normalizedText(row[indexes.start_day]).slice(0, 10);
    const eventTime = normalizedText(row[indexes.start_time]).slice(0, 5);
    const firstName = normalizedText(row[indexes.name]);
    const lastName = normalizedText(row[indexes.surname]);
    const email = normalizedText(row[indexes.email]);
    const photoConsent =
      indexes.allow_photos === undefined
        ? null
        : normalizePhotoConsent(row[indexes.allow_photos]);
    if (![programName, eventDate, eventTime, firstName, lastName, email].some(Boolean)) return;

    const key = [normalizedSearch(programName), eventDate, eventTime].join("|");
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        programName,
        eventDate,
        eventTime,
        sourceFileName: normalizedText(fileName),
        participants: []
      });
    }
    groups.get(key).participants.push(
      createAttendanceParticipant({ firstName, lastName, email, photoConsent })
    );
  });

  const result = [...groups.values()].map((group) => ({
    ...group,
    participants: markDuplicateEmails(group.participants)
  }));
  if (!result.length) throw new Error("CSV datoteka ne vsebuje udeležencev.");
  return result;
}

export function attendanceSheetFromImportGroup(group, defaults = {}) {
  return {
    ...createBlankAttendanceSheet(defaults.lastSheet, defaults.profile),
    programName: normalizedText(group.programName),
    categoryId: group.categoryId || defaults.categoryId || DEFAULT_ATTENDANCE_CATEGORIES[0].id,
    mentorName: normalizedText(group.mentorName || defaults.mentorName),
    labName: normalizedText(group.labName || defaults.labName),
    location: normalizedText(group.location || defaults.location || DEFAULTS.city),
    eventDate: normalizedText(group.eventDate),
    eventTime: normalizedText(group.eventTime),
    sourceFileName: normalizedText(group.sourceFileName),
    participants: (group.participants || []).map(createAttendanceParticipant)
  };
}

export function attendanceSheetWithSaveMetadata(sheet) {
  const now = new Date().toISOString();
  return {
    ...sheet,
    id: sheet.id || generateId("attendance-sheet"),
    programName: normalizedText(sheet.programName),
    categoryId: normalizedText(sheet.categoryId),
    mentorName: normalizedText(sheet.mentorName),
    labName: normalizedText(sheet.labName),
    location: normalizedText(sheet.location),
    eventDate: normalizedText(sheet.eventDate),
    eventTime: normalizedText(sheet.eventTime).slice(0, 5),
    sourceFileName: normalizedText(sheet.sourceFileName),
    participants: markDuplicateEmails((sheet.participants || []).map(createAttendanceParticipant)),
    createdAt: sheet.createdAt || now,
    updatedAt: now
  };
}

export function validateAttendanceSheet(sheet) {
  const fields = {};
  [
    "programName",
    "categoryId",
    "mentorName",
    "labName",
    "location",
    "eventDate",
    "eventTime"
  ].forEach((field) => {
    if (!requiredText(sheet?.[field])) fields[field] = "To polje je obvezno.";
  });

  const participants = Array.isArray(sheet?.participants) ? sheet.participants : [];
  if (!participants.length) fields.participants = "Dodajte vsaj enega udeleženca.";
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  participants.forEach((participant, index) => {
    const id = participant.id || index;
    const prefix = `participants.${id}`;
    if (!requiredText(participant.firstName)) fields[`${prefix}.firstName`] = "To polje je obvezno.";
    if (!requiredText(participant.lastName)) fields[`${prefix}.lastName`] = "To polje je obvezno.";
    if (!requiredText(participant.email)) {
      fields[`${prefix}.email`] = "To polje je obvezno.";
    } else if (!emailPattern.test(normalizedText(participant.email))) {
      fields[`${prefix}.email`] = "Vnesite veljaven e-poštni naslov.";
    }
    if (participant.photoConsent === null || participant.photoConsent === undefined) {
      fields[`${prefix}.photoConsent`] = "Izberite kljukico ali križec.";
    }
  });

  const firstInvalidField = Object.keys(fields)[0] || "";
  return {
    valid: !firstInvalidField,
    message: firstInvalidField ? "Pred nadaljevanjem izpolnite vsa obvezna polja." : "",
    fields,
    firstInvalidField
  };
}

function similarityScore(candidate, query) {
  const value = normalizedSearch(candidate);
  const needle = normalizedSearch(query);
  if (!needle) return 1;
  if (value === needle) return 100;
  if (value.startsWith(needle)) return 80 - Math.min(20, value.length - needle.length);
  const index = value.indexOf(needle);
  if (index >= 0) return 55 - Math.min(25, index);
  const queryParts = needle.split(" ").filter(Boolean);
  const candidateParts = value.split(" ").filter(Boolean);
  const matches = queryParts.filter((part) => candidateParts.some((word) => word.startsWith(part))).length;
  return matches ? 20 + matches * 5 : 0;
}

export function attendanceSuggestions(sheets, field, currentValue = "") {
  const values = [];
  const seen = new Set();
  [...(sheets || [])]
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")))
    .forEach((sheet) => {
      const value = normalizedText(sheet?.[field]);
      const key = normalizedSearch(value);
      if (!value || seen.has(key)) return;
      seen.add(key);
      values.push(value);
    });

  return values
    .map((value, index) => ({ value, index, score: similarityScore(value, currentValue) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 3)
    .map((item) => item.value);
}

export function searchAttendance(sheets, query) {
  const needle = normalizedSearch(query);
  if (!needle) return [];
  return (sheets || [])
    .flatMap((sheet) =>
      (sheet.participants || []).map((participant) => ({
        sheetId: sheet.id,
        participantId: participant.id,
        firstName: participant.firstName,
        lastName: participant.lastName,
        email: participant.email,
        attended: Boolean(participant.attended),
        programName: sheet.programName,
        categoryId: sheet.categoryId,
        eventDate: sheet.eventDate,
        location: sheet.location
      }))
    )
    .filter((record) =>
      normalizedSearch(`${record.firstName} ${record.lastName} ${record.email}`).includes(needle)
    )
    .sort((left, right) => String(right.eventDate || "").localeCompare(String(left.eventDate || "")));
}

export function attendanceStatistics(sheets, categories = []) {
  const categoryLabels = new Map(categories.map((category) => [category.id, category.label]));
  const byCategory = new Map();
  const byProgram = new Map();

  (sheets || []).forEach((sheet) => {
    const confirmed = (sheet.participants || []).filter((participant) => participant.attended).length;
    if (!confirmed) return;

    const categoryLabel = categoryLabels.get(sheet.categoryId) || "Brez kategorije";
    byCategory.set(categoryLabel, (byCategory.get(categoryLabel) || 0) + confirmed);
    byProgram.set(sheet.programName || "Brez naziva", (byProgram.get(sheet.programName || "Brez naziva") || 0) + confirmed);
  });

  const sortCounts = (map) =>
    [...map.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "sl-SI"));

  return {
    totalConfirmed: [...byProgram.values()].reduce((sum, count) => sum + count, 0),
    byCategory: sortCounts(byCategory),
    byProgram: sortCounts(byProgram)
  };
}
