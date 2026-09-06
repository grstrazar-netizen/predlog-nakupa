import {
  DEFAULTS,
  generateId,
  normalizeSignaturePlacement,
  normalizeLabCode,
  parseMoneyToCents,
  yearFromDate
} from "./utils.js";

export const MATERIAL_ISSUE_STATUSES = Object.freeze([
  { value: "draft", label: "Osnutek" },
  { value: "printed", label: "Natisnjeno" },
  { value: "paid", label: "Plačano" },
  { value: "collected", label: "Material prevzet" }
]);

export const MATERIAL_UNITS = Object.freeze([
  "kos",
  "m",
  "m²",
  "m³",
  "kg",
  "g",
  "l",
  "ml",
  "paket",
  "komplet"
]);

function localDateIso(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTimeValue(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function createBlankMaterialRow() {
  return {
    id: generateId("material"),
    name: "",
    unit: "kos",
    quantity: "",
    tariffCents: 0
  };
}

function labNameFromProposal(proposal) {
  const namesByCode = {
    KOV: "Kovinarski lab",
    LES: "Lesarski lab",
    NAK: "Lab za nakit",
    TEK: "Lab za tekstil",
    KER: "Keramičarski lab",
    STE: "Steklarski lab",
    DIG: "Digitalni lab"
  };
  const knownName = namesByCode[normalizeLabCode(proposal?.labCode)];
  if (knownName) return knownName;

  const purpose = String(proposal?.purpose || "").trim();
  if (purpose) {
    return purpose.replace(/^za potrebe\s+/i, "").replace(/\.$/, "");
  }

  const jobTitle = String(proposal?.jobTitle || "").trim();
  const match = jobTitle.match(/vodja\s+(.+?)(?:ega|ega\s+laba|laba)?$/i);
  return match?.[1] ? match[1] : "Kovinarski lab";
}

export function createBlankMaterialIssue(lastIssue, lastProposal) {
  const now = new Date();
  const issueDate = localDateIso(now);
  return {
    id: "",
    serial: "",
    year: yearFromDate(issueDate),
    issueDate,
    issueTime: localTimeValue(now),
    city: DEFAULTS.city,
    labCode: lastIssue?.labCode || lastProposal?.labCode || DEFAULTS.labCode,
    labName: lastIssue?.labName || labNameFromProposal(lastProposal),
    issuerName: lastIssue?.issuerName || lastProposal?.fullName || "",
    issuerRole: lastIssue?.issuerRole || lastProposal?.jobTitle || DEFAULTS.jobTitle,
    buyerName: "",
    note: "",
    status: "draft",
    signaturePlacement: normalizeSignaturePlacement(),
    items: [createBlankMaterialRow()],
    createdAt: "",
    updatedAt: ""
  };
}

export function parseQuantity(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : 0;
}

export function materialRowAmountCents(row) {
  return Math.round(parseQuantity(row?.quantity) * Number(row?.tariffCents || 0));
}

export function materialIssueTotalCents(issue) {
  return (issue?.items || []).reduce((sum, row) => sum + materialRowAmountCents(row), 0);
}

export function materialNameSuggestions(issues = [], currentValue = "", limit = 6) {
  const query = String(currentValue || "").trim().toLocaleLowerCase("sl-SI");
  const seen = new Set();
  const suggestions = [];

  for (const issue of issues) {
    for (const row of issue?.items || []) {
      const value = String(row?.name || "").trim().replace(/\s+/g, " ");
      const key = value.toLocaleLowerCase("sl-SI");
      if (!value || seen.has(key)) continue;
      seen.add(key);
      if (query && !key.includes(query)) continue;
      suggestions.push(value);
      if (suggestions.length >= limit) return suggestions;
    }
  }

  return suggestions;
}

export function nextMaterialIssueSerial(labCode, year, issues, currentId) {
  const prefix = `IZD-${normalizeLabCode(labCode)}-${year}-`;
  const max = (issues || []).reduce((highest, issue) => {
    if (issue.id === currentId || !issue.serial?.startsWith(prefix)) return highest;
    const number = Number.parseInt(issue.serial.slice(prefix.length), 10);
    return Number.isFinite(number) ? Math.max(highest, number) : highest;
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export function materialIssueWithSaveMetadata(issue, issues) {
  const now = new Date().toISOString();
  const id = issue.id || generateId("material-issue");
  const year = yearFromDate(issue.issueDate);
  const labCode = normalizeLabCode(issue.labCode);
  return {
    ...issue,
    id,
    year,
    labCode,
    serial: issue.serial || nextMaterialIssueSerial(labCode, year, issues, id),
    city: DEFAULTS.city,
    signaturePlacement: normalizeSignaturePlacement(issue.signaturePlacement),
    items: (issue.items || []).map((row) => ({
      ...row,
      id: row.id || generateId("material"),
      name: String(row.name || "").trim(),
      unit: String(row.unit || "").trim(),
      quantity: String(row.quantity ?? "").trim(),
      tariffCents: Number(row.tariffCents || 0)
    })),
    createdAt: issue.createdAt || now,
    updatedAt: now
  };
}

function requiredText(value) {
  return String(value ?? "").trim().length > 0;
}

export function validateMaterialIssue(issue) {
  const fields = {};
  const requiredFields = [
    ["issuerName", requiredText(issue?.issuerName)],
    ["issuerRole", requiredText(issue?.issuerRole)],
    ["labName", requiredText(issue?.labName)],
    ["labCode", requiredText(issue?.labCode)],
    ["buyerName", requiredText(issue?.buyerName)],
    ["issueDate", requiredText(issue?.issueDate)],
    ["issueTime", requiredText(issue?.issueTime)],
    ["city", requiredText(issue?.city)]
  ];

  requiredFields.forEach(([field, valid]) => {
    if (!valid) fields[field] = "To polje je obvezno.";
  });

  const items = Array.isArray(issue?.items) ? issue.items : [];
  if (!items.length) {
    fields.items = "Dodajte vsaj eno vrstico materiala.";
  }

  items.forEach((row, index) => {
    const prefix = `items.${row.id || index}`;
    if (!requiredText(row?.name)) fields[`${prefix}.name`] = "To polje je obvezno.";
    if (!requiredText(row?.unit)) fields[`${prefix}.unit`] = "To polje je obvezno.";
    if (parseQuantity(row?.quantity) <= 0) fields[`${prefix}.quantity`] = "Vnesite količino, večjo od 0.";
    if (Number(row?.tariffCents || 0) <= 0) fields[`${prefix}.tariffCents`] = "Vnesite tarifo, večjo od 0.";
  });

  const firstInvalidField = Object.keys(fields)[0] || "";
  return {
    valid: !firstInvalidField,
    message: firstInvalidField ? "Pred tiskanjem izpolnite vsa obvezna polja." : "",
    fields,
    firstInvalidField
  };
}

export function normalizeMaterialTariff(value) {
  return parseMoneyToCents(value);
}
