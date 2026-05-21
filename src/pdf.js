import { DEFAULTS, blobToDataUrl, formatSlovenianDate, yearFromDate } from "./utils.js";

const A4 = {
  widthPt: 595.28,
  heightPt: 841.89,
  widthPx: 1240,
  heightPx: 1754
};

const PDF_FONT = "Arial, Helvetica, sans-serif";

function drawText(ctx, text, x, y, options = {}) {
  const { size = 28, family = PDF_FONT, weight = "400", style = "normal", align = "left", color = "#111111" } = options;
  ctx.fillStyle = color;
  ctx.font = `${style} ${weight} ${size}px ${family}`;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.fillText(String(text || ""), x, y);
}

function drawLine(ctx, x1, y1, x2, y2, options = {}) {
  ctx.save();
  ctx.strokeStyle = options.color || "#111111";
  ctx.lineWidth = options.width || 1.5;
  if (options.dash) ctx.setLineDash(options.dash);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, options = {}) {
  let cursorY = y;
  ctx.font = `${options.weight || "400"} ${options.size || 28}px ${options.family || PDF_FONT}`;
  ctx.fillStyle = options.color || "#111111";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const paragraphs = String(text || "").split(/\n/);
  if (!paragraphs.some((paragraph) => paragraph.trim())) {
    ctx.fillText("", x, cursorY);
    return cursorY + lineHeight;
  }

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let line = "";

    if (!words.length) {
      cursorY += lineHeight * 0.65;
      continue;
    }

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        ctx.fillText(line, x, cursorY);
        line = word;
        cursorY += lineHeight;
      } else {
        line = testLine;
      }
    }

    if (line) {
      ctx.fillText(line, x, cursorY);
      cursorY += lineHeight;
    }
  }

  return cursorY;
}

