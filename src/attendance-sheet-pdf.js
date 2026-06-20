import { DOCUMENT_FONT_FILES } from "./document-layout.js";
import {
  attendanceVisibleRowCount,
  ATTENDANCE_ROWS_PER_PAGE,
  normalizePhotoConsent
} from "./attendance-sheet.js";
import { formatSlovenianDate } from "./utils.js";

const PAGE = Object.freeze({
  width: 841.89,
  height: 595.28,
  margin: 34
});
let fontBytesPromise;
let logoBytesPromise;

async function loadBinaryAsset(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Datoteke ${url} ni bilo mogoče naložiti.`);
  return new Uint8Array(await response.arrayBuffer());
}

async function loadFontBytes() {
  if (!fontBytesPromise) {
    fontBytesPromise = Promise.all(
      Object.entries(DOCUMENT_FONT_FILES).map(async ([name, url]) => [name, await loadBinaryAsset(url)])
    ).then((entries) => Object.fromEntries(entries));
  }
  return fontBytesPromise;
}

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Slike ${src} ni bilo mogoče naložiti.`));
    image.src = src;
  });
}

async function loadLogoBytes() {
  if (!logoBytesPromise) {
    logoBytesPromise = loadImage("/assets/center-rog-logo.svg").then(async (image) => {
      const canvas = document.createElement("canvas");
      canvas.width = 408;
      canvas.height = 380;
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Logotipa ni bilo mogoče pripraviti za dokument PDF.");
      return new Uint8Array(await blob.arrayBuffer());
    });
  }
  return logoBytesPromise;
}

async function embedFonts(pdf) {
  if (!window.fontkit) throw new Error("Knjižnica za slovenske pisave PDF ni naložena.");
  pdf.registerFontkit(window.fontkit);
  const bytes = await loadFontBytes();
  const [regular, semibold, bold, italic] = await Promise.all([
    pdf.embedFont(bytes.regular, { subset: true }),
    pdf.embedFont(bytes.semibold, { subset: true }),
    pdf.embedFont(bytes.bold, { subset: true }),
    pdf.embedFont(bytes.italic, { subset: true })
  ]);
  return { regular, semibold, bold, italic };
}

function yFromTop(top, height = 0) {
  return PAGE.height - top - height;
}

function drawText(page, text, x, top, options) {
  page.drawText(String(text ?? ""), {
    x,
    y: yFromTop(top, options.size),
    size: options.size,
    font: options.font,
    color: options.color
  });
}

function drawTextRight(page, text, right, top, options) {
  const value = String(text ?? "");
  drawText(page, value, right - options.font.widthOfTextAtSize(value, options.size), top, options);
}

function drawLine(page, x1, x2, top, color, thickness = 0.6) {
  page.drawLine({
    start: { x: x1, y: yFromTop(top) },
    end: { x: x2, y: yFromTop(top) },
    color,
    thickness
  });
}

function drawVerticalLine(page, x, top, bottom, color, thickness = 0.6) {
  page.drawLine({
    start: { x, y: yFromTop(top) },
    end: { x, y: yFromTop(bottom) },
    color,
    thickness
  });
}

function drawPhotoConsentMark(page, value, centerX, centerTop, colors) {
  const consent = normalizePhotoConsent(value);
  const centerY = yFromTop(centerTop);
  if (consent === true) {
    page.drawLine({
      start: { x: centerX - 5, y: centerY },
      end: { x: centerX - 1.5, y: centerY - 4 },
      color: colors.black,
      thickness: 1.1
    });
    page.drawLine({
      start: { x: centerX - 1.5, y: centerY - 4 },
      end: { x: centerX + 6, y: centerY + 5 },
      color: colors.black,
      thickness: 1.1
    });
    return;
  }

  if (consent === false) {
    page.drawLine({
      start: { x: centerX - 5, y: centerY - 5 },
      end: { x: centerX + 5, y: centerY + 5 },
      color: colors.black,
      thickness: 1
    });
    page.drawLine({
      start: { x: centerX - 5, y: centerY + 5 },
      end: { x: centerX + 5, y: centerY - 5 },
      color: colors.black,
      thickness: 1
    });
    return;
  }

  page.drawLine({
    start: { x: centerX - 5, y: centerY },
    end: { x: centerX + 5, y: centerY },
    color: colors.muted,
    thickness: 0.8
  });
}

