export const DEFAULTS = {
  city: "Ljubljana",
  directorName: "Renata Zamida",
  directorRole: "direktorica",
  labCode: "KOV",
  jobTitle: "Vodja kovinarskega laba"
};

export function generateId(prefix = "doc") {
  const random = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}_${Date.now().toString(36)}_${Array.from(random, (value) => value.toString(36)).join("")}`;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function yearFromDate(dateValue) {
  const date = dateValue ? new Date(`${dateValue}T12:00:00`) : new Date();
  return date.getFullYear();
}

export function formatSlovenianDate(dateValue) {
  const date = dateValue ? new Date(`${dateValue}T12:00:00`) : new Date();
  return `${date.getDate()}. ${date.getMonth() + 1}. ${date.getFullYear()}`;
}

export function parseMoneyToCents(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);
  const normalized = String(value || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function parseLocalizedNumber(raw) {
  let value = String(raw || "").replace(/\s/g, "");
  if (!value) return Number.NaN;

  if (value.includes(",")) {
    value = value.replace(/\./g, "").replace(",", ".");
  } else if (value.includes(".")) {
    const parts = value.split(".");
    const looksLikeThousands = parts.length > 1 && parts.slice(1).every((part) => part.length === 3);
    if (looksLikeThousands) {
      value = parts.join("");
    }
  }

  return Number.parseFloat(value);
}

function tokenizeMathExpression(expression) {
  const source = String(expression || "").replace(/×/g, "x");
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/[+\-*/()xX]/.test(char)) {
      tokens.push({ type: char.toLowerCase() === "x" ? "*" : char });
      index += 1;
      continue;
    }

    if (/\d/.test(char)) {
      let raw = "";
      while (index < source.length && /[\d.,]/.test(source[index])) {
        raw += source[index];
        index += 1;
      }
      while (index < source.length && /\s/.test(source[index])) index += 1;
      const percent = source[index] === "%";
      if (percent) index += 1;

      const value = parseLocalizedNumber(raw);
      if (!Number.isFinite(value)) return [];
      tokens.push({ type: "number", value, percent });
      continue;
    }

    return [];
  }

  return tokens;
}

function evaluateMathTokens(tokens) {
  let index = 0;

  function peek() {
    return tokens[index];
  }

  function consume(type) {
    if (peek()?.type !== type) return false;
    index += 1;
    return true;
  }

  function normalizeForMath(value) {
    return value.percent ? { value: value.value / 100, percent: false } : value;
  }

  function parseFactor() {
    if (consume("+")) return parseFactor();
    if (consume("-")) {
      const value = parseFactor();
      return { value: -value.value, percent: value.percent };
    }

    if (consume("(")) {
      const value = parseExpression();
      if (!consume(")")) throw new Error("Missing closing parenthesis");
      return { value: value.value, percent: false };
    }

    const token = peek();
    if (token?.type === "number") {
      index += 1;
      return { value: token.value, percent: token.percent };
    }

    throw new Error("Expected number");
  }

  function parseTerm() {
    let current = parseFactor();
    let percentOnly = current.percent;

    while (peek()?.type === "*" || peek()?.type === "/") {
      const operator = peek().type;
      index += 1;
      const right = normalizeForMath(parseFactor());
      const left = normalizeForMath(current);

      if (operator === "*") {
        current = { value: left.value * right.value, percent: false };
      } else {
        if (right.value === 0) throw new Error("Division by zero");
        current = { value: left.value / right.value, percent: false };
      }
      percentOnly = false;
    }

    return { value: current.value, percent: percentOnly };
  }

  function parseExpression() {
    let current = parseTerm();

    while (peek()?.type === "+" || peek()?.type === "-") {
      const operator = peek().type;
      index += 1;
      const right = parseTerm();

      if (right.percent) {
        const delta = current.value * (right.value / 100);
        current = { value: operator === "+" ? current.value + delta : current.value - delta, percent: false };
      } else {
        current = { value: operator === "+" ? current.value + right.value : current.value - right.value, percent: false };
      }
    }

    return current;
  }

  const result = parseExpression();
  if (index !== tokens.length) throw new Error("Unexpected token");
  return result.value;
}

export function evaluateEuroExpression(expression) {
  const cleaned = String(expression || "")
    .trim()
    .replace(/^[•\-–]\s+(?=\d)/, "")
    .replace(/\s+(?:€|eur\b)\s*$/i, "");
  if (!/\d/.test(cleaned)) return null;

  try {
    const tokens = tokenizeMathExpression(cleaned);
    if (!tokens.length) return null;
    const value = evaluateMathTokens(tokens);
    return Number.isFinite(value) ? Math.round(value * 100) : null;
  } catch {
    return null;
  }
}

function expressionPattern() {
  const number = String.raw`\d+(?:[.\s]\d{3})*(?:,\d+)?|\d+(?:\.\d+)?`;
  const atom = String.raw`(?:${number}\s*%?|\([^()]+\)\s*%?)`;
  return String.raw`[+-]?\s*${atom}(?:\s*(?:[+\-*/xX×])\s*${atom})*`;
}

function extractTrailingEuroExpression(text) {
  const pattern = expressionPattern();
  const match = String(text || "").match(new RegExp(String.raw`(?:^|[^\p{L}\d])(${pattern})\s*$`, "u"));
  return match?.[1]?.trim() || "";
}

function extractLeadingEuroExpression(text) {
  const pattern = expressionPattern();
  const match = String(text || "").match(new RegExp(String.raw`^\s*(${pattern})`, "u"));
  return match?.[1]?.trim() || "";
}

function hasCalculatorOperator(text) {
  const source = String(text || "")
    .replace(/^[\s•\-–]+/, "")
    .replace(/\s*(?:€|eur\b)\s*/gi, " ");
  return (
    /\d\s*(?:[+*/xX×])\s*\d/.test(source) ||
    /\d\s*-\s*\d/.test(source) ||
    /\d\s*[+-]\s*\d+(?:[.,]\d+)?\s*%/.test(source) ||
    /\([^)]*\d[^)]*(?:[+\-*/xX×])[^)]*\d[^)]*\)/.test(source)
  );
}

function extractLineCalculatorExpression(line) {
  const source = String(line || "")
    .replace(/\s*(?:€|eur\b)\s*/gi, " ")
    .replace(/^[\s•\-–]+/, "");
  const firstDigit = source.search(/\d/);
  if (firstDigit < 0) return "";

  const openBeforeDigit = source.lastIndexOf("(", firstDigit);
  const start = openBeforeDigit >= 0 && !/[^\s+\-*/xX×(]/.test(source.slice(openBeforeDigit, firstDigit)) ? openBeforeDigit : firstDigit;
  const expression = source.slice(start).match(/^[\s\d.,+\-*/xX×%()]+/)?.[0]?.trim() || "";
  return expression;
}

function extractMarkerEuroAmounts(text) {
  const source = String(text || "");
  const amounts = [];

  for (const match of source.matchAll(/€|eur\b/gi)) {
    const marker = match[0].toLowerCase();
    const expression =
      marker === "€"
        ? extractLeadingEuroExpression(source.slice(match.index + match[0].length)) ||
          extractTrailingEuroExpression(source.slice(0, match.index))
        : extractTrailingEuroExpression(source.slice(0, match.index));
    const cents = evaluateEuroExpression(expression);
    if (cents && cents > 0) amounts.push(cents);
  }

  return amounts;
}

export function extractEuroAmounts(text) {
  return String(text || "")
    .split(/\n+/)
    .flatMap((line) => {
      if (hasCalculatorOperator(line)) {
        const cents = evaluateEuroExpression(extractLineCalculatorExpression(line));
        return cents && cents > 0 ? [cents] : extractMarkerEuroAmounts(line);
      }

      return extractMarkerEuroAmounts(line);
    });
}

export function extractEuroTotalCents(text) {
  return extractEuroAmounts(text).reduce((sum, cents) => sum + cents, 0);
}

export function centsToInputValue(cents) {
  if (!cents) return "";
  return (cents / 100).toLocaleString("sl-SI", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function formatCurrency(cents) {
  return (cents / 100).toLocaleString("sl-SI", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2
  });
}

export function normalizeLabCode(value) {
  return String(value || DEFAULTS.labCode)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9ČŠŽ]/g, "")
    .slice(0, 8) || DEFAULTS.labCode;
}

export function deriveLabCodeFromName(value) {
  const source = String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

  const knownCodes = [
    { pattern: /kovin|metal/, code: "KOV" },
    { pattern: /les|mizar/, code: "LES" },
    { pattern: /nakit|zlat|srebr/, code: "NAK" },
    { pattern: /tekstil|siv|sitotisk|tisk/, code: "TEK" },
    { pattern: /keramik|glin/, code: "KER" },
    { pattern: /stekl/, code: "STE" },
    { pattern: /digital|fablab|3d|cnc/, code: "DIG" }
  ];

  const known = knownCodes.find((item) => item.pattern.test(source));
  if (known) return known.code;

  const stopWords = new Set(["lab", "laboratorij", "oddelek", "za", "in", "center", "rog", "projekt", "projekti"]);
  const word = source
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .find((part) => part.length >= 3 && !stopWords.has(part));

  return normalizeLabCode((word || source).slice(0, 3));
}

export function nextSerial(labCode, year, proposals, currentId) {
  const code = normalizeLabCode(labCode);
  const prefix = `${code}-${year}-`;
  const max = proposals.reduce((highest, proposal) => {
    if (proposal.id === currentId || !proposal.serial?.startsWith(prefix)) return highest;
    const number = Number.parseInt(proposal.serial.slice(prefix.length), 10);
    return Number.isFinite(number) ? Math.max(highest, number) : highest;
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export function createBlankProposal(lastProposal) {
  const issueDate = todayIso();
  return {
    id: "",
    serial: "",
    year: yearFromDate(issueDate),
    issueDate,
    labCode: lastProposal?.labCode || DEFAULTS.labCode,
    fullName: lastProposal?.fullName || "",
    jobTitle: lastProposal?.jobTitle || DEFAULTS.jobTitle,
    purpose: lastProposal?.purpose || "",
    explanation: "",
    company: "",
    estimatedValueCents: 0,
    city: DEFAULTS.city,
    directorName: DEFAULTS.directorName,
    directorRole: DEFAULTS.directorRole,
    offerAttachmentId: "",
    createdAt: "",
    updatedAt: ""
  };
}

function isFilledText(value) {
  return String(value ?? "").trim().length > 0;
}

export function validateProposalRequiredFields(proposal) {
  const fields = {};
  const requiredFields = [
    ["fullName", isFilledText(proposal?.fullName)],
    ["jobTitle", isFilledText(proposal?.jobTitle)],
    ["purpose", isFilledText(proposal?.purpose)],
    ["explanation", isFilledText(proposal?.explanation)],
    ["company", isFilledText(proposal?.company)],
    ["issueDate", isFilledText(proposal?.issueDate)],
    ["labCode", isFilledText(proposal?.labCode)],
    ["estimatedValueCents", Number.isFinite(Number(proposal?.estimatedValueCents)) && Number(proposal?.estimatedValueCents) > 0]
  ];

  let firstInvalidField = "";
  requiredFields.forEach(([field, isValid]) => {
    if (isValid) return;
    fields[field] = "To polje je obvezno.";
    if (!firstInvalidField) firstInvalidField = field;
  });

  const valid = Object.keys(fields).length === 0;
  return {
    valid,
    message: valid ? "" : "Pred nadaljevanjem izpolnite vsa obvezna polja.",
    fields,
    firstInvalidField
  };
}

export function proposalWithSaveMetadata(proposal, proposals) {
  const now = new Date().toISOString();
  const id = proposal.id || generateId("proposal");
  const year = yearFromDate(proposal.issueDate);
  const labCode = normalizeLabCode(proposal.labCode);
  const serial = proposal.serial || nextSerial(labCode, year, proposals, id);
  return {
    ...proposal,
    id,
    year,
    labCode,
    serial,
    city: DEFAULTS.city,
    directorName: DEFAULTS.directorName,
    directorRole: DEFAULTS.directorRole,
    createdAt: proposal.createdAt || now,
    updatedAt: now
  };
}

export function spendingForYear(proposals, year) {
  return proposals
    .filter((proposal) => Number(proposal.year) === Number(year) && proposal.documentStatus !== "rejected")
    .reduce((sum, proposal) => sum + Number(proposal.estimatedValueCents || 0), 0);
}

export function spendingBreakdownForYear(proposals, year) {
  const groups = new Map();

  proposals
    .filter((proposal) => Number(proposal.year) === Number(year) && proposal.documentStatus !== "rejected")
    .forEach((proposal) => {
      const label = String(proposal.purpose || "").trim().replace(/\s+/g, " ") || "Brez vnesenega namena";
      const key = label.toLocaleLowerCase("sl-SI");
      const current = groups.get(key) || { label, cents: 0, count: 0 };
      current.cents += Number(proposal.estimatedValueCents || 0);
      current.count += 1;
      groups.set(key, current);
    });

  return [...groups.values()].sort((a, b) => b.cents - a.cents || a.label.localeCompare(b.label, "sl-SI"));
}

export function uniqueSuggestions(proposals, field, currentValue = "") {
  const lower = String(currentValue || "").trim().toLowerCase();
  const values = proposals
    .map((proposal) => String(proposal[field] || "").trim())
    .filter(Boolean)
    .filter((value, index, array) => array.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index);

  const filtered = lower ? values.filter((value) => value.toLowerCase().includes(lower)) : values;
  return filtered.slice(0, 6);
}

export function sortRecent(proposals) {
  return [...proposals].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(value) {
  return String(value || "predlog")
    .trim()
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}
