import { companyDocumentText } from "./company-directory.js";

const PREVIEW_TO_POINTS = 595.28 / 794;

function pt(previewPixels) {
  return previewPixels * PREVIEW_TO_POINTS;
}

export const DOCUMENT_LAYOUT = Object.freeze({
  page: Object.freeze({
    widthPt: 595.28,
    heightPt: 841.89,
    previewWidthPx: 794,
    previewHeightPx: 1123
  }),
  content: Object.freeze({
    leftPt: pt(74),
    rightPt: pt(74),
    widthPt: 595.28 - pt(148)
  }),
  fonts: Object.freeze({
    family: "Noto Sans",
    bodyPt: pt(15),
    smallPt: pt(14),
    titlePt: pt(18),
    lineHeightPt: pt(23)
  }),
  positions: Object.freeze({
    logoTopPt: pt(68),
    logoWidthPt: pt(84),
    logoHeightPt: pt(78),
    titleTopPt: pt(151),
    nameTopPt: pt(215),
    jobTopPt: pt(253),
    purposeLabelTopPt: pt(315),
    purposeTopPt: pt(349),
    explanationLabelTopPt: pt(405),
    explanationBoxTopPt: pt(434),
    explanationBoxHeightPt: pt(142),
    companyTopPt: pt(614),
    valueTopPt: pt(664),
    footerLineTopPt: pt(820),
    issueTopPt: pt(840),
    accountingTopPt: pt(898),
    approvalLineTopPt: pt(956),
    approvalTopPt: pt(980)
  }),
  fields: Object.freeze({
    fullName: Object.freeze({ maxLines: 1 }),
    jobTitle: Object.freeze({ maxLines: 1 }),
    purpose: Object.freeze({ maxLines: 2 }),
    explanation: Object.freeze({ maxLines: 5 }),
    company: Object.freeze({ maxLines: 1 })
  })
});

export const DOCUMENT_FONT_FILES = Object.freeze({
  regular: "/assets/fonts/NotoSans-Regular.ttf",
  semibold: "/assets/fonts/NotoSans-SemiBold.ttf",
  bold: "/assets/fonts/NotoSans-Bold.ttf",
  italic: "/assets/fonts/NotoSans-Italic.ttf"
});

export function documentLayoutCssVariables() {
  const { page, content, fonts, positions } = DOCUMENT_LAYOUT;
  const pointsToPreview = page.previewWidthPx / page.widthPt;
  const px = (points) => `${points * pointsToPreview}px`;
  return [
    `--paper-width: ${page.previewWidthPx}px`,
    `--paper-height: ${page.previewHeightPx}px`,
    `--paper-padding-x: ${px(content.leftPt)}`,
    `--paper-padding-y: ${px(positions.logoTopPt)}`,
    `--document-font-family: "${fonts.family}", Arial, sans-serif`,
    `--document-body-size: ${px(fonts.bodyPt)}`,
    `--document-small-size: ${px(fonts.smallPt)}`,
    `--document-title-size: ${px(fonts.titlePt)}`,
    `--document-line-height: ${px(fonts.lineHeightPt)}`,
    `--document-logo-width: ${px(positions.logoWidthPt)}`,
    `--document-explanation-height: ${px(positions.explanationBoxHeightPt)}`
  ].join("; ");
}

function splitLongWord(word, maxWidth, measure) {
  const chunks = [];
  let chunk = "";

  for (const character of word) {
    const candidate = `${chunk}${character}`;
    if (chunk && measure(candidate) > maxWidth) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk = candidate;
    }
  }

  if (chunk) chunks.push(chunk);
  return chunks;
}

export function wrapTextLines(text, maxWidth, measure) {
  const lines = [];
  const paragraphs = String(text || "").split(/\r?\n/);

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);

    if (!words.length) {
      if (paragraphIndex < paragraphs.length - 1) lines.push("");
      return;
    }

    let line = "";
    for (const word of words) {
      const pieces = measure(word) > maxWidth ? splitLongWord(word, maxWidth, measure) : [word];

      for (const piece of pieces) {
        const candidate = line ? `${line} ${piece}` : piece;
        if (line && measure(candidate) > maxWidth) {
          lines.push(line);
          line = piece;
        } else {
          line = candidate;
        }
      }
    }

    if (line) lines.push(line);
  });

  return lines;
}

export function createProposalLayout(proposal, measureText) {
  const { content, fields, fonts, positions } = DOCUMENT_LAYOUT;
  const body = { size: fonts.bodyPt, weight: "regular" };
  const semibold = { size: fonts.bodyPt, weight: "semibold" };
  const explanationWidth = content.widthPt - pt(28);
  const labelGap = pt(8);
  const nameWidth = content.widthPt - measureText("Ime in priimek:", body) - labelGap;
  const jobWidth = content.widthPt - measureText("Zaposlen/a na delovnem mestu:", body) - labelGap;
  const companyWidth = content.widthPt - measureText("Podjetje:", body) - labelGap;

  const companyText = companyDocumentText(proposal);
  const companyMeasuredWidth = companyText ? measureText(companyText, body) : 0;
  const companyFontSizePt = companyMeasuredWidth > companyWidth
    ? Math.max(fonts.bodyPt * 0.72, fonts.bodyPt * (companyWidth / companyMeasuredWidth))
    : fonts.bodyPt;

  const lineSets = {
    fullName: wrapTextLines(proposal.fullName, nameWidth, (text) => measureText(text, semibold)),
    jobTitle: wrapTextLines(proposal.jobTitle, jobWidth, (text) => measureText(text, semibold)),
    purpose: wrapTextLines(proposal.purpose, content.widthPt, (text) => measureText(text, semibold)),
    explanation: wrapTextLines(proposal.explanation, explanationWidth, (text) => measureText(text, body)),
    company: companyText ? [companyText] : []
  };

  const overflowFields = Object.entries(lineSets)
    .filter(([field, lines]) => lines.length > fields[field].maxLines)
    .map(([field]) => field);

  return {
    ...DOCUMENT_LAYOUT,
    lines: lineSets,
    overflowFields,
    fits: overflowFields.length === 0,
    text: Object.freeze({
      nameValueLeftPt: content.leftPt + measureText("Ime in priimek:", body) + labelGap,
      jobValueLeftPt: content.leftPt + measureText("Zaposlen/a na delovnem mestu:", body) + labelGap,
      companyValueLeftPt: content.leftPt + measureText("Podjetje:", body) + labelGap,
      companyFontSizePt,
      explanationTextLeftPt: content.leftPt + pt(14),
      explanationTextTopPt: positions.explanationBoxTopPt + pt(12)
    })
  };
}

export function createCanvasTextMeasurer() {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const scale = DOCUMENT_LAYOUT.page.previewWidthPx / DOCUMENT_LAYOUT.page.widthPt;

  return (text, style = {}) => {
    const weight = style.weight === "bold" ? 700 : style.weight === "semibold" ? 600 : 400;
    const fontStyle = style.weight === "italic" ? "italic" : "normal";
    context.font = `${fontStyle} ${weight} ${Math.max(1, style.size * scale)}px "${DOCUMENT_LAYOUT.fonts.family}", Arial, sans-serif`;
    return context.measureText(String(text || "")).width / scale;
  };
}