function ellipsize(text, font, size, maxWidth) {
  const value = String(text || "");
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
  let result = value;
  while (result && font.widthOfTextAtSize(`${result}…`, size) > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

function categoryLabel(sheet, categories) {
  return categories.find((category) => category.id === sheet.categoryId)?.label || sheet.categoryId || "";
}

function drawMetaItem(page, label, value, x, top, width, fonts, colors) {
  drawText(page, label.toLocaleUpperCase("sl-SI"), x, top, {
    font: fonts.semibold,
    size: 7.2,
    color: colors.muted
  });
  drawText(page, ellipsize(value, fonts.semibold, 9.2, width), x, top + 10, {
    font: fonts.semibold,
    size: 9.2,
    color: colors.black
  });
}

function drawHeader(page, pdf, logo, sheet, categories, pageNumber, pageCount, fonts, colors) {
  const right = PAGE.width - PAGE.margin;
  page.drawImage(logo, {
    x: PAGE.margin,
    y: yFromTop(30, 56),
    width: 60,
    height: 56
  });
  drawText(page, "PODPISNI LIST UDELEŽENCEV", 274, 31, {
    font: fonts.bold,
    size: 17.5,
    color: colors.black
  });
  drawTextRight(page, `${pageNumber}/${pageCount}`, right, 35, {
    font: fonts.regular,
    size: 8.5,
    color: colors.muted
  });
  drawLine(page, PAGE.margin, right, 92, colors.black, 1.1);

  drawMetaItem(page, "Naziv programa", sheet.programName, PAGE.margin, 108, 360, fonts, colors);
  drawMetaItem(page, "Kategorija", categoryLabel(sheet, categories), 430, 108, 145, fonts, colors);
  drawMetaItem(page, "Datum in ura", `${formatSlovenianDate(sheet.eventDate)} ob ${sheet.eventTime}`, 620, 108, 180, fonts, colors);

  drawMetaItem(page, "Odgovorni mentor", sheet.mentorName, PAGE.margin, 143, 220, fonts, colors);
  drawMetaItem(page, "Lab", sheet.labName, 285, 143, 180, fonts, colors);
  drawMetaItem(page, "Lokacija", sheet.location, 520, 143, 280, fonts, colors);
}

function drawParticipantTable(page, participants, offset, totalParticipants, fonts, colors) {
  const right = PAGE.width - PAGE.margin;
  const tableTop = 184;
  const headerHeight = 24;
  const rowHeight = 19;
  const columns = [
    { key: "index", label: "Št.", width: 34, align: "center" },
    { key: "firstName", label: "Ime", width: 120 },
    { key: "lastName", label: "Priimek", width: 135 },
    { key: "email", label: "E-pošta", width: 215 },
    { key: "signature", label: "Podpis", width: 190 },
    {
      key: "photoConsent",
      label: "Slikanje",
      width: right - PAGE.margin - 694,
      align: "center"
    }
  ];
  const visibleRowCount = attendanceVisibleRowCount(
    totalParticipants,
    participants.length
  );
  const tableBottom = tableTop + headerHeight + visibleRowCount * rowHeight;

  page.drawRectangle({
    x: PAGE.margin,
    y: yFromTop(tableTop, headerHeight),
    width: right - PAGE.margin,
    height: headerHeight,
    color: colors.light
  });
  drawLine(page, PAGE.margin, right, tableTop, colors.black, 0.9);
  drawLine(page, PAGE.margin, right, tableTop + headerHeight, colors.black, 0.75);

  let x = PAGE.margin;
  columns.forEach((column) => {
    drawVerticalLine(page, x, tableTop, tableBottom, colors.grid, 0.55);
    const textWidth = fonts.semibold.widthOfTextAtSize(column.label, 8.2);
    const textX =
      column.align === "center"
        ? x + (column.width - textWidth) / 2
        : x + 7;
    drawText(page, column.label, textX, tableTop + 8, {
      font: fonts.semibold,
      size: 8.2,
      color: colors.black
    });
    x += column.width;
  });
  drawVerticalLine(page, right, tableTop, tableBottom, colors.grid, 0.55);

  for (let index = 0; index < visibleRowCount; index += 1) {
    const rowTop = tableTop + headerHeight + index * rowHeight;
    drawLine(page, PAGE.margin, right, rowTop + rowHeight, colors.grid, 0.45);
    const participant = participants[index];
    if (!participant) continue;

    const values = [
      String(offset + index + 1),
      participant.firstName,
      participant.lastName,
      participant.email,
      "",
      participant.photoConsent
    ];
    let cellX = PAGE.margin;
    values.forEach((value, columnIndex) => {
      const column = columns[columnIndex];
      if (column.key === "photoConsent") {
        drawPhotoConsentMark(
          page,
          value,
          cellX + column.width / 2,
          rowTop + rowHeight / 2,
          colors
        );
        cellX += column.width;
        return;
      }
      const visibleValue = ellipsize(value, fonts.regular, 9, column.width - 14);
      const textWidth = fonts.regular.widthOfTextAtSize(visibleValue, 9);
      const textX =
        column.align === "center"
          ? cellX + (column.width - textWidth) / 2
          : cellX + 7;
      drawText(page, visibleValue, textX, rowTop + 5.5, {
        font: fonts.regular,
        size: 9,
        color: colors.black
      });
      cellX += column.width;
    });
  }

  drawLine(page, PAGE.margin, right, tableBottom, colors.black, 0.9);
  return tableBottom;
}

export async function createAttendanceSheetPdfBlob(sheet, categories = []) {
  if (!window.PDFLib) throw new Error("Knjižnica za PDF ni naložena.");
  const { PDFDocument, rgb } = window.PDFLib;
  const pdf = await PDFDocument.create();
  const fonts = await embedFonts(pdf);
  const logo = await pdf.embedPng(await loadLogoBytes());
  const colors = {
    black: rgb(0.05, 0.05, 0.06),
    muted: rgb(0.36, 0.36, 0.4),
    grid: rgb(0.64, 0.64, 0.68),
    light: rgb(0.965, 0.965, 0.97)
  };
  const participants = sheet.participants || [];
  const pageCount = Math.max(1, Math.ceil(participants.length / ATTENDANCE_ROWS_PER_PAGE));

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = pdf.addPage([PAGE.width, PAGE.height]);
    drawHeader(page, pdf, logo, sheet, categories, pageIndex + 1, pageCount, fonts, colors);
    const offset = pageIndex * ATTENDANCE_ROWS_PER_PAGE;
    const tableBottom = drawParticipantTable(
      page,
      participants.slice(offset, offset + ATTENDANCE_ROWS_PER_PAGE),
      offset,
      participants.length,
      fonts,
      colors
    );
    drawText(
      page,
      "S podpisom potrjujem udeležbo na programu in resničnost navedenih podatkov.",
      PAGE.margin,
      tableBottom + 14,
      { font: fonts.italic, size: 8.2, color: colors.muted }
    );
    drawTextRight(page, "Center Rog, Trubarjeva cesta 72, 1000 Ljubljana", PAGE.width - PAGE.margin, tableBottom + 14, {
      font: fonts.regular,
      size: 8.2,
      color: colors.muted
    });
  }

  const bytes = await pdf.save();
  return new Blob([bytes], { type: "application/pdf" });
}
