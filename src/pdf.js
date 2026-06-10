import {
  DOCUMENT_FONT_FILES,
  DOCUMENT_LAYOUT,
  createProposalLayout
} from "./document-layout.js";
import { DEFAULTS, formatSlovenianDate, yearFromDate } from "./utils.js";

let fontBytesPromise;
let logoPngBytesPromise;

function topToPdfY(topPt, heightPt = 0) {
  return DOCUMENT_LAYOUT.page.heightPt - topPt - heightPt;
}

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

async function imageToPngBytes(image, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Slike ni bilo mogoče pripraviti za dokument PDF.");
  return new Uint8Array(await blob.arrayBuffer());
}

async function loadLogoPngBytes() {
  if (!logoPngBytesPromise) {
    logoPngBytesPromise = loadImage("/assets/center-rog-logo.svg").then((image) =>
      imageToPngBytes(image, 408, 380)
    );
  }
  return logoPngBytesPromise;
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
    y: topToPdfY(box.top, height),
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

function inferAttachmentKind(attachment) {
  const mimeType = String(attachment?.blob?.type || attachment?.mimeType || "").toLowerCase();
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";

  const fileName = String(attachment?.fileName || "").toLowerCase();
  if (fileName.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpe?g|webp|gif|bmp|tiff?|avif)$/i.test(fileName)) return "image";
  return "";
}