function drawCenterRogLogo(ctx) {
  ctx.save();
  ctx.fillStyle = "#111111";
  ctx.font = `700 34px ${PDF_FONT}`;
  ctx.textBaseline = "top";
  ctx.fillText("Center", 145, 82);
  ctx.fillText("Rog", 145, 120);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#111111";
  ctx.beginPath();
  ctx.moveTo(145, 166);
  ctx.lineTo(250, 166);
  ctx.stroke();
  ctx.restore();
}

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Slike ${src} ni bilo mogoče naložiti.`));
    image.src = src;
  });
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
  const sourceUrl = await blobToDataUrl(blob);
  const image = await loadImage(sourceUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);

  const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!pngBlob) {
    throw new Error("Priložene slike ni bilo mogoče pretvoriti v PDF.");
  }

  return new Uint8Array(await pngBlob.arrayBuffer());
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
    const pngBytes = await imageBlobToPngBytes(attachment.blob);
    image = await pdf.embedPng(pngBytes);
  }

  const page = pdf.addPage([A4.widthPt, A4.heightPt]);
  const margin = 28;
  const maxWidth = A4.widthPt - margin * 2;
  const maxHeight = A4.heightPt - margin * 2;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const x = (A4.widthPt - drawWidth) / 2;
  const y = (A4.heightPt - drawHeight) / 2;

  page.drawImage(image, {
    x,
    y,
    width: drawWidth,
    height: drawHeight
  });
}

function drawAccountingNumber(ctx, proposal, x, y) {
  drawText(ctx, `Št.: ${yearFromDate(proposal.issueDate)}- ____`, x, y, { size: 27 });
}

async function renderProposalCanvas(proposal) {
  const canvas = document.createElement("canvas");
  canvas.width = A4.widthPx;
  canvas.height = A4.heightPx;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  try {
    const logo = await loadImage("/assets/center-rog-logo.svg");
    ctx.drawImage(logo, 145, 74, 118, 110);
  } catch {
    drawCenterRogLogo(ctx);
  }

  const left = 145;
  const right = A4.widthPx - 145;
  let y = 226;

  drawText(ctx, "PREDLOG NAKUPA DROBNEGA MATERIALA", A4.widthPx / 2, y, {
    align: "center",
    size: 31,
    weight: "700"
  });

  y += 92;
  drawText(ctx, "Ime in priimek:", left, y, { size: 27 });
  drawText(ctx, proposal.fullName || "", left + 205, y, { size: 27, weight: "700" });
  y += 54;
  drawText(ctx, "Zaposlen/a na delovnem mestu:", left, y, { size: 27 });
  drawText(ctx, proposal.jobTitle || "", left + 405, y, { size: 27, weight: "700" });

  y += 76;
  drawText(ctx, "Predlagam nakup naslednjega drobnega materiala za potrebe:", left, y, { size: 27 });

  y += 52;
  y = wrapText(ctx, proposal.purpose || "", left, y, right - left, 42, { size: 29, weight: "700" });

  y += 24;
  y = wrapText(ctx, proposal.explanation || "", left, y, right - left, 39, { size: 27 });

  y += 50;
  drawText(ctx, `Podjetje: ${proposal.company || ""}`, left, y, { size: 27 });

  y += 78;
  const value = proposal.estimatedValueCents
    ? (proposal.estimatedValueCents / 100).toLocaleString("sl-SI", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    : "";
  drawText(ctx, "V okvirni skupni vrednosti: cca", left, y, { size: 27 });
  drawText(ctx, value, left + 445, y, { size: 27, weight: "700", align: "right" });
  drawText(ctx, "brez DDV", left + 470, y, { size: 27 });

  const bottomY = 1296;
  drawText(ctx, DEFAULTS.city, left, bottomY, { size: 27 });
  drawText(ctx, formatSlovenianDate(proposal.issueDate), left + 255, bottomY, { size: 27 });
  drawText(ctx, "Podpis vodje laba", 760, bottomY, { size: 25, weight: "700" });
  drawLine(ctx, 1000, bottomY + 31, right, bottomY + 31, { dash: [4, 7] });

  drawAccountingNumber(ctx, proposal, left, bottomY + 86);

  drawLine(ctx, left, bottomY + 155, right, bottomY + 155, { width: 1.7 });
  drawText(ctx, "SOGLAŠAM: DA / NE", left, bottomY + 198, { size: 27, weight: "700" });

  const directorX = 720;
  const directorY = bottomY + 194;
  const directorName = "Renata Zamida, ";
  drawText(ctx, directorName, directorX, directorY, { size: 25, weight: "600" });
  const directorRoleX = directorX + ctx.measureText(directorName).width;
  drawText(ctx, "direktorica", directorRoleX, directorY, { size: 25, style: "italic" });
  const directorSignatureX = directorRoleX + ctx.measureText("direktorica").width + 26;
  drawLine(ctx, directorSignatureX, directorY + 31, right, directorY + 31, { dash: [4, 7] });

  return canvas;
}

export async function createCombinedPdfBlob(proposal, attachment) {
  if (!window.PDFLib) {
    throw new Error("Knjižnica za PDF ni naložena.");
  }

  const { PDFDocument } = window.PDFLib;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A4.widthPt, A4.heightPt]);
  const canvas = await renderProposalCanvas(proposal);
  const proposalPng = await pdf.embedPng(canvas.toDataURL("image/png"));
  page.drawImage(proposalPng, {
    x: 0,
    y: 0,
    width: A4.widthPt,
    height: A4.heightPt
  });

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
      throw new Error("Pripeta datoteka mora biti PDF ali slika.");
    }
  }

  const bytes = await pdf.save();
  return new Blob([bytes], { type: "application/pdf" });
}

export async function createProposalPreviewImage(proposal) {
  const canvas = await renderProposalCanvas(proposal);
  return blobToDataUrl(await new Promise((resolve) => canvas.toBlob(resolve, "image/png")));
}
