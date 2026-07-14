import { DEFAULTS, generateId, todayIso } from "./utils.js";

export const ATTENDANCE_CATEGORY_ASSET_ID = "attendance-categories";
export const ATTENDANCE_ROWS_PER_PAGE = 16;
export const ATTENDANCE_MIN_ROWS = 8;

export function attendanceVisibleRowCount(totalParticipants, participantsOnPage) {
  const total = Math.max(0, Number(totalParticipants) || 0);
  const onPage = Math.max(0, Number(participantsOnPage) || 0);
  return total <= ATTENDANCE_MIN_ROWS ? ATTENDANCE_MIN_ROWS : onPage;
}

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
const OPTIONAL_CSV_HEADERS = Object.freeze([
  "allow_photos",
  "no. children",
  "no. extra people"
]);

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
  const words = normalized.match(/[\p{L}\p{N}]+/gu) || [];
  if (["true", "yes", "da", "1"].includes(normalized) || words.includes("da")) return true;
  if (["false", "no", "ne", "0"].includes(normalized) || words.includes("ne")) return false;
  if (words.includes("strinjam") || words.includes("dovoljujem") || words.includes("soglasam")) {
    return true;
  }
  return null;
}

export function photoConsentLabel(value) {
  const normalized = normalizePhotoConsent(value);
  if (normalized === true) return "✓";
  if (normalized === false) return "✕";
  return "—";
}

export function createAttendanceParticipant(values = {}) {
  const participantType = ["child", "extra"].includes(values.participantType)
    ? values.participantType
    : "primary";
  return {
    id: values.id || generateId("participant"),
    firstName: normalizedText(values.firstName),
    lastName: normalizedText(values.lastName),
    email: normalizedText(values.email).toLocaleLowerCase("sl-SI"),
    contactName: normalizedText(values.contactName),
    participantType,
    photoConsent: normalizePhotoConsent(values.photoConsent),
    attended: Boolean(values.attended),
    duplicateEmail: Boolean(values.duplicateEmail)
  };
}

export function attendanceParticipantEmailDisplay(participant) {
  const email = normalizedText(participant?.email);
  const contactName = normalizedText(participant?.contactName);
  if (contactName && email) return `${contactName} - ${email}`;
  return email || contactName;
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

function isChildRegistrationRow(row, indexes) {
  const emailCell = normalizedSearch(row[indexes.email]);
  return emailCell.includes("child") || emailCell.includes("otrok");
}

function isExtraRegistrationRow(row, indexes) {
  const emailCell = normalizedSearch(row[indexes.email]);
  return emailCell.includes("extra person") || emailCell.includes("dodatna oseba");
}

function photoConsentFromQuestion(row = []) {
  for (const cell of row) {
    const text = normalizedText(cell);
    const normalized = normalizedSearch(text);
    if (!normalized.includes("fotograf") && !normalized.includes("snemanj")) continue;
    const answer = text.includes("->") ? text.split("->").pop() : text;
    const consent = normalizePhotoConsent(answer);
    if (consent !== null) return consent;
  }
  return null;
}

function photoConsentFromRow(row, indexes) {
  const questionConsent = photoConsentFromQuestion(row);
  if (questionConsent !== null) return questionConsent;
  return indexes.allow_photos === undefined
    ? null
    : normalizePhotoConsent(row[indexes.allow_photos]);
}

function positiveRegistrationCount(row, indexes, field) {
  if (indexes[field] === undefined) return false;
  const value = normalizedText(row[indexes[field]]).replace(",", ".");
  return Number(value) > 0;
}

function rowDeclaresDependants(row, indexes) {
  return (
    positiveRegistrationCount(row, indexes, "no. children") ||
    positiveRegistrationCount(row, indexes, "no. extra people")
  );
}

export function isRelatedAttendanceParticipant(participant) {
  return ["child", "extra"].includes(participant?.participantType);
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
  const group = {
    key: "current-event",
    programName: "",
    eventDate: "",
    eventTime: "",
    sourceFileName: normalizedText(fileName),
    participants: []
  };
  let currentRegistration = null;

  parsed.rows.slice(1).forEach((row) => {
    const programName = normalizedText(row[indexes.event]);
    const eventDate = normalizedText(row[indexes.start_day]).slice(0, 10);
    const eventTime = normalizedText(row[indexes.start_time]).slice(0, 5);
    const firstName = normalizedText(row[indexes.name]);
    const lastName = normalizedText(row[indexes.surname]);
    const email = normalizedText(row[indexes.email]);
    const photoConsent = photoConsentFromRow(row, indexes);
    const childRow = isChildRegistrationRow(row, indexes);
    const extraRow = isExtraRegistrationRow(row, indexes);
    const dependantType = childRow ? "child" : extraRow ? "extra" : "";
    const registeredDependants = rowDeclaresDependants(row, indexes);
    const contactName = normalizedText(`${firstName} ${lastName}`);

    if (dependantType && currentRegistration) {
      if (![firstName, lastName, currentRegistration.email].some(Boolean)) return;
      // Wagtail occasionally repeats the reservation holder as an "extra person".
      // That row is a placeholder, not another attendee.
      if (normalizedSearch(contactName) === normalizedSearch(currentRegistration.contactName)) return;
      group.participants.push(
        createAttendanceParticipant({
          firstName,
          lastName,
          email: currentRegistration.email,
          contactName: currentRegistration.contactName,
          photoConsent: currentRegistration.photoConsent,
          participantType: dependantType
        })
      );
      return;
    }

    if (![programName, eventDate, eventTime, firstName, lastName, email].some(Boolean)) return;

    if (!group.programName && programName) group.programName = programName;
    if (!group.eventDate && eventDate) group.eventDate = eventDate;
    if (!group.eventTime && eventTime) group.eventTime = eventTime;

    if (email || programName || eventDate || eventTime) {
      currentRegistration = {
        email,
        contactName,
        photoConsent,
        programName,
        eventDate,
        eventTime
      };
    }

    if (registeredDependants || (!firstName && !lastName)) return;

    group.participants.push(
      createAttendanceParticipant({ firstName, lastName, email, photoConsent, participantType: "primary" })
    );
  });

  group.participants = markDuplicateEmails(group.participants);
  if (!group.participants.length) throw new Error("CSV datoteka ne vsebuje udeležencev.");
  return [group];
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
    if (!isRelatedAttendanceParticipant(participant)) {
      if (!requiredText(participant.email)) {
        fields[`${prefix}.email`] = "To polje je obvezno.";
      } else if (!emailPattern.test(normalizedText(participant.email))) {
        fields[`${prefix}.email`] = "Vnesite veljaven e-poštni naslov.";
      }
      if (participant.photoConsent === null || participant.photoConsent === undefined) {
        fields[`${prefix}.photoConsent`] = "Izberite kljukico ali križec.";
      }
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
        contactName: participant.contactName,
        attended: Boolean(participant.attended),
        programName: sheet.programName,
        categoryId: sheet.categoryId,
        eventDate: sheet.eventDate,
        location: sheet.location
      }))
    )
    .filter((record) =>
      normalizedSearch(`${record.firstName} ${record.lastName} ${record.contactName} ${record.email}`).includes(needle)
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
