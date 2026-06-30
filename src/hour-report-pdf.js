import { DOCUMENT_FONT_FILES } from "./document-layout.js";
import {
  formatHours,
  hourReportBreakdown,
  hourReportMonthLabel,
  hourReportTotals,
  hourRowAmountCents
} from "./hour-report.js";

const PAGE = Object.freeze({
  width: 595.28,
  height: 841.89,
  margin: 34
});

const TABLE_COLUMNS = Object.freeze([
  { key: "date", label: "Datum", width: 52 },
  { key: "startTime", label: "Začetek", width: 40, align: "center" },
  { key: "endTime", label: "Konec", width: 40, align: "center" },
  { key: "workType", label: "Tip dela", width: 73 },
  { key: "shiftDescription", label: "Opis izmene", width: 126 },
  { key: "hours", label: "Ur", width: 42, align: "right" },
  { key: "rate", label: "Postavka", width: 59, align: "right" },
  { key: "amount", label: "Znesek", width: 67, align: "right" }
]);

let fontBytesPromise;

async function loadBinaryAsset(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Datoteke ${url} ni bilo mogoče naložiti.`);
  return new Uint8Array(await response.arrayBuffer());
}

async function loadFontBytes() {
  if (!fontBytesPromise) {
    fontBytesPromise = Promise.all(
      Object.entries(DOCUMENT_FONT_FILES).map(async ([name, url]) => [
        name,
        await loadBinaryAsset(url)
      ])
    ).then((entries) => Object.fromEntries(entries));
  }
  return fontBytesPromise;
}

async function embedFonts(pdf) {
  if (!window.fontkit) throw new Error("Knjižnica za slovenske pisave PDF ni naložena.");
  pdf.registerFontkit(window.fontkit);
  const bytes = await loadFontBytes();
  const [regular, semibold, bold] = await Promise.all([
    pdf.embedFont(bytes.regular, { subset: true }),
    pdf.embedFont(bytes.semibold, { subset: true }),
    pdf.embedFont(bytes.bold, { subset: true })
  ]);
  return { regular, semibold, bold };
}

function yFromTop(top, height = 0) {
  return PAGE.height - top - height;
}

function drawText(page, text, x, top, { font, size, color }) {
  page.drawText(String(text ?? ""), {
    x,
    y: yFromTop(top, size),
    font,
    size,
    color
  });
}

function drawRight(page, text, right, top, options) {
  const value = String(text ?? "");
  drawText(page, value, right - options.font.widthOfTextAtSize(value, options.size), top, options);
}

function drawLine(page, x1, x2, top, color, thickness = 0.6) {
  page.drawLine({
    start: { x: x1, y: yFromTop(top) },
    end: { x: x2, y: yFromTop(top) },
    thickness,
    color
  });
}

async function embedSignature(pdf, signatureAsset) {
  if (!signatureAsset?.blob) return null;
  const bytes = new Uint8Array(await signatureAsset.blob.arrayBuffer());
  const mimeType = String(signatureAsset.mimeType || signatureAsset.blob.type || "").toLowerCase();
  const fileName = String(signatureAsset.fileName || "").toLowerCase();
  if (mimeType === "image/jpeg" || mimeType === "image/jpg" || /\.jpe?g$/.test(fileName)) {
    return pdf.embedJpg(bytes);
  }
  return pdf.embedPng(bytes);
}

function placedSignatureBox(box, placement) {
  if (!placement?.inserted) return null;
  const widthPercent = Math.min(100, Math.max(25, Number(placement.width) || 90));
  const xPercent = Math.min(100 - widthPercent, Math.max(0, Number(placement.x) || 0));
  const yPercent = Math.min(70, Math.max(0, Number(placement.y) || 0));
  return {
    x: box.x + box.width * (xPercent / 100),
    top: box.top + box.height * (yPercent / 100),
    width: box.width * (widthPercent / 100),
    height: box.height * ((100 - yPercent) / 100)
  };
}

function drawContainedImage(page, image, box) {
  if (!image) return;
  const scale = Math.min(box.width / image.width, box.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, {
    x: box.x + (box.width - width) / 2,
    y: yFromTop(box.top, height),
    width,
    height
  });
}

function drawVerticalLine(page, x, top, bottom, color, thickness = 0.5) {
  page.drawLine({
    start: { x, y: yFromTop(top) },
    end: { x, y: yFromTop(bottom) },
    thickness,
    color
  });
}

function formatCurrency(cents) {
  return (Number(cents || 0) / 100).toLocaleString("sl-SI", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2
  });
}

function formatDate(dateIso) {
  const [year, month, day] = String(dateIso).split("-");
  return year && month && day ? `${day}. ${month}. ${year}` : dateIso;
}

function wrapText(text, font, size, maxWidth, maxLines = 2) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      return;
    }
    lines.push(current);
    current = word;
  });
  if (current) lines.push(current);
  if (!lines.length) return [""];
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  let last = visible[maxLines - 1];
  while (last && font.widthOfTextAtSize(`${last}…`, size) > maxWidth) {
    last = last.slice(0, -1);
  }
  visible[maxLines - 1] = `${last}…`;
  return visible;
}

function drawHeader(page, report, fonts, colors, continuation = false) {
  const right = PAGE.width - PAGE.margin;
  drawText(page, "CENTER ROG", PAGE.margin, 30, {
    font: fonts.semibold,
    size: 9,
    color: colors.muted
  });
  drawText(page, "POROČILO O OPRAVLJENIH URAH", 137, 29, {
    font: fonts.bold,
    size: 17,
    color: colors.black
  });
  drawLine(page, PAGE.margin, right, 58, colors.black, 1.1);
  drawText(page, `Mentor/mentorica: ${report.personName}`, PAGE.margin, 76, {
    font: fonts.semibold,
    size: 10,
    color: colors.black
  });
  drawText(page, `Obdobje: ${hourReportMonthLabel(report)}`, PAGE.margin, 92, {
    font: fonts.regular,
    size: 10,
    color: colors.black
  });
  if (continuation) {
    drawRight(page, "nadaljevanje", right, 92, {
      font: fonts.regular,
      size: 8,
      color: colors.muted
    });
  }
}

function drawTableHeader(page, top, fonts, colors) {
  const right = PAGE.width - PAGE.margin;
  const height = 27;
  page.drawRectangle({
    x: PAGE.margin,
    y: yFromTop(top, height),
    width: right - PAGE.margin,
    height,
    color: colors.light
  });
  drawLine(page, PAGE.margin, right, top, colors.grid, 0.75);
  drawLine(page, PAGE.margin, right, top + height, colors.grid, 0.75);
  let x = PAGE.margin;
  TABLE_COLUMNS.forEach((column) => {
    drawVerticalLine(page, x, top, top + height, colors.grid);
    const size = 6.6;
    const width = fonts.semibold.widthOfTextAtSize(column.label, size);
    const textX =
      column.align === "right"
        ? x + column.width - width - 5
        : column.align === "center"
          ? x + (column.width - width) / 2
          : x + 5;
    drawText(page, column.label, textX, top + 9, {
      font: fonts.semibold,
      size,
      color: colors.black
    });
    x += column.width;
  });
  drawVerticalLine(page, right, top, top + height, colors.grid);
  return top + height;
}

function drawTableRow(page, row, top, fonts, colors) {
  const right = PAGE.width - PAGE.margin;
  const typeLines = wrapText(row.workType, fonts.regular, 6.7, 63, 2);
  const descriptionLines = wrapText(row.shiftDescription, fonts.regular, 6.7, 116, 2);
  const lineCount = Math.max(typeLines.length, descriptionLines.length);
  const height = Math.max(19, 7 + lineCount * 8);
  const values = {
    date: formatDate(row.date),
    startTime: row.startTime || "—",
    endTime: row.endTime || "—",
    hours: formatHours(row.hours).replace(" h", ""),
    rate: formatCurrency(row.rateCents),
    amount: formatCurrency(hourRowAmountCents(row))
  };

  let x = PAGE.margin;
  TABLE_COLUMNS.forEach((column) => {
    drawVerticalLine(page, x, top, top + height, colors.grid);
    const lines =
      column.key === "workType"
        ? typeLines
        : column.key === "shiftDescription"
          ? descriptionLines
          : [values[column.key] || ""];
    lines.forEach((line, lineIndex) => {
      const size = 6.7;
      const textWidth = fonts.regular.widthOfTextAtSize(line, size);
      const textX =
        column.align === "right"
          ? x + column.width - textWidth - 5
          : column.align === "center"
            ? x + (column.width - textWidth) / 2
            : x + 5;
      drawText(page, line, textX, top + 5 + lineIndex * 8, {
        font: fonts.regular,
        size,
        color: colors.black
      });
    });
    x += column.width;
  });
  drawVerticalLine(page, right, top, top + height, colors.grid);
  drawLine(page, PAGE.margin, right, top + height, colors.grid, 0.45);
  return top + height;
}

function drawSummary(page, report, top, fonts, colors) {
  const right = PAGE.width - PAGE.margin;
  const totals = hourReportTotals(report);
  const breakdown = hourReportBreakdown(report);
  drawLine(page, PAGE.margin, right, top, colors.black, 0.9);
  drawText(page, "SKUPAJ", PAGE.margin, top + 15, {
    font: fonts.bold,
    size: 11,
    color: colors.black
  });
  let cursor = top + 36;
  const totalRows = [
    ["Opravljene ure", formatHours(totals.workedHours)],
    ["Bonus ure", `${formatHours(totals.bonusHours)} · ${formatCurrency(totals.bonusHoursCents)}`],
    ["Fiksni bonus", formatCurrency(totals.fixedBonusCents)],
    ["Skupno ur", formatHours(totals.totalHours)],
    ["Skupni znesek za izplačilo", formatCurrency(totals.totalCents)]
  ];
  totalRows.forEach(([label, value], index) => {
    drawText(page, label, PAGE.margin, cursor, {
      font: index === totalRows.length - 1 ? fonts.semibold : fonts.regular,
      size: 9,
      color: colors.black
    });
    drawRight(page, value, right, cursor, {
      font: index === totalRows.length - 1 ? fonts.bold : fonts.semibold,
      size: 9,
      color: colors.black
    });
    cursor += 15;
  });

  cursor += 10;
  drawText(page, "RAZČLENITEV UR IN STROŠKOV", PAGE.margin, cursor, {
    font: fonts.bold,
    size: 10,
    color: colors.black
  });
  cursor += 18;
  breakdown.forEach((type) => {
    drawText(page, type.label, PAGE.margin, cursor, {
      font: fonts.semibold,
      size: 8.5,
      color: colors.black
    });
    drawRight(page, `${formatHours(type.hours)} · ${formatCurrency(type.cents)}`, right, cursor, {
      font: fonts.semibold,
      size: 8.5,
      color: colors.black
    });
    cursor += 14;
    type.descriptions.forEach((description) => {
      const label = `– ${description.label}`;
      drawText(page, label, PAGE.margin + 12, cursor, {
        font: fonts.regular,
        size: 8,
        color: colors.muted
      });
      drawRight(
        page,
        `${formatHours(description.hours)} · ${formatCurrency(description.cents)}`,
        right,
        cursor,
        { font: fonts.regular, size: 8, color: colors.muted }
      );
      cursor += 13;
    });
    cursor += 3;
  });
  return cursor;
}

function estimatedSummaryHeight(report) {
  const breakdown = hourReportBreakdown(report);
  const detailRows = breakdown.reduce(
    (sum, type) => sum + 1 + type.descriptions.length,
    0
  );
  return 145 + detailRows * 14;
}

async function drawSignature(pdf, page, report, top, fonts, colors, signatureAsset) {
  const right = PAGE.width - PAGE.margin;
  const left = right - 190;
  drawText(page, "Podpis vodje laboratorija", left, top, {
    font: fonts.semibold,
    size: 9,
    color: colors.black
  });
  const signatureBox = {
    x: left,
    top: top + 11,
    width: right - left,
    height: 44
  };
  const placedBox = placedSignatureBox(signatureBox, report.signaturePlacement);
  if (placedBox) {
    drawContainedImage(page, await embedSignature(pdf, signatureAsset), placedBox);
  }
  drawLine(page, left, right, top + 48, colors.black, 0.65);
}

async function appendReport(pdf, report, fonts, colors, signatureAsset) {
  let page = pdf.addPage([PAGE.width, PAGE.height]);
  drawHeader(page, report, fonts, colors);
  let top = drawTableHeader(page, 118, fonts, colors);
  const bottomLimit = PAGE.height - 52;
  const signatureSpace = 82;

  report.rows.forEach((row, index) => {
    const estimatedRowHeight = 25;
    const isLastRow = index === report.rows.length - 1;
    const summaryHeight = isLastRow
      ? estimatedSummaryHeight(report) + signatureSpace
      : 0;
    if (top + estimatedRowHeight + Math.min(summaryHeight, 210) > bottomLimit) {
      page = pdf.addPage([PAGE.width, PAGE.height]);
      drawHeader(page, report, fonts, colors, true);
      top = drawTableHeader(page, 118, fonts, colors);
    }
    top = drawTableRow(page, row, top, fonts, colors);
  });

  if (top + estimatedSummaryHeight(report) + signatureSpace > bottomLimit) {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    drawHeader(page, report, fonts, colors, true);
    top = 124;
  }
  const summaryBottom = drawSummary(page, report, top + 18, fonts, colors);
  const signatureTop = Math.max(summaryBottom + 34, PAGE.height - 106);
  await drawSignature(pdf, page, report, signatureTop, fonts, colors, signatureAsset);
}

async function createPdf(reports, signatureAsset = null) {
  if (!window.PDFLib) throw new Error("Knjižnica za PDF ni naložena.");
  const { PDFDocument, rgb } = window.PDFLib;
  const pdf = await PDFDocument.create();
  const fonts = await embedFonts(pdf);
  const colors = {
    black: rgb(0.04, 0.04, 0.05),
    muted: rgb(0.34, 0.34, 0.38),
    grid: rgb(0.58, 0.58, 0.62),
    light: rgb(0.9, 0.91, 0.91)
  };
  for (const report of reports) {
    await appendReport(pdf, report, fonts, colors, signatureAsset);
  }
  return pdf;
}

export async function createHourReportPdfBlob(report, signatureAsset = null) {
  const pdf = await createPdf([report], signatureAsset);
  return new Blob([await pdf.save()], { type: "application/pdf" });
}

export async function createHourReportsPdfBlob(reports, signatureAsset = null) {
  const pdf = await createPdf(reports, signatureAsset);
  return new Blob([await pdf.save()], { type: "application/pdf" });
}
