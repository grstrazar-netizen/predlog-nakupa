import { DEFAULTS, blobToDataUrl, formatSlovenianDate, yearFromDate } from "./utils.js";

const A4 = {
  widthPt: 595.28,
  heightPt: 841.89,
  widthPx: 1240,
  heightPx: 1754
};

const PREVIEW_PAPER = {
  widthPx: 794,
  heightPx: 1123,
  paddingX: 74,
  paddingY: 68
};

const PREVIEW_TO_CANVAS = A4.widthPx / PREVIEW_PAPER.widthPx;
const PDF_FONT = "Arial, Helvetica, sans-serif";

function paperPx(value) {
  return value * PREVIEW_TO_CANVAS;
}

function fontPx(value) {
  return Math.round(paperPx(value));
}

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

function drawRoundedRect(ctx, x, y, width, height, options = {}) {
  const radius = options.radius || 0;

  ctx.save();
  ctx.beginPath();
  if (radius > 0 && typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.rect(x, y, width, height);
  }

  if (options.fill) {
    ctx.fillStyle = options.fill;
    ctx.fill();
  }

  if (options.stroke) {
    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.width || 1;
    ctx.stroke();
  }

  ctx.restore();
}

function measureText(ctx, text, options = {}) {
  const { size = 28, family = PDF_FONT, weight = "400", style = "normal" } = options;
  ctx.save();
  ctx.font = `${style} ${weight} ${size}px ${family}`;
  const width = ctx.measureText(String(text || "")).width;
  ctx.restore();
  return width;
}

function fitText(ctx, text, maxWidth, options = {}) {
  const source = String(text || "");
  if (!source) return "";
  if (measureText(ctx, source, options) <= maxWidth) return source;

  const ellipsis = "…";
  let value = source;
  while (value.length > 1 && measureText(ctx, `${value}${ellipsis}`, options) > maxWidth) {
    value = value.slice(0, -1);
  }
  return `${value.replace(/\s+$/g, "")}${ellipsis}`;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, options = {}) {
  let cursorY = y;
  ctx.font = `${options.style || "normal"} ${options.weight || "400"} ${options.size || 28}px ${options.family || PDF_FONT}`;
  ctx.fillStyle = options.color || "#111111";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const maxY = options.maxY || Infinity;

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
        if (cursorY + lineHeight > maxY) return cursorY;
        ctx.fillText(line, x, cursorY);
        line = word;
        cursorY += lineHeight;
      } else {
        line = testLine;
      }
    }

    if (line) {
      if (cursorY + lineHeight > maxY) return cursorY;
      ctx.fillText(line, x, cursorY);
      cursorY += lineHeight;
    }
  }

  return cursorY;
}

