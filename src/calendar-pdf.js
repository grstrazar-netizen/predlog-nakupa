import { DOCUMENT_FONT_FILES } from "./document-layout.js";
import {
  CALENDAR_MONTHS,
  CALENDAR_WEEKDAYS,
  calendarCoverageForYear,
  calendarMonth
} from "./calendar-planner.js";
import { calendarEventsForDate, calendarYearPlanStatistics } from "./calendar-events.js";

let fontBytesPromise;

const PAGE = Object.freeze({
  width: 595.28,
  height: 841.89,
  margin: 18
});

const LEVEL_COLORS = Object.freeze({
  recommended: "#e3f2dc",
  neutral: "#f5f2dc",
  caution: "#f9e7ca",
  avoid: "#f7d9d8"
});

const EVENT_COLORS = Object.freeze({
  holiday: "#c84b4b",
  school: "#c9852d",
  academic: "#386fa4",
  theme: "#41835a",
  internal: "#7652a5"
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

function colorFromHex(rgb, value) {
  const normalized = value.replace("#", "");
  return rgb(
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255
  );
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

function drawCenteredText(page, text, centerX, top, options) {
  const value = String(text ?? "");
  const width = options.font.widthOfTextAtSize(value, options.size);
  drawText(page, value, centerX - width / 2, top, options);
}

function drawLine(page, x1, x2, top, color, thickness = 0.5) {
  page.drawLine({
    start: { x: x1, y: yFromTop(top) },
    end: { x: x2, y: yFromTop(top) },
    color,
    thickness
  });
}

function drawRoundedFill(page, { x, y, width, height, radius, color }) {
  const corner = Math.min(radius, width / 2, height / 2);
  page.drawRectangle({ x: x + corner, y, width: width - corner * 2, height, color });
  page.drawRectangle({ x, y: y + corner, width, height: height - corner * 2, color });
  [
    [x + corner, y + corner],
    [x + width - corner, y + corner],
    [x + corner, y + height - corner],
    [x + width - corner, y + height - corner]
  ].forEach(([centerX, centerY]) => {
    page.drawCircle({ x: centerX, y: centerY, size: corner, color });
  });
}

function drawRoundedRectangle(page, options) {
  const borderWidth = options.borderWidth || 0;
  if (borderWidth && options.borderColor) {
    drawRoundedFill(page, { ...options, color: options.borderColor });
    drawRoundedFill(page, {
      x: options.x + borderWidth,
      y: options.y + borderWidth,
      width: options.width - borderWidth * 2,
      height: options.height - borderWidth * 2,
      radius: Math.max(0, options.radius - borderWidth),
      color: options.color
    });
    return;
  }
  drawRoundedFill(page, options);
}

function drawLegend(page, fonts, colors, heatmapVisible) {
  const labels = heatmapVisible
    ? [
        ["Priporočljivo", colors.recommended],
        ["Nevtralno", colors.neutral],
        ["Previdno", colors.caution],
        ["Odsvetovano", colors.avoid]
      ]
    : [["Heatmap je izključen", colors.hidden]];
  const itemWidth = heatmapVisible ? 64 : 105;
  const startX = PAGE.width - PAGE.margin - labels.length * itemWidth;

  labels.forEach(([label, color], index) => {
    const x = startX + index * itemWidth;
    drawRoundedRectangle(page, {
      x,
      y: yFromTop(24, 8),
      width: 8,
      height: 8,
      radius: 1.3,
      color,
      borderColor: colors.grid,
      borderWidth: 0.35
    });
    drawText(page, label, x + 12, 23.5, {
      font: fonts.regular,
      size: 6.1,
      color: colors.muted
    });
  });
}

function drawMonth(page, monthIndex, monthX, top, width, calendarState, fonts, colors) {
  const month = calendarMonth(
    calendarState.year,
    monthIndex,
    calendarState.filters,
    calendarState.events
  );
  const cellGap = 1.35;
  const cellWidth = (width - cellGap * 6) / 7;
  const cellHeight = 18.8;
  const rowGap = 1.35;
  const gridTop = top + 27;

  drawText(page, CALENDAR_MONTHS[monthIndex], monthX, top + 1, {
    font: fonts.semibold,
    size: 8.5,
    color: colors.black
  });

  CALENDAR_WEEKDAYS.forEach((weekday, index) => {
    drawCenteredText(page, weekday, monthX + index * (cellWidth + cellGap) + cellWidth / 2, top + 15, {
      font: fonts.semibold,
      size: 5.2,
      color: colors.muted
    });
  });

  month.cells.forEach((cell, index) => {
    if (!cell) return;
    const column = index % 7;
    const row = Math.floor(index / 7);
    const x = monthX + column * (cellWidth + cellGap);
    const cellTop = gridTop + row * (cellHeight + rowGap);
    const fill = calendarState.heatmapVisible === false
      ? cell.analysis.weekend ? colors.weekend : colors.hidden
      : colors[cell.analysis.level.key];

    drawRoundedRectangle(page, {
      x,
      y: yFromTop(cellTop, cellHeight),
      width: cellWidth,
      height: cellHeight,
      radius: 1.7,
      color: fill,
      borderColor: colors.cellBorder,
      borderWidth: 0.25
    });

    drawCenteredText(page, cell.day, x + cellWidth / 2, cellTop + (cellHeight - 5.8) / 2 - 0.4, {
      font: fonts.semibold,
      size: 5.8,
      color: colors.black
    });

    const eventCategories = [...new Set(cell.analysis.events.map((event) => event.category))].slice(0, 3);
    eventCategories.forEach((category, markerIndex) => {
      page.drawCircle({
        x: x + cellWidth - 3 - markerIndex * 3.2,
        y: yFromTop(cellTop + 3.8),
        size: 1.05,
        color: colors.events[category] || colors.muted
      });
    });

    const plannedEvents = calendarEventsForDate(calendarState.events, cell.date)
      .filter((event) => event.kind === "program");
    if (plannedEvents.length) {
      const badgeX = x + cellWidth - 4;
      const badgeY = yFromTop(cellTop + cellHeight - 4.1);
      page.drawCircle({ x: badgeX, y: badgeY, size: 3.15, color: colors.program });
      drawCenteredText(page, plannedEvents.length > 9 ? "+" : plannedEvents.length, badgeX, cellTop + cellHeight - 7, {
        font: fonts.bold,
        size: 4.2,
        color: colors.white
      });
    }
  });
}

function drawQuarter(page, quarterIndex, top, calendarState, fonts, colors) {
  const quarterLabels = ["Jan–Mar", "Apr–Jun", "Jul–Sep", "Okt–Dec"];
  const labelWidth = 31;
  const monthGap = 5;
  const contentWidth = PAGE.width - PAGE.margin * 2;
  const monthWidth = (contentWidth - labelWidth - monthGap * 2) / 3;
  const monthStart = PAGE.margin + labelWidth;

  drawText(page, `Q${quarterIndex + 1}`, PAGE.margin, top + 2, {
    font: fonts.bold,
    size: 8.5,
    color: colors.black
  });
  drawText(page, quarterLabels[quarterIndex], PAGE.margin, top + 14, {
    font: fonts.regular,
    size: 5.5,
    color: colors.muted
  });

  [0, 1, 2].forEach((offset) => {
    drawMonth(
      page,
      quarterIndex * 3 + offset,
      monthStart + offset * (monthWidth + monthGap),
      top,
      monthWidth,
      calendarState,
      fonts,
      colors
    );
  });

  if (quarterIndex < 3) {
    drawLine(page, PAGE.margin, PAGE.width - PAGE.margin, top + 181, colors.grid, 0.45);
  }
}

export async function createCalendarPdfBlob(calendarState) {
  if (!window.PDFLib) throw new Error("Knjižnica za PDF ni naložena.");

  const { PDFDocument, rgb } = window.PDFLib;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const fonts = await embedFonts(pdf);
  const colors = {
    black: colorFromHex(rgb, "#18181b"),
    muted: colorFromHex(rgb, "#5f636b"),
    grid: colorFromHex(rgb, "#aeb2b8"),
    cellBorder: colorFromHex(rgb, "#d6d8dc"),
    hidden: colorFromHex(rgb, "#ffffff"),
    weekend: colorFromHex(rgb, "#f1f2f3"),
    program: colorFromHex(rgb, "#173f74"),
    white: rgb(1, 1, 1),
    events: Object.fromEntries(
      Object.entries(EVENT_COLORS).map(([key, value]) => [key, colorFromHex(rgb, value)])
    ),
    ...Object.fromEntries(
      Object.entries(LEVEL_COLORS).map(([key, value]) => [key, colorFromHex(rgb, value)])
    )
  };
  const coverage = calendarCoverageForYear(calendarState.year);
  const statistics = calendarYearPlanStatistics(calendarState.events, calendarState.year);

  drawText(page, `Koledar programov ${calendarState.year}`, PAGE.margin, 16, {
    font: fonts.bold,
    size: 14,
    color: colors.black
  });
  drawText(page, `Center Rog · Osrednjeslovenska regija · ${coverage.label}`, PAGE.margin, 36, {
    font: fonts.regular,
    size: 6.8,
    color: colors.muted
  });
  drawLegend(page, fonts, colors, calendarState.heatmapVisible !== false);
  const planSummary = `${statistics.hours.toLocaleString("sl-SI", { maximumFractionDigits: 1 })} h · ${statistics.programCount} programov · ${statistics.occurrenceCount} terminov${statistics.capacityDefinedCount ? ` · ${statistics.participantCapacity} mest` : ""}`;
  const planSummaryWidth = fonts.semibold.widthOfTextAtSize(planSummary, 6.2);
  drawText(page, planSummary, PAGE.width - PAGE.margin - planSummaryWidth, 38, {
    font: fonts.semibold,
    size: 6.2,
    color: colors.muted
  });
  drawLine(page, PAGE.margin, PAGE.width - PAGE.margin, 54, colors.black, 0.9);

  [0, 1, 2, 3].forEach((quarterIndex) => {
    drawQuarter(page, quarterIndex, 62 + quarterIndex * 187, calendarState, fonts, colors);
  });

  drawText(page, "Barvne pike označujejo koledarske vplive. Moder krog označuje število načrtovanih programov.", PAGE.margin, 819, {
    font: fonts.regular,
    size: 5.3,
    color: colors.muted
  });

  return new Blob([await pdf.save()], { type: "application/pdf" });
}