async function imageBlobToPngBytes(blob) {
  const sourceUrl = URL.createObjectURL(blob);
  try {
    const image = await loadImage(sourceUrl);
    return await imageToPngBytes(
      image,
      image.naturalWidth || image.width,
      image.naturalHeight || image.height
    );
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function appendImageAttachmentPage(pdf, attachment) {
  const mimeType = String(attachment?.blob?.type || attachment?.mimeType || "").toLowerCase();
  const bytes = new Uint8Array(await attachment.blob.arrayBuffer());
  let image;

  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    image = await pdf.embedJpg(bytes);
  } else if (mimeType === "image/png") {
    image = await pdf.embedPng(bytes);
  } else {
    image = await pdf.embedPng(await imageBlobToPngBytes(attachment.blob));
  }

  const { widthPt, heightPt } = DOCUMENT_LAYOUT.page;
  const page = pdf.addPage([widthPt, heightPt]);
  const margin = 28;
  const scale = Math.min(
    (widthPt - margin * 2) / image.width,
    (heightPt - margin * 2) / image.height,
    1
  );
  const width = image.width * scale;
  const height = image.height * scale;

  page.drawImage(image, {
    x: (widthPt - width) / 2,
    y: (heightPt - height) / 2,
    width,
    height
  });
}

function fontForStyle(fonts, style = {}) {
  if (style.weight === "bold") return fonts.bold;
  if (style.weight === "semibold") return fonts.semibold;
  if (style.weight === "italic") return fonts.italic;
  return fonts.regular;
}

function createPdfTextMeasurer(fonts) {
  return (text, style = {}) =>
    fontForStyle(fonts, style).widthOfTextAtSize(String(text || ""), style.size);
}

function drawTopText(page, text, leftPt, topPt, options) {
  const font = fontForStyle(options.fonts, options);
  page.drawText(String(text || ""), {
    x: leftPt,
    y: topToPdfY(topPt, options.size),
    size: options.size,
    font,
    color: options.color
  });
}

function drawTopTextRight(page, text, rightPt, topPt, options) {
  const font = fontForStyle(options.fonts, options);
  const width = font.widthOfTextAtSize(String(text || ""), options.size);
  drawTopText(page, text, rightPt - width, topPt, options);
}

function drawTopTextCentered(page, text, topPt, options) {
  const font = fontForStyle(options.fonts, options);
  const width = font.widthOfTextAtSize(String(text || ""), options.size);
  drawTopText(page, text, (DOCUMENT_LAYOUT.page.widthPt - width) / 2, topPt, options);
}

function drawTextLines(page, lines, leftPt, topPt, options) {
  lines.forEach((line, index) => {
    drawTopText(page, line, leftPt, topPt + index * options.lineHeight, options);
  });
}

function drawTopLine(page, leftPt, rightPt, topPt, options = {}) {
  page.drawLine({
    start: { x: leftPt, y: topToPdfY(topPt) },
    end: { x: rightPt, y: topToPdfY(topPt) },
    thickness: options.thickness || 0.75,
    color: options.color,
    dashArray: options.dashArray
  });
}

async function embedDocumentFonts(pdf) {
  if (!window.fontkit) {
    throw new Error("Knjižnica za slovenske pisave PDF ni naložena.");
  }

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

async function drawProposalPage(pdf, proposal, signatureAsset) {
  const { rgb } = window.PDFLib;
  const { page: pageSize, content, fonts: fontSizes, positions } = DOCUMENT_LAYOUT;
  const page = pdf.addPage([pageSize.widthPt, pageSize.heightPt]);
  const fonts = await embedDocumentFonts(pdf);
  const measureText = createPdfTextMeasurer(fonts);
  const layout = createProposalLayout(proposal, measureText);

  if (!layout.fits) {
    throw new Error("Dokument je predolg za eno stran A4. Skrajšajte označena polja.");
  }

  const black = rgb(0.067, 0.067, 0.067);
  const muted = rgb(0.32, 0.32, 0.36);
  const border = rgb(0.83, 0.83, 0.85);
  const body = { fonts, size: fontSizes.bodyPt, color: black };
  const semibold = { ...body, weight: "semibold" };
  const bold = { ...body, weight: "bold" };

  const logo = await pdf.embedPng(await loadLogoPngBytes());
  page.drawImage(logo, {
    x: content.leftPt,
    y: topToPdfY(positions.logoTopPt, positions.logoHeightPt),
    width: positions.logoWidthPt,
    height: positions.logoHeightPt
  });

  drawTopTextCentered(page, "PREDLOG NAKUPA DROBNEGA MATERIALA", positions.titleTopPt, {
    fonts,
    size: fontSizes.titlePt,
    weight: "bold",
    color: black
  });

  drawTopText(page, "Ime in priimek:", content.leftPt, positions.nameTopPt, body);
  drawTextLines(
    page,
    layout.lines.fullName,
    layout.text.nameValueLeftPt,
    positions.nameTopPt,
    { ...semibold, lineHeight: fontSizes.lineHeightPt }
  );

  drawTopText(page, "Zaposlen/a na delovnem mestu:", content.leftPt, positions.jobTopPt, body);
  drawTextLines(
    page,
    layout.lines.jobTitle,
    layout.text.jobValueLeftPt,
    positions.jobTopPt,
    { ...semibold, lineHeight: fontSizes.lineHeightPt }
  );

  drawTopText(
    page,
    "Predlagam nakup naslednjega drobnega materiala za potrebe:",
    content.leftPt,
    positions.purposeLabelTopPt,
    body
  );
  drawTextLines(page, layout.lines.purpose, content.leftPt, positions.purposeTopPt, {
    ...semibold,
    lineHeight: fontSizes.lineHeightPt
  });

  drawTopText(page, "Opis / obrazložitev potrebe:", content.leftPt, positions.explanationLabelTopPt, bold);
  page.drawRectangle({
    x: content.leftPt,
    y: topToPdfY(positions.explanationBoxTopPt, positions.explanationBoxHeightPt),
    width: content.widthPt,
    height: positions.explanationBoxHeightPt,
    color: rgb(0.984, 0.984, 0.984),
    borderColor: border,
    borderWidth: 0.75
  });
  drawTextLines(
    page,
    layout.lines.explanation,
    layout.text.explanationTextLeftPt,
    layout.text.explanationTextTopPt,
    { ...body, color: muted, lineHeight: fontSizes.lineHeightPt }
  );

  drawTopText(page, "Podjetje:", content.leftPt, positions.companyTopPt, body);
  drawTextLines(
    page,
    layout.lines.company,
    layout.text.companyValueLeftPt,
    positions.companyTopPt,
    { ...body, lineHeight: fontSizes.lineHeightPt }
  );

  const valueLabel = "V okvirni skupni vrednosti: cca";
  const value = (proposal.estimatedValueCents / 100).toLocaleString("sl-SI", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const valueLabelWidth = fonts.regular.widthOfTextAtSize(valueLabel, fontSizes.bodyPt);
  const valueRight = content.leftPt + valueLabelWidth + 76;
  drawTopText(page, valueLabel, content.leftPt, positions.valueTopPt, body);
  drawTopTextRight(page, value, valueRight, positions.valueTopPt, bold);
  drawTopText(page, "brez DDV", valueRight + 8, positions.valueTopPt, body);

  const right = content.leftPt + content.widthPt;
  drawTopLine(page, content.leftPt, right, positions.footerLineTopPt, {
    color: border
  });
  drawTopText(page, DEFAULTS.city, content.leftPt, positions.issueTopPt, body);
  drawTopText(page, formatSlovenianDate(proposal.issueDate), content.leftPt + 126, positions.issueTopPt, body);
  drawTopText(page, "Podpis vodje laba", right - 202, positions.issueTopPt, {
    fonts,
    size: fontSizes.smallPt,
    weight: "semibold",
    color: black
  });
  drawTopLine(page, right - 91, right, positions.issueTopPt + 18, {
    color: muted
  });
  const proposalSignatureBox = placedSignatureBox({
    x: right - 91,
    top: positions.issueTopPt - 13,
    width: 91,
    height: 30
  }, proposal.signaturePlacement);
  if (proposalSignatureBox) {
    drawContainedImage(page, await embedSignature(pdf, signatureAsset), proposalSignatureBox);
  }

  drawTopText(
    page,
    `Št.: ${yearFromDate(proposal.issueDate)}- ____`,
    content.leftPt,
    positions.accountingTopPt,
    bold
  );
  drawTopLine(page, content.leftPt, right, positions.approvalLineTopPt, {
    color: black,
    thickness: 1.1
  });

  drawTopText(page, "SOGLAŠAM", content.leftPt, positions.approvalTopPt + 4, bold);
  page.drawRectangle({
    x: content.leftPt + 69,
    y: topToPdfY(positions.approvalTopPt, 23),
    width: 57,
    height: 23,
    borderColor: border,
    borderWidth: 0.75
  });
  drawTopText(page, "DA  /  NE", content.leftPt + 83, positions.approvalTopPt + 4, {
    fonts,
    size: fontSizes.smallPt,
    weight: "bold",
    color: black
  });

  const directorName = `${DEFAULTS.directorName}, `;
  const directorRole = DEFAULTS.directorRole;
  const signatureWidth = 142;
  const nameWidth = fonts.semibold.widthOfTextAtSize(directorName, fontSizes.bodyPt);
  const roleWidth = fonts.italic.widthOfTextAtSize(directorRole, fontSizes.bodyPt);
  const directorLeft = right - signatureWidth - 10 - nameWidth - roleWidth;
  drawTopText(page, directorName, directorLeft, positions.approvalTopPt + 3, semibold);
  drawTopText(page, directorRole, directorLeft + nameWidth, positions.approvalTopPt + 3, {
    fonts,
    size: fontSizes.bodyPt,
    weight: "italic",
    color: black
  });
  drawTopLine(page, right - signatureWidth, right, positions.approvalTopPt + 25, {
    color: muted,
    dashArray: [3, 5]
  });
}

export async function createCombinedPdfBlob(proposal, attachment, signatureAsset = null) {
  if (!window.PDFLib) {
    throw new Error("Knjižnica za PDF ni naložena.");
  }

  const { PDFDocument } = window.PDFLib;
  const pdf = await PDFDocument.create();
  await drawProposalPage(pdf, proposal, signatureAsset);

  if (attachment?.blob) {
    const attachmentKind = inferAttachmentKind(attachment);

    if (attachmentKind === "pdf") {
      const attachmentBytes = await attachment.blob.arrayBuffer();
      const attachmentPdf = await PDFDocument.load(attachmentBytes, { ignoreEncryption: true });
      const copiedPages = await pdf.copyPages(attachmentPdf, attachmentPdf.getPageIndices());
      copiedPages.forEach((copiedPage) => pdf.addPage(copiedPage));
    } else if (attachmentKind === "image") {
      await appendImageAttachmentPage(pdf, attachment);
    } else {
      throw new Error("Pripeta datoteka mora biti datoteka PDF ali slika.");
    }
  }

  const bytes = await pdf.save();
  return new Blob([bytes], { type: "application/pdf" });
}

export async function createProposalPdfBlob(proposal, signatureAsset = null) {
  if (!window.PDFLib) {
    throw new Error("Knjižnica za PDF ni naložena.");
  }

  const { PDFDocument } = window.PDFLib;
  const pdf = await PDFDocument.create();
  await drawProposalPage(pdf, proposal, signatureAsset);
  const bytes = await pdf.save();
  return new Blob([bytes], { type: "application/pdf" });
}