function drawCenterRogLogo(ctx, x = paperPx(PREVIEW_PAPER.paddingX), y = paperPx(PREVIEW_PAPER.paddingY)) {
  ctx.save();
  ctx.fillStyle = "#111111";
  ctx.font = `700 ${fontPx(22)}px ${PDF_FONT}`;
  ctx.textBaseline = "top";
  ctx.fillText("Center", x, y + paperPx(5));
  ctx.fillText("Rog", x, y + paperPx(29));
  ctx.lineWidth = paperPx(2.5);
  ctx.strokeStyle = "#111111";
  ctx.beginPath();
  ctx.moveTo(x, y + paperPx(58));
  ctx.lineTo(x + paperPx(72), y + paperPx(58));
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
    throw new Error("Priložene slike ni bilo mogoče pretvoriti v dokument PDF.");
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

function drawAccountingNumber(ctx, proposal, x, y, size = 27) {
  drawText(ctx, `Št.: ${yearFromDate(proposal.issueDate)}- ____`, x, y, { size, weight: "700" });
}

async function renderProposalCanvas(proposal) {
  const canvas = document.createElement("canvas");
  canvas.width = A4.widthPx;
  canvas.height = A4.heightPx;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const left = paperPx(PREVIEW_PAPER.paddingX);
  const right = A4.widthPx - left;
  const contentWidth = right - left;
  const bodySize = fontPx(15);
  const titleSize = fontPx(18);
  const lineHeight = paperPx(23);
  const muted = "#52525b";

  try {
    const logo = await loadImage("/assets/center-rog-logo.svg");
    ctx.drawImage(logo, left, paperPx(PREVIEW_PAPER.paddingY), paperPx(84), paperPx(78));
  } catch {
    drawCenterRogLogo(ctx, left, paperPx(PREVIEW_PAPER.paddingY));
  }

  let y = paperPx(151);

  drawText(ctx, "PREDLOG NAKUPA DROBNEGA MATERIALA", A4.widthPx / 2, y, {
    align: "center",
    size: titleSize,
    weight: "700"
  });

  y = paperPx(215);
  const nameLabel = "Ime in priimek:";
  drawText(ctx, nameLabel, left, y, { size: bodySize });
  drawText(ctx, proposal.fullName || "", left + measureText(ctx, nameLabel, { size: bodySize }) + paperPx(8), y, {
    size: bodySize,
    weight: "700"
  });

  y += paperPx(38);
  const jobLabel = "Zaposlen/a na delovnem mestu:";
  drawText(ctx, jobLabel, left, y, { size: bodySize });
  drawText(ctx, proposal.jobTitle || "", left + measureText(ctx, jobLabel, { size: bodySize }) + paperPx(8), y, {
    size: bodySize,
    weight: "700"
  });

  y += paperPx(62);
  drawText(ctx, "Predlagam nakup naslednjega drobnega materiala za potrebe:", left, y, { size: bodySize });

  y += paperPx(34);
  const purposeBottom = wrapText(ctx, proposal.purpose || "", left, y, contentWidth, lineHeight, {
    size: bodySize,
    weight: "600",
    maxY: y + paperPx(46)
  });
  y = Math.max(y + paperPx(30), purposeBottom) + paperPx(26);

  drawText(ctx, "Opis / obrazložitev potrebe:", left, y, { size: bodySize, weight: "700" });
  const notesY = y + paperPx(29);
  const notesHeight = paperPx(142);
  drawRoundedRect(ctx, left, notesY, contentWidth, notesHeight, {
    radius: paperPx(8),
    fill: "#fbfbfb",
    stroke: "#d4d4d8",
    width: 1
  });
  wrapText(ctx, proposal.explanation || "", left + paperPx(14), notesY + paperPx(12), contentWidth - paperPx(28), lineHeight, {
    size: bodySize,
    color: muted,
    maxY: notesY + notesHeight - paperPx(12)
  });

  const items = Array.isArray(proposal?.items) ? proposal.items : [];
  const tableTop = notesY + notesHeight + paperPx(24);

  if (items.length) {
    const sectionTitleSize = fontPx(13);
    const rowFontSize = fontPx(items.length > 4 ? 10.5 : 11.5);
    const rowLineHeight = paperPx(items.length > 4 ? 16 : 18);
    const gap = paperPx(8);
    const nameWidth = paperPx(282);
    const quantityWidth = paperPx(72);
    const unitWidth = paperPx(64);
    const tagWidth = paperPx(178);
    const headerY = tableTop;

    drawText(ctx, "Postavke nakupa", left, headerY, { size: sectionTitleSize, weight: "700" });
    let rowY = headerY + paperPx(22);
    drawLine(ctx, left, rowY - paperPx(3), right, rowY - paperPx(3), { color: "#e4e4e7", width: 1 });
    drawText(ctx, "Naziv", left, rowY, { size: rowFontSize, weight: "700", color: muted });
    drawText(ctx, "Količina", left + nameWidth + gap, rowY, { size: rowFontSize, weight: "700", color: muted });
    drawText(ctx, "Enota", left + nameWidth + gap + quantityWidth + gap, rowY, { size: rowFontSize, weight: "700", color: muted });
    drawText(ctx, "Tag", left + nameWidth + gap + quantityWidth + gap + unitWidth + gap, rowY, {
      size: rowFontSize,
      weight: "700",
      color: muted
    });
    drawText(ctx, "Vrednost", right, rowY, { size: rowFontSize, weight: "700", color: muted, align: "right" });
    rowY += paperPx(16);
    drawLine(ctx, left, rowY, right, rowY, { color: "#e4e4e7", width: 1 });

    items.forEach((item, index) => {
      const tagLabel = String(item?.tagLabel || item?.tagId || "").trim() || "Brez taga";
      const lineY = rowY + paperPx(9);
      drawText(ctx, `${index + 1}.`, left, lineY, { size: rowFontSize, weight: "700" });
      drawText(ctx, fitText(ctx, item?.name || "Brez naziva", nameWidth - paperPx(16), { size: rowFontSize }), left + paperPx(16), lineY, {
        size: rowFontSize,
        weight: "600"
      });
      drawText(ctx, fitText(ctx, item?.quantity || "—", quantityWidth - paperPx(4), { size: rowFontSize }), left + nameWidth + gap, lineY, {
        size: rowFontSize
      });
      drawText(ctx, fitText(ctx, item?.unit || "—", unitWidth - paperPx(4), { size: rowFontSize }), left + nameWidth + gap + quantityWidth + gap, lineY, {
        size: rowFontSize
      });
      drawText(
        ctx,
        fitText(ctx, tagLabel, tagWidth - paperPx(6), { size: rowFontSize }),
        left + nameWidth + gap + quantityWidth + gap + unitWidth + gap,
        lineY,
        {
          size: rowFontSize,
          color: muted
        }
      );
      drawText(ctx, formatCurrency(item?.valueCents || 0), right, lineY, { size: rowFontSize, weight: "700", align: "right" });
      rowY += rowLineHeight;
      drawLine(ctx, left, rowY - paperPx(4), right, rowY - paperPx(4), { color: "#f1f1f4", width: 1 });
    });

    y = rowY + paperPx(8);
  } else {
    y = tableTop + paperPx(8);
  }

  const companyLabel = "Podjetje:";
  drawText(ctx, companyLabel, left, y, { size: bodySize });
  drawText(ctx, proposal.company || "", left + measureText(ctx, companyLabel, { size: bodySize }) + paperPx(8), y, {
    size: bodySize
  });

  y += paperPx(50);
  const value = proposal.estimatedValueCents
    ? (proposal.estimatedValueCents / 100).toLocaleString("sl-SI", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    : "";
  const valueLabel = "V okvirni skupni vrednosti: cca";
  const valueX = left + measureText(ctx, valueLabel, { size: bodySize }) + paperPx(10) + paperPx(92);
  drawText(ctx, valueLabel, left, y, { size: bodySize });
  drawText(ctx, value, valueX, y, { size: bodySize, weight: "700", align: "right" });
  drawText(ctx, "brez DDV", valueX + paperPx(10), y, { size: bodySize });

  const footerLineY = Math.max(y + paperPx(128), paperPx(820));
  drawLine(ctx, left, footerLineY, right, footerLineY, { color: "#d4d4d8", width: 1 });

  const issueY = footerLineY + paperPx(20);
  drawText(ctx, DEFAULTS.city, left, issueY, { size: bodySize });
  drawText(ctx, formatSlovenianDate(proposal.issueDate), left + paperPx(168), issueY, { size: bodySize });
  drawText(ctx, "Podpis vodje laba", left + contentWidth - paperPx(270), issueY, {
    size: fontPx(14),
    weight: "700"
  });
  drawLine(ctx, left + contentWidth - paperPx(122), issueY + paperPx(24), right, issueY + paperPx(24), { color: "#71717a" });

  drawAccountingNumber(ctx, proposal, left, issueY + paperPx(58), bodySize);

  const approvalLineY = issueY + paperPx(116);
  drawLine(ctx, left, approvalLineY, right, approvalLineY, { width: 1.7 });

  const approvalY = approvalLineY + paperPx(24);
  drawText(ctx, "SOGLAŠAM", left, approvalY + paperPx(5), { size: bodySize, weight: "700" });
  drawRoundedRect(ctx, left + paperPx(92), approvalY, paperPx(76), paperPx(31), {
    radius: paperPx(16),
    fill: "#ffffff",
    stroke: "#d4d4d8",
    width: 1
  });
  drawText(ctx, "DA  /  NE", left + paperPx(111), approvalY + paperPx(6), {
    size: fontPx(14),
    weight: "700",
    color: "#27272a"
  });

  const directorY = approvalY + paperPx(4);
  const directorName = "Renata Zamida, ";
  const roleText = "direktorica";
  const directorNameWidth = measureText(ctx, directorName, { size: bodySize, weight: "600" });
  const directorRoleWidth = measureText(ctx, roleText, { size: bodySize, style: "italic" });
  const signatureWidth = paperPx(190);
  const directorX = right - signatureWidth - paperPx(14) - directorNameWidth - directorRoleWidth;
  drawText(ctx, directorName, directorX, directorY, { size: bodySize, weight: "600" });
  drawText(ctx, roleText, directorX + directorNameWidth, directorY, { size: bodySize, style: "italic" });
  drawLine(ctx, right - signatureWidth, directorY + paperPx(28), right, directorY + paperPx(28), { dash: [4, 7] });

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
      throw new Error("Pripeta datoteka mora biti datoteka PDF ali slika.");
    }
  }

  const bytes = await pdf.save();
  return new Blob([bytes], { type: "application/pdf" });
}

export async function createProposalPreviewImage(proposal) {
  const canvas = await renderProposalCanvas(proposal);
  return blobToDataUrl(await new Promise((resolve) => canvas.toBlob(resolve, "image/png")));
}
