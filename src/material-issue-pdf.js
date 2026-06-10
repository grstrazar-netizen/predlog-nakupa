import { DOCUMENT_FONT_FILES } from "./document-layout.js";
import {
  MATERIAL_ISSUE_STATUSES,
  materialIssueTotalCents,
  materialRowAmountCents
} from "./material-issue.js";
import { formatCurrency, formatSlovenianDate } from "./utils.js";

let fontBytesPromise;
let logoBytesPromise;

const PAGE = Object.freeze({
  width: 841.89,
  height: 595.28,
  margin: 38
});

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
  const width = options.font.widthOfTextAtSize(value, options.size);
  drawText(page, value, right - width, top, options);
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

function ellipsize(text, font, size, maxWidth) {
  const value = String(text || "");
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
  let result = value;
  while (result && font.widthOfTextAtSize(`${result}…`, size) > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result}…`;
}

function quantityLabel(value) {
  const number = Number.parseFloat(String(value || "").replace(",", "."));
  if (!Number.isFinite(number)) return "";
  return number.toLocaleString("sl-SI", { maximumFractionDigits: 3 });
}

export async function createMaterialIssuePdfBlob(issue, signatureAsset = null) {
  if (!window.PDFLib) throw new Error("Knjižnica za PDF ni naložena.");

  const { PDFDocument, rgb } = window.PDFLib;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const fonts = await embedFonts(pdf);
  const black = rgb(0.05, 0.05, 0.06);
  const muted = rgb(0.34, 0.34, 0.38);
  const grid = rgb(0.62, 0.62, 0.66);
  const light = rgb(0.965, 0.965, 0.97);
  const right = PAGE.width - PAGE.margin;
  const contentWidth = right - PAGE.margin;

  const logo = await pdf.embedPng(await loadLogoBytes());
  page.drawImage(logo, {
    x: PAGE.margin,
    y: yFromTop(30, 58),
    width: 62,
    height: 58
  });

  drawText(page, "IZDAJNICA MATERIALA", 300, 42, {
    font: fonts.bold,
    size: 19,
    color: black
  });
  drawTextRight(page, issue.serial || "OSNUTEK", right, 45, {
    font: fonts.semibold,
    size: 10,
    color: muted
  });
  drawLine(page, PAGE.margin, right, 99, black, 1.2);

  const infoTop = 116;
  const infoLine = 24;
  const leftInfo = PAGE.margin;
  const middleInfo = 296;
  const rightInfo = 575;
  const label = { font: fonts.regular, size: 8.5, color: muted };
  const value = { font: fonts.semibold, size: 10.5, color: black };

  drawText(page, "Izdaja", leftInfo, infoTop, label);
  drawText(page, issue.issuerName, leftInfo, infoTop + 11, value);
  drawText(page, issue.issuerRole, leftInfo, infoTop + 25, { ...label, size: 9 });

  drawText(page, "Laboratorij", middleInfo, infoTop, label);
  drawText(page, issue.labName, middleInfo, infoTop + 11, value);

  drawText(page, "Datum in čas izdaje", rightInfo, infoTop, label);
  drawText(
    page,
    `${formatSlovenianDate(issue.issueDate)} ob ${issue.issueTime}`,
    rightInfo,
    infoTop + 11,
    value
  );
  drawText(page, issue.city, rightInfo, infoTop + 25, { ...label, size: 9 });

  drawText(page, "Uporabnik / kupec", leftInfo, infoTop + infoLine * 2, label);
  drawText(page, issue.buyerName, leftInfo, infoTop + infoLine * 2 + 11, value);

  const tableTop = 190;
  const headerHeight = 28;
  const rowHeight = 25;
  const visibleRows = 8;
  const columns = [
    { key: "index", label: "Št.", width: 32, align: "center" },
    { key: "name", label: "Naziv materiala", width: 330 },
    { key: "unit", label: "EM", width: 58, align: "center" },
    { key: "quantity", label: "Količina", width: 78, align: "right" },
    { key: "tariff", label: "Tarifa", width: 104, align: "right" },
    { key: "amount", label: "Znesek", width: contentWidth - 602, align: "right" }
  ];

  page.drawRectangle({
    x: PAGE.margin,
    y: yFromTop(tableTop, headerHeight),
    width: contentWidth,
    height: headerHeight,
    color: light
  });

  const tableBottom = tableTop + headerHeight + visibleRows * rowHeight;
  drawLine(page, PAGE.margin, right, tableTop, black, 1);
  drawLine(page, PAGE.margin, right, tableTop + headerHeight, black, 0.8);

  let x = PAGE.margin;
  columns.forEach((column) => {
    drawVerticalLine(page, x, tableTop, tableBottom, grid);
    const textWidth = fonts.semibold.widthOfTextAtSize(column.label, 8.5);
    const textX =
      column.align === "right"
        ? x + column.width - textWidth - 7
        : column.align === "center"
          ? x + (column.width - textWidth) / 2
          : x + 7;
    drawText(page, column.label, textX, tableTop + 9, {
      font: fonts.semibold,
      size: 8.5,
      color: black
    });
    x += column.width;
  });
  drawVerticalLine(page, right, tableTop, tableBottom, grid);

  for (let index = 0; index < visibleRows; index += 1) {
    const rowTop = tableTop + headerHeight + index * rowHeight;
    if (index % 2 === 1) {
      page.drawRectangle({
        x: PAGE.margin,
        y: yFromTop(rowTop, rowHeight),
        width: contentWidth,
        height: rowHeight,
        color: rgb(0.992, 0.992, 0.993)
      });
    }
    drawLine(page, PAGE.margin, right, rowTop + rowHeight, grid, 0.45);

    const row = issue.items?.[index];
    if (!row) continue;
    const values = [
      String(index + 1),
      ellipsize(row.name, fonts.regular, 9, columns[1].width - 14),
      row.unit,
      quantityLabel(row.quantity),
      formatCurrency(row.tariffCents),
      formatCurrency(materialRowAmountCents(row))
    ];

    let cellX = PAGE.margin;
    values.forEach((cellValue, columnIndex) => {
      const column = columns[columnIndex];
      const cellWidth = fonts.regular.widthOfTextAtSize(cellValue, 9);
      const textX =
        column.align === "right"
          ? cellX + column.width - cellWidth - 7
          : column.align === "center"
            ? cellX + (column.width - cellWidth) / 2
            : cellX + 7;
      drawText(page, cellValue, textX, rowTop + 8, {
        font: fonts.regular,
        size: 9,
        color: black
      });
      cellX += column.width;
    });
  }

  drawLine(page, PAGE.margin, right, tableBottom, black, 1);
  const totalTop = tableBottom + 13;
  drawTextRight(page, "Skupaj za plačilo", right - 120, totalTop, {
    font: fonts.semibold,
    size: 10,
    color: muted
  });
  drawTextRight(page, formatCurrency(materialIssueTotalCents(issue)), right, totalTop - 2, {
    font: fonts.bold,
    size: 14,
    color: black
  });

  const footerTop = 505;
  drawText(page, "Opomba", PAGE.margin, footerTop, label);
  drawText(
    page,
    ellipsize(issue.note || "", fonts.regular, 9, 385),
    PAGE.margin,
    footerTop + 13,
    { font: fonts.regular, size: 9, color: black }
  );
  drawLine(page, PAGE.margin, 430, footerTop + 37, grid);

  drawText(page, "Podpis osebe, ki izdaja dokument", 535, footerTop, label);
  drawLine(page, 535, right, footerTop + 37, black);
  const issueSignatureBox = placedSignatureBox({
    x: 535,
    top: footerTop - 7,
    width: right - 535,
    height: 43
  }, issue.signaturePlacement);
  if (issueSignatureBox) {
    drawContainedImage(page, await embedSignature(pdf, signatureAsset), issueSignatureBox);
  }

  drawText(page, "Plačilo na blagajni je potrebno pred prevzemom materiala.", PAGE.margin, 565, {
    font: fonts.italic,
    size: 8.5,
    color: muted
  });
  const statusLabel =
    MATERIAL_ISSUE_STATUSES.find((status) => status.value === issue.status)?.label || "Osnutek";
  drawTextRight(page, `Status: ${statusLabel}`, right, 565, {
    font: fonts.regular,
    size: 8.5,
    color: muted
  });

  const bytes = await pdf.save();
  return new Blob([bytes], { type: "application/pdf" });
}
