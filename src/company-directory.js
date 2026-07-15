const HEADER_ALIASES = Object.freeze({
  name: ["ime_podjetja", "ime podjetja", "podjetje", "naziv podjetja", "company", "company name"],
  address: ["naslov", "naslov podjetja", "address", "company address"],
  taxNumber: ["davcna_stevilka", "davcna številka", "davčna številka", "davcna st", "davčna st", "tax number", "vat number", "vat"]
});

export const COMPANY_DIRECTORY_CSV_FILE_NAME = "predloga-podjetja-center-rog.csv";
export const COMPANY_DIRECTORY_CSV_TEMPLATE = "\uFEFFime_podjetja,naslov,davcna_stevilka\n";

export function companyDocumentLines(proposal = {}) {
  return [
    cleanText(proposal.company),
    cleanText(proposal.companyAddress),
    cleanText(proposal.companyTaxNumber) ? `Davčna št.: ${cleanText(proposal.companyTaxNumber)}` : ""
  ].filter(Boolean);
}

export function companyDocumentText(proposal = {}) {
  return companyDocumentLines(proposal).join(", ");
}

export function companyLookupKey(value) {
  return cleanText(value)
    .toLocaleLowerCase("sl-SI")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function enrichProposalCompanyDetails(proposal = {}, companies = []) {
  const key = companyLookupKey(proposal.company);
  if (!key) return { ...proposal };

  const company = companies.find((item) => companyLookupKey(item?.name) === key);
  if (!company) return { ...proposal };

  return {
    ...proposal,
    company: cleanText(company.name) || cleanText(proposal.company),
    companyAddress: cleanText(proposal.companyAddress) || cleanText(company.address),
    companyTaxNumber: cleanText(proposal.companyTaxNumber) || cleanText(company.taxNumber)
  };
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeHeader(value) {
  return cleanText(value)
    .toLocaleLowerCase("sl-SI")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function normalizedAliases(aliases) {
  return aliases.map(normalizeHeader);
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
      if (row.some((cell) => cleanText(cell))) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  row.push(value.replace(/\r$/, ""));
  if (row.some((cell) => cleanText(cell))) rows.push(row);
  return rows;
}

function recognizedHeaderCount(row = []) {
  const values = row.map(normalizeHeader);
  return Object.values(HEADER_ALIASES).filter((aliases) =>
    normalizedAliases(aliases).some((alias) => values.includes(alias))
  ).length;
}

function parseCsvTable(text) {
  return [",", ";", "\t"]
    .map((delimiter) => {
      const rows = parseDelimitedRows(text, delimiter);
      return { rows, score: recognizedHeaderCount(rows[0]) };
    })
    .sort((left, right) => right.score - left.score || (right.rows[0]?.length || 0) - (left.rows[0]?.length || 0))[0];
}

function headerIndex(headerRow, aliases) {
  const normalized = headerRow.map(normalizeHeader);
  return normalizedAliases(aliases)
    .map((alias) => normalized.indexOf(alias))
    .find((index) => index >= 0);
}

export function parseCompanyDirectoryCsv(text) {
  const { rows = [] } = parseCsvTable(text) || {};
  if (!rows.length) throw new Error("Datoteka CSV je prazna.");

  const [header, ...dataRows] = rows;
  const indexes = {
    name: headerIndex(header, HEADER_ALIASES.name),
    address: headerIndex(header, HEADER_ALIASES.address),
    taxNumber: headerIndex(header, HEADER_ALIASES.taxNumber)
  };

  const missing = [];
  if (indexes.name === undefined) missing.push("ime_podjetja");
  if (indexes.address === undefined) missing.push("naslov");
  if (missing.length) {
    throw new Error(`CSV ne vsebuje obveznih stolpcev: ${missing.join(", ")}. Uporabi preneseno predlogo.`);
  }

  const companies = [];
  const skippedRows = [];
  const seen = new Set();
  dataRows.forEach((row, rowIndex) => {
    const name = cleanText(row[indexes.name]);
    const address = cleanText(row[indexes.address]);
    const taxNumber = indexes.taxNumber === undefined ? "" : cleanText(row[indexes.taxNumber]);
    if (!name && !address && !taxNumber) return;
    if (!name || !address) {
      skippedRows.push({ row: rowIndex + 2, reason: "Manjka ime podjetja ali naslov." });
      return;
    }

    const key = name.toLocaleLowerCase("sl-SI");
    if (seen.has(key)) {
      skippedRows.push({ row: rowIndex + 2, reason: "Podjetje je v CSV-ju podvojeno." });
      return;
    }
    seen.add(key);
    companies.push({ name, address, taxNumber });
  });

  if (!companies.length) {
    throw new Error("CSV ne vsebuje veljavnih podjetij. Ime podjetja in naslov sta obvezna.");
  }

  return { companies, skippedRows };
}
