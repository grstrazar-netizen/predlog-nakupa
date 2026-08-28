import { enrichProposalCompanyDetails } from "./company-directory.js";

const STATUS_LABELS = Object.freeze({
  "": "Brez statusa",
  submitted: "Oddano",
  approved: "Potrjeno",
  rejected: "Zavrnjeno"
});

export const PROPOSAL_REGISTER_COLUMNS = Object.freeze([
  { key: "serial", label: "Interna evidenca", width: 19 },
  { key: "issueDate", label: "Datum izdaje", width: 14, format: "dd.mm.yyyy" },
  { key: "status", label: "Status", width: 14 },
  { key: "fullName", label: "Predlagatelj", width: 22 },
  { key: "jobTitle", label: "Delovno mesto", width: 28 },
  { key: "purpose", label: "Namen / lab", width: 28 },
  { key: "company", label: "Podjetje", width: 26 },
  { key: "companyAddress", label: "Naslov podjetja", width: 34 },
  { key: "companyTaxNumber", label: "Davčna številka", width: 18 },
  { key: "explanation", label: "Opis / obrazložitev", width: 58 },
  { key: "estimatedValueEur", label: "Vrednost brez DDV (EUR)", width: 22, format: "#,##0.00 \"EUR\"" },
  { key: "accountingNumber", label: "Računovodska št.", width: 21 },
  { key: "hasAttachment", label: "Pripeta ponudba", width: 18 },
  { key: "createdAt", label: "Ustvarjeno", width: 19, format: "dd.mm.yyyy hh:mm" },
  { key: "updatedAt", label: "Nazadnje spremenjeno", width: 22, format: "dd.mm.yyyy hh:mm" }
]);

function cleanText(value) {
  return String(value ?? "").trim();
}

function dateFromIsoDay(value) {
  const match = cleanText(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
}

function dateFromTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date;
}

function compareProposals(left, right) {
  const byDate = cleanText(right.issueDate).localeCompare(cleanText(left.issueDate));
  if (byDate) return byDate;
  return cleanText(right.serial).localeCompare(cleanText(left.serial), "sl-SI", { numeric: true });
}

export function proposalRegisterRows(proposals = [], companies = []) {
  return [...proposals]
    .sort(compareProposals)
    .map((proposal) => enrichProposalCompanyDetails(proposal, companies))
    .map((proposal) => ({
      serial: cleanText(proposal.serial) || "Brez številke",
      issueDate: dateFromIsoDay(proposal.issueDate),
      status: STATUS_LABELS[proposal.documentStatus || ""] || cleanText(proposal.documentStatus),
      fullName: cleanText(proposal.fullName),
      jobTitle: cleanText(proposal.jobTitle),
      purpose: cleanText(proposal.purpose),
      company: cleanText(proposal.company),
      companyAddress: cleanText(proposal.companyAddress),
      companyTaxNumber: cleanText(proposal.companyTaxNumber),
      explanation: cleanText(proposal.explanation),
      estimatedValueEur: Number(proposal.estimatedValueCents || 0) / 100,
      accountingNumber: cleanText(proposal.accountingNumber),
      hasAttachment: proposal.offerAttachmentId ? "Da" : "Ne",
      createdAt: dateFromTimestamp(proposal.createdAt),
      updatedAt: dateFromTimestamp(proposal.updatedAt)
    }));
}

export function createProposalRegisterWorkbook(proposals = [], companies = [], xlsx = globalThis.window?.XLSX) {
  if (!xlsx?.utils?.aoa_to_sheet || !xlsx?.utils?.book_new) {
    throw new Error("Knjižnica za pripravo Excel datotek ni naložena.");
  }

  const rows = proposalRegisterRows(proposals, companies);
  if (!rows.length) throw new Error("Ni shranjenih predlogov za izvoz.");

  const values = [
    PROPOSAL_REGISTER_COLUMNS.map((column) => column.label),
    ...rows.map((row) => PROPOSAL_REGISTER_COLUMNS.map((column) => row[column.key]))
  ];
  const worksheet = xlsx.utils.aoa_to_sheet(values, { cellDates: true });
  const lastRow = rows.length + 1;

  worksheet["!cols"] = PROPOSAL_REGISTER_COLUMNS.map((column) => ({ width: column.width }));
  worksheet["!autofilter"] = { ref: `A1:O${lastRow}` };
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };

  PROPOSAL_REGISTER_COLUMNS.forEach((column, columnIndex) => {
    if (!column.format) return;
    for (let rowIndex = 2; rowIndex <= lastRow; rowIndex += 1) {
      const cell = worksheet[xlsx.utils.encode_cell({ r: rowIndex - 1, c: columnIndex })];
      if (cell && cell.v !== "") cell.z = column.format;
    }
  });

  const workbook = xlsx.utils.book_new();
  workbook.Props = {
    Title: "Register predlogov nakupa",
    Subject: "Evidenca izdanih predlogov nakupa Center Rog",
    Author: "Center Rog evidence",
    CreatedDate: new Date()
  };
  xlsx.utils.book_append_sheet(workbook, worksheet, "Predlogi nakupa");
  return { workbook, rowCount: rows.length };
}

export function proposalRegisterFileName(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `register-predlogov-center-rog-${year}-${month}-${day}.xlsx`;
}
