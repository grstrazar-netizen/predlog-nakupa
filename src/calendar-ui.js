import {
  CALENDAR_FILTERS,
  CALENDAR_MONTHS,
  CALENDAR_SOURCES,
  CALENDAR_WEEKDAYS,
  CALENDAR_YEAR_MAX,
  CALENDAR_YEAR_MIN,
  analyzeCalendarDate,
  bestCalendarDays,
  calendarCoverageForYear,
  calendarMonth,
  formatCalendarDate,
  todayCalendarDate
} from "./calendar-planner.js";
import {
  CALENDAR_RECURRENCE_OPTIONS,
  CALENDAR_HEATMAP_IMPACTS,
  CALENDAR_IMPORTANT_DATE_SUGGESTIONS,
  calendarEventColorForCategory,
  calendarEventConflictsForDate,
  calendarEventOccurrence,
  calendarEventSuggestions,
  calendarEventsForDate,
  calendarYearPlanStatistics
} from "./calendar-events.js";

const CATEGORY_LABELS = {
  holiday: "Praznik",
  school: "Šolske počitnice",
  academic: "Študijski koledar",
  theme: "Tematski dan",
  internal: "Interni datum",
  pattern: "Načrtovalni vzorec"
};

const HEATMAP_IMPACT_LABELS = Object.fromEntries(
  CALENDAR_HEATMAP_IMPACTS.map((item) => [item.value, item.label])
);

const SHORT_WEEKDAY_LABELS = ["Ned", "Pon", "Tor", "Sre", "Čet", "Pet", "Sob"];

function formatCompactCalendarDate(isoDate) {
  const [year, month, day] = String(isoDate || "").split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (!year || !month || !day || Number.isNaN(date.getTime())) return "";
  return `${SHORT_WEEKDAY_LABELS[date.getUTCDay()]}, ${day}. ${month}.`;
}

function dayMarkers(events) {
  const categories = [...new Set(events.map((item) => item.category))]
    .sort((left, right) => Number(right === "internal") - Number(left === "internal"));
  return categories
    .slice(0, 3)
    .map((category) => `<span class="calendar-day-marker marker-${category}" aria-hidden="true"></span>`)
    .join("");
}

function calendarEventColorStyle(event) {
  const color = calendarEventColorForCategory(event?.category);
  return `--event-accent: ${color.accent}; --event-fill: ${color.fill};`;
}

function renderMonth(month, calendarState, helpers) {
  const { escapeHtml } = helpers;
  const today = todayCalendarDate();
  const selectedDates = new Set(calendarState.selectedDates || []);
  return `
    <section class="calendar-month" aria-labelledby="calendar-month-${month.monthIndex}">
      <h3 id="calendar-month-${month.monthIndex}">${escapeHtml(month.name)}</h3>
      <div class="calendar-weekdays" aria-hidden="true">
        ${CALENDAR_WEEKDAYS.map((day) => `<span>${escapeHtml(day)}</span>`).join("")}
      </div>
      <div class="calendar-days">
        ${month.cells
          .map((cell) => {
            if (!cell) return `<span class="calendar-day-empty" aria-hidden="true"></span>`;
            const selected = cell.date === calendarState.selectedDate;
            const batchSelected = selectedDates.has(cell.date);
            const plannedEvents = calendarEventsForDate(calendarState.events, cell.date);
            const hasConflicts = calendarEventConflictsForDate(calendarState.events, cell.date).length > 0;
            const firstProgram = plannedEvents.find((event) => event.kind === "program");
            const analysis = cell.analysis;
            const detail = analysis.reasons.map((item) => item.title).join(", ");
            return `
              <button
                class="calendar-day level-${analysis.level.key}${analysis.weekend ? " is-weekend" : ""}${selected ? " is-selected" : ""}${batchSelected ? " is-batch-selected" : ""}${plannedEvents.length ? " has-planned-events" : ""}${hasConflicts ? " has-conflicts" : ""}${cell.date === today ? " is-today" : ""}"
                type="button"
                data-calendar-date="${escapeHtml(cell.date)}"
                ${selected ? 'aria-current="date"' : ""}
                aria-pressed="${batchSelected}"
                aria-label="${escapeHtml(`${formatCalendarDate(cell.date)}: ${analysis.score} od 100, ${analysis.level.label}${detail ? `, ${detail}` : ""}${plannedEvents.length ? `, ${plannedEvents.length} načrtovanih dogodkov` : ""}${hasConflicts ? ", opozorilo o prekrivanju terminov" : ""}`)}"
              >
                <span>${cell.day}</span>
                <span class="calendar-day-markers">${dayMarkers(analysis.events)}</span>
                ${plannedEvents.length ? `<span class="calendar-event-count"${firstProgram ? ` style="${calendarEventColorStyle(firstProgram)}"` : ""} aria-hidden="true">${plannedEvents.length}</span>` : ""}
              </button>`;
          })
          .join("")}
      </div>
    </section>`;
}

function renderQuarter(index, calendarState, helpers) {
  const startMonth = index * 3;
  const labels = ["Jan–Mar", "Apr–Jun", "Jul–Sep", "Okt–Dec"];
  return `
    <section class="calendar-quarter" aria-labelledby="calendar-quarter-${index + 1}">
      <header class="calendar-quarter-label">
        <strong id="calendar-quarter-${index + 1}">Q${index + 1}</strong>
        <span>${labels[index]}</span>
      </header>
      ${[0, 1, 2]
        .map((offset) => renderMonth(calendarMonth(calendarState.year, startMonth + offset, calendarState.filters, calendarState.events), calendarState, helpers))
        .join("")}
    </section>`;
}

function renderMonthlySchedule(calendarState, helpers) {
  const { escapeHtml, icon } = helpers;
  const monthIndex = Number.isInteger(calendarState.month) ? calendarState.month : 0;
  const month = calendarMonth(calendarState.year, monthIndex, calendarState.filters, calendarState.events);
  const today = todayCalendarDate();
  const selectedDates = new Set(calendarState.selectedDates || []);
  const cells = [...month.cells, ...Array(Math.max(0, 42 - month.cells.length)).fill(null)];

  return `
    <section class="calendar-monthly-view" aria-labelledby="calendar-monthly-title">
      <header class="calendar-monthly-heading">
        <div>
          <span>Urnik laboratorija</span>
          <h2 id="calendar-monthly-title">${escapeHtml(month.name)} ${calendarState.year}</h2>
        </div>
        <p>Programi in zasedenost po dnevih</p>
      </header>
      <div class="calendar-monthly-weekdays" aria-hidden="true">
        ${CALENDAR_WEEKDAYS.map((day) => `<span>${escapeHtml(day)}</span>`).join("")}
      </div>
      <div class="calendar-monthly-grid">
        ${cells.map((cell) => {
          if (!cell) return `<span class="calendar-monthly-day-empty" aria-hidden="true"></span>`;
          const analysis = cell.analysis;
          const plannedEvents = calendarEventsForDate(calendarState.events, cell.date);
          const visibleEvents = plannedEvents.slice(0, 2);
          const overflowCount = plannedEvents.length - visibleEvents.length;
          const conflicts = calendarEventConflictsForDate(calendarState.events, cell.date);
          const conflictEventIds = new Set(conflicts.flatMap((conflict) => conflict.eventIds));
          const selected = cell.date === calendarState.selectedDate;
          const batchSelected = selectedDates.has(cell.date);
          return `
            <button
              class="calendar-monthly-day level-${analysis.level.key}${analysis.weekend ? " is-weekend" : ""}${selected ? " is-selected" : ""}${batchSelected ? " is-batch-selected" : ""}${plannedEvents.length ? " has-planned-events" : ""}${overflowCount > 0 ? " has-overflow" : ""}${conflicts.length ? " has-conflicts" : ""}${cell.date === today ? " is-today" : ""}"
              type="button"
              data-calendar-date="${escapeHtml(cell.date)}"
              aria-pressed="${batchSelected}"
              ${selected ? 'aria-current="date"' : ""}
              aria-label="${escapeHtml(`${formatCalendarDate(cell.date)}${plannedEvents.length ? `, ${plannedEvents.length} dogodkov` : ", brez programov"}${conflicts.length ? ", opozorilo o prekrivanju terminov" : ""}`)}"
            >
              <span class="calendar-monthly-date"><strong>${cell.day}</strong>${dayMarkers(analysis.events)}</span>
              <span class="calendar-monthly-events">
                ${visibleEvents.length
                  ? visibleEvents.map((event) => {
                      if (event.kind === "important") {
                        return `<span class="calendar-monthly-event is-important"><small>${icon("flag")} Pomemben datum</small><strong>${escapeHtml(event.title)}</strong></span>`;
                      }
                      const occurrence = calendarEventOccurrence(event, cell.date);
                      return `<span
                        class="calendar-monthly-event${conflictEventIds.has(event.id) ? " has-conflict" : ""}"
                        style="${calendarEventColorStyle(event)}"
                        draggable="true"
                        data-calendar-event-id="${escapeHtml(event.id)}"
                        data-calendar-event-date="${escapeHtml(cell.date)}"
                        title="${conflictEventIds.has(event.id) ? "Opozorilo: termin se prekriva z drugim programom na isti lokaciji. " : ""}Povleci na drug dan. Za spremembo ure dvoklikni program."
                      >
                        <strong>${escapeHtml(event.title)}</strong>
                        <small><b>${escapeHtml(event.startTime)}–${escapeHtml(event.endTime)}</b>${occurrence.label ? `<i>${escapeHtml(occurrence.label)}</i>` : ""}</small>
                        <em>${escapeHtml(event.location)}</em>
                      </span>`;
                    }).join("")
                  : ""}
                ${overflowCount > 0 ? `<span class="calendar-monthly-overflow" data-calendar-open-day-view="${escapeHtml(cell.date)}">${icon("clock-3")} +${overflowCount} · Dnevni pogled</span>` : ""}
              </span>
            </button>`;
        }).join("")}
      </div>
    </section>`;
}

function renderSelectedDay(calendarState, helpers) {
  const { escapeHtml, icon } = helpers;
  const analysis = analyzeCalendarDate(calendarState.selectedDate, calendarState.filters, calendarState.events);
  const coverage = calendarCoverageForYear(calendarState.year);
  const selectedMonth = Number(calendarState.selectedDate.slice(5, 7)) - 1;
  const bestDays = bestCalendarDays(calendarState.year, selectedMonth, calendarState.filters, 3, calendarState.events);
  const reasons = analysis.reasons.length
    ? analysis.reasons
    : [{ id: "clear-day", title: "Ni zaznanih koledarskih ovir", category: "pattern", impact: 0 }];
  const plannedEvents = calendarEventsForDate(calendarState.events, calendarState.selectedDate);
  const conflicts = calendarEventConflictsForDate(calendarState.events, calendarState.selectedDate);
  const conflictEventIds = new Set(conflicts.flatMap((conflict) => conflict.eventIds));
  const conflictSummary = [...new Set(conflicts.map((conflict) => `${conflict.location} · ${conflict.startTime}–${conflict.endTime}`))].join("; ");

  return `
    <aside class="calendar-analysis" aria-label="Analiza izbranega dne">
      ${renderYearPlan(calendarState, helpers)}
      <section class="calendar-selected-day">
        <div class="calendar-selected-summary">
          <div>
            <p class="calendar-selected-date" title="${escapeHtml(formatCalendarDate(calendarState.selectedDate))}">${escapeHtml(formatCompactCalendarDate(calendarState.selectedDate))}</p>
            <span class="calendar-level-label level-${analysis.level.key}">${escapeHtml(analysis.level.label)}</span>
          </div>
          <div
            class="calendar-score score-${analysis.level.key}"
            role="meter"
            aria-label="Primernost izbranega dne: ${analysis.score} od 100, ${escapeHtml(analysis.level.label)}"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="${analysis.score}"
            style="--calendar-score: ${analysis.score};"
          >
            <svg class="calendar-score-gauge" viewBox="0 0 160 82" aria-hidden="true">
              <path class="calendar-score-gauge-track" pathLength="100" d="M 20 70 A 60 60 0 0 1 140 70"></path>
              <path class="calendar-score-gauge-value" pathLength="100" d="M 20 70 A 60 60 0 0 1 140 70"></path>
            </svg>
            <div class="calendar-score-value"><strong>${analysis.score}</strong><span>/ 100</span></div>
          </div>
        </div>
        <h3>Razlogi</h3>
        <ul class="calendar-reason-list">
          ${reasons
            .map(
              (reason) => `
                <li>
                  <span class="calendar-reason-icon reason-${escapeHtml(reason.category)}">${icon(reason.impact > 0 ? "sparkles" : reason.category === "holiday" ? "flag" : reason.category === "school" ? "backpack" : reason.category === "academic" ? "graduation-cap" : "calendar-range")}</span>
                  <span><strong>${escapeHtml(reason.title)}</strong><small>${escapeHtml(CATEGORY_LABELS[reason.category] || "Ocena")}${reason.estimated ? " · ocena" : ""}</small></span>
                </li>`
            )
            .join("")}
        </ul>
      </section>

      <section class="calendar-planned-events">
        <div class="calendar-section-heading">
          <h3>Dogodki na dan</h3>
          <span>${plannedEvents.length}</span>
        </div>
        ${conflicts.length ? `
          <div class="calendar-conflict-warning" role="alert">
            ${icon("triangle-alert")}
            <span><strong>Prekrivanje terminov</strong><small>${escapeHtml(conflictSummary)}</small></span>
          </div>` : ""}
        ${plannedEvents.length > 2 ? `<button class="calendar-open-day-view" type="button" data-calendar-open-day-view="${escapeHtml(calendarState.selectedDate)}">${icon("clock-3")}<span>Odpri dnevni urnik</span>${icon("chevron-right")}</button>` : ""}
        ${plannedEvents.length
          ? `<div class="calendar-event-list">
              ${plannedEvents.map((event) => `
                <article class="calendar-event-item${event.kind === "important" ? " is-important" : ""}${conflictEventIds.has(event.id) ? " has-conflict" : ""}"${event.kind === "program" ? ` style="${calendarEventColorStyle(event)}"` : ""}${conflictEventIds.has(event.id) ? ` title="Termin se prekriva z drugim programom na lokaciji ${escapeHtml(event.location)}."` : ""}>
                  <div class="calendar-event-time">${event.kind === "important" ? icon("flag") : `${escapeHtml(event.startTime)}–${escapeHtml(event.endTime)}`}</div>
                  <div class="calendar-event-copy">
                    <strong>${escapeHtml(event.title)}</strong>
                    <small>${event.kind === "important" ? `Pomemben datum · ${escapeHtml(HEATMAP_IMPACT_LABELS[event.heatmapImpact] || "Previdno")}` : `${escapeHtml(event.category)} · ${escapeHtml(event.location)}${event.capacity ? ` · ${event.capacity} mest` : ""}${event.ticketPriceCents ? ` · ${escapeHtml(formatTicketPrice(event.ticketPriceCents))}` : ""}`}</small>
                  </div>
                  <div class="calendar-event-actions">
                    <button type="button" data-calendar-edit-event="${escapeHtml(event.id)}" aria-label="Uredi ${escapeHtml(event.title)}" title="Uredi dogodek">${icon("pencil")}</button>
                    <button type="button" data-calendar-delete-event="${escapeHtml(event.id)}" aria-label="Izbriši ${escapeHtml(event.title)}" title="Izbriši dogodek">${icon("trash-2")}</button>
                  </div>
                </article>`).join("")}
            </div>`
          : `<p class="calendar-event-empty">Na ta dan še ni programov ali pomembnih datumov.</p>`}
      </section>

      <details class="calendar-sidebar-details calendar-best-days">
        <summary>${icon("sparkles")}<span>Najboljši dnevi v ${escapeHtml(CALENDAR_MONTHS[selectedMonth].toLowerCase())}</span>${icon("chevron-down")}</summary>
        <div class="calendar-sidebar-details-body">
          <ol>
            ${bestDays
              .map(
                (cell) => `
                  <li>
                    <button type="button" data-calendar-date="${escapeHtml(cell.date)}">
                      <span>${escapeHtml(formatCalendarDate(cell.date, { year: false }))}</span>
                      <strong>${cell.analysis.score} / 100</strong>
                    </button>
                  </li>`
              )
              .join("")}
          </ol>
        </div>
      </details>

      <details class="calendar-sidebar-details calendar-methodology">
        <summary>${icon("book-open")}<span>Viri in metodologija</span>${icon("chevron-down")}</summary>
        <div class="calendar-sidebar-details-body">
          <p>Uradni datumi so dopolnjeni z načrtovalnimi ocenami za mostove in običajna obdobja dopustov.</p>
          <p>${escapeHtml(coverage.description)}</p>
          <div class="calendar-source-links">
            ${CALENDAR_SOURCES.map(
              (source) => `<a href="${escapeHtml(source.href)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)} ${icon("external-link")}</a>`
            ).join("")}
          </div>
        </div>
      </details>

      <details class="calendar-sidebar-details calendar-legend">
        <summary>${icon("info")}<span>Legenda primernosti</span>${icon("chevron-down")}</summary>
        <div class="calendar-sidebar-details-body calendar-legend-items">
          <div><span class="legend-swatch level-recommended"></span><span>Priporočljivo</span><strong>78–100</strong></div>
          <div><span class="legend-swatch level-neutral"></span><span>Nevtralno</span><strong>58–77</strong></div>
          <div><span class="legend-swatch level-caution"></span><span>Previdno</span><strong>35–57</strong></div>
          <div><span class="legend-swatch level-avoid"></span><span>Odsvetovano</span><strong>0–34</strong></div>
        </div>
      </details>
    </aside>`;
}

function formatPlanNumber(value, maximumFractionDigits = 1) {
  return Number(value || 0).toLocaleString("sl-SI", { maximumFractionDigits });
}

function formatTicketPrice(cents) {
  return (Number(cents || 0) / 100).toLocaleString("sl-SI", {
    style: "currency",
    currency: "EUR"
  });
}

function slovenianCount(value, forms) {
  const absolute = Math.abs(Number(value) || 0);
  const lastTwo = absolute % 100;
  const form = lastTwo === 1
    ? forms[0]
    : lastTwo === 2
      ? forms[1]
      : lastTwo === 3 || lastTwo === 4
        ? forms[2]
        : forms[3];
  return `${formatPlanNumber(value, 0)} ${form}`;
}

function renderYearPlan(calendarState, helpers) {
  const { escapeHtml } = helpers;
  const statistics = calendarYearPlanStatistics(calendarState.events, calendarState.year);
  const participantValue = statistics.capacityDefinedCount
    ? formatPlanNumber(statistics.participantCapacity, 0)
    : "—";
  const participantImpactValue = statistics.participantCapacity
    ? `${formatPlanNumber(statistics.averageHoursPerParticipant)} h`
    : "—";
  return `
    <section class="calendar-year-plan" aria-labelledby="calendar-year-plan-title">
      <div class="calendar-section-heading calendar-year-plan-heading">
        <h2 id="calendar-year-plan-title">Letni načrt</h2>
        <span>${calendarState.year}</span>
      </div>
      <div class="calendar-plan-metrics">
        <div><strong>${formatPlanNumber(statistics.hours)}</strong><span>ur programa</span></div>
        <div><strong>${statistics.programCount}</strong><span>${slovenianCount(statistics.programCount, ["program", "programa", "programi", "programov"]).replace(/^\S+\s/, "")}</span></div>
        <div><strong>${statistics.occurrenceCount}</strong><span>${slovenianCount(statistics.occurrenceCount, ["termin", "termina", "termini", "terminov"]).replace(/^\S+\s/, "")}</span></div>
        <div><strong>${participantValue}</strong><span>${statistics.capacityDefinedCount ? slovenianCount(statistics.participantCapacity, ["predvideno mesto", "predvideni mesti", "predvidena mesta", "predvidenih mest"]).replace(/^\S+\s/, "") : "predvidenih mest"}</span></div>
      </div>
      <div class="calendar-participant-impact" title="Udeleženske ure so trajanje vseh terminov, pomnoženo s predvidenim številom udeležencev.">
        <div><span>Program na predvidenega udeleženca</span><strong>${participantImpactValue}</strong></div>
        <small>${statistics.participantCapacity ? `${formatPlanNumber(statistics.participantHours)} udeleženskih ur skupaj` : "Za izračun vnesi predvideno število udeležencev."}</small>
      </div>
      ${statistics.categories.length
        ? `<details class="calendar-plan-details">
            <summary><span>Podrobnosti načrta</span><strong>${slovenianCount(statistics.categories.length, ["kategorija", "kategoriji", "kategorije", "kategorij"])}</strong></summary>
            <div class="calendar-category-breakdown">
              ${statistics.categories.map((category) => {
                const share = statistics.hours ? Math.round((category.hours / statistics.hours) * 100) : 0;
                const capacity = category.capacityDefinedCount
                  ? ` · ${slovenianCount(category.participantCapacity, ["mesto", "mesti", "mesta", "mest"])}`
                  : "";
                return `
                  <div class="calendar-category-row" style="--category-share: ${share}%">
                    <div><strong>${escapeHtml(category.name)}</strong><span>${slovenianCount(category.programCount, ["program", "programa", "programi", "programov"])} · ${slovenianCount(category.occurrenceCount, ["termin", "termina", "termini", "terminov"])}${capacity}</span></div>
                    <strong>${formatPlanNumber(category.hours)} h</strong>
                    <span class="calendar-category-track"><i></i></span>
                  </div>`;
              }).join("")}
            </div>
            <div class="calendar-plan-footnote">
              <span>${statistics.busiestMonth ? `Največ ur: ${escapeHtml(CALENDAR_MONTHS[statistics.busiestMonth.monthIndex])} (${formatPlanNumber(statistics.busiestMonth.hours)} h)` : ""}</span>
              <span>${slovenianCount(statistics.locationCount, ["lokacija", "lokaciji", "lokacije", "lokacij"])}</span>
            </div>
            <p class="calendar-plan-method">Ure se seštevajo po terminih, predvidena mesta pa enkrat na program. Udeleženske ure so trajanje programa × predvidena mesta.</p>
          </details>`
        : `<p class="calendar-plan-empty">Dodaj prvi program in tukaj se bodo prikazale ure, termini ter razpoložljiva mesta.</p>`}
    </section>`;
}

function selectedDatesLabel(dates, escapeHtml) {
  const shown = dates.slice(0, 4).map((date) => formatCalendarDate(date, { year: false }));
  const more = dates.length > shown.length ? ` in še ${dates.length - shown.length}` : "";
  return escapeHtml(`${shown.join(", ")}${more}`);
}

function renderSelectionBar(calendarState, helpers) {
  const { escapeHtml, icon } = helpers;
  const dates = calendarState.selectedDates || [];
  if (!dates.length) return "";
  const countLabel = dates.length === 1 ? "1 izbran dan" : `${dates.length} izbranih dni`;
  return `
    <div class="calendar-selection-bar" role="status">
      <div>
        <strong>${escapeHtml(countLabel)}</strong>
        <span>${selectedDatesLabel(dates, escapeHtml)}</span>
      </div>
      <button class="button button-outline" type="button" data-calendar-clear-selection>${icon("x")}<span>Počisti</span></button>
      <button class="button button-outline" type="button" data-calendar-open-editor="important">${icon("flag")}<span>Pomemben datum</span></button>
      <button class="button button-solid" type="button" data-calendar-open-editor="program">${icon("calendar-plus")}<span>Dodaj program</span></button>
    </div>`;
}

function fieldError(editor, field, escapeHtml) {
  return editor.errors?.[field]
    ? `<span class="calendar-field-error">${escapeHtml(editor.errors[field])}</span>`
    : "";
}

function calendarTimeMinutes(value) {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : 0;
}

function calendarMinutesLabel(value) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function calendarDayTimeline(events) {
  const sorted = [...events].sort((left, right) => (
    calendarTimeMinutes(left.startTime) - calendarTimeMinutes(right.startTime)
    || calendarTimeMinutes(left.endTime) - calendarTimeMinutes(right.endTime)
  ));
  const earliest = Math.min(...sorted.map((event) => calendarTimeMinutes(event.startTime)));
  const latest = Math.max(...sorted.map((event) => calendarTimeMinutes(event.endTime)));
  const rangeStart = Math.floor(earliest / 60) * 60;
  const rangeEnd = Math.max(rangeStart + 60, Math.ceil(latest / 60) * 60);
  const pixelsPerHour = 64;
  const height = ((rangeEnd - rangeStart) / 60) * pixelsPerHour;
  const laneEnds = [];
  const positioned = sorted.map((event) => {
    const start = calendarTimeMinutes(event.startTime);
    const end = calendarTimeMinutes(event.endTime);
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = end;
    return {
      event,
      lane,
      top: ((start - rangeStart) / 60) * pixelsPerHour,
      height: Math.max(30, ((end - start) / 60) * pixelsPerHour)
    };
  });
  const laneCount = Math.max(1, laneEnds.length);
  const hours = Array.from(
    { length: (rangeEnd - rangeStart) / 60 + 1 },
    (_, index) => rangeStart + index * 60
  );

  return { earliest, latest, rangeStart, rangeEnd, height, laneCount, positioned, hours };
}

function renderDayScheduleModal(calendarState, helpers) {
  const { escapeHtml, icon } = helpers;
  const date = calendarState.dayViewDate;
  if (!date) return "";
  const events = calendarEventsForDate(calendarState.events, date);
  if (!events.length) return "";
  const importantDates = events.filter((event) => event.kind === "important");
  const programs = events.filter((event) => event.kind === "program");
  const timeline = programs.length ? calendarDayTimeline(programs) : null;

  return `
    <div class="modal-backdrop calendar-day-view-backdrop" data-calendar-close-day-view role="presentation">
      <section class="modal-window calendar-day-view-modal" role="dialog" aria-modal="true" aria-labelledby="calendar-day-view-title" data-modal-window>
        <header class="modal-header">
          <div>
            <p class="modal-eyebrow">Dnevni urnik · ${events.length} ${events.length === 1 ? "vnos" : events.length === 2 ? "vnosa" : "vnosi"}</p>
            <h2 class="modal-title" id="calendar-day-view-title">${escapeHtml(formatCalendarDate(date))}</h2>
          </div>
          <button class="button button-icon-only button-ghost" type="button" data-calendar-close-day-view aria-label="Zapri dnevni urnik">${icon("x")}</button>
        </header>
        <div class="modal-body calendar-day-view-body">
          ${importantDates.length ? `
            <section class="calendar-day-all-day" aria-labelledby="calendar-day-all-day-title">
              <h3 id="calendar-day-all-day-title">Pomembni datumi</h3>
              <div>
                ${importantDates.map((event) => `<button type="button" data-calendar-edit-event="${escapeHtml(event.id)}">${icon("flag")}<span>${escapeHtml(event.title)}</span></button>`).join("")}
              </div>
            </section>` : ""}
          ${timeline ? `
            <section class="calendar-day-timed" aria-labelledby="calendar-day-timed-title">
              <div class="calendar-day-timeline-heading">
                <h3 id="calendar-day-timed-title">Programi po urah</h3>
                <span>${calendarMinutesLabel(timeline.earliest)}–${calendarMinutesLabel(timeline.latest)}</span>
              </div>
              <div class="calendar-day-timeline" style="--timeline-height: ${timeline.height}px">
                <div class="calendar-day-time-axis" aria-hidden="true">
                  ${timeline.hours.map((hour, index) => `<span class="${index === 0 ? "is-first" : index === timeline.hours.length - 1 ? "is-last" : ""}" style="top: ${(hour - timeline.rangeStart) / 60 * 64}px">${calendarMinutesLabel(hour)}</span>`).join("")}
                </div>
                <div class="calendar-day-time-track">
                  ${timeline.hours.map((hour) => `<i class="calendar-day-hour-line" style="top: ${(hour - timeline.rangeStart) / 60 * 64}px" aria-hidden="true"></i>`).join("")}
                  ${timeline.positioned.map(({ event, lane, top, height }) => {
                    const occurrence = calendarEventOccurrence(event, date);
                    return `<button
                      class="calendar-day-time-event"
                      type="button"
                      data-calendar-edit-event="${escapeHtml(event.id)}"
                      data-calendar-timeline-lane="${lane}"
                      style="${calendarEventColorStyle(event)} --event-top: ${top}px; --event-height: ${height}px; --event-lane: ${lane}; --event-lanes: ${timeline.laneCount}"
                      aria-label="Uredi ${escapeHtml(event.title)}, ${escapeHtml(event.startTime)} do ${escapeHtml(event.endTime)}, ${escapeHtml(event.location)}"
                    >
                      <strong>${escapeHtml(event.title)}</strong>
                      <span>${escapeHtml(event.startTime)}–${escapeHtml(event.endTime)} · ${escapeHtml(event.location)}${occurrence.label ? ` · ${escapeHtml(occurrence.label)}` : ""}</span>
                    </button>`;
                  }).join("")}
                </div>
              </div>
            </section>` : ""}
        </div>
      </section>
    </div>`;
}

function renderEventChoiceField({ name, label, options, value, icon, escapeHtml }) {
  const selectedOption = options.includes(value);
  const customSelected = !selectedOption;
  const customColor = name === "category" ? calendarEventColorForCategory("") : null;
  return `
    <fieldset class="calendar-choice-field">
      <legend>${escapeHtml(label)} <b>*</b></legend>
      <div class="calendar-choice-options">
        ${options.map((option) => {
          const color = name === "category" ? calendarEventColorForCategory(option) : null;
          return `
          <label class="calendar-choice-option${color ? " has-category-color" : ""}"${color ? ` style="--choice-accent: ${color.accent}; --choice-fill: ${color.fill}"` : ""}>
            <input type="radio" name="${name}Preset" value="${escapeHtml(option)}" ${option === value ? "checked" : ""} data-calendar-choice-radio="${name}" />
            <span>${color ? `<i class="calendar-category-swatch" aria-hidden="true"></i>` : ""}${escapeHtml(option)}</span>
          </label>`;
        }).join("")}
        <label class="calendar-choice-option calendar-choice-custom-trigger${customColor ? " has-category-color" : ""}"${customColor ? ` style="--choice-accent: ${customColor.accent}; --choice-fill: ${customColor.fill}"` : ""}>
          <input type="radio" name="${name}Preset" value="custom" ${customSelected ? "checked" : ""} data-calendar-choice-radio="${name}" />
          <span>${customColor ? `<i class="calendar-category-swatch" aria-hidden="true"></i>` : ""}${icon("plus")} Drugo</span>
        </label>
      </div>
      <label class="calendar-custom-choice${customSelected ? "" : " is-hidden"}" data-calendar-custom-choice="${name}">
        <span>${name === "category" ? "Nova kategorija" : "Nova lokacija"}</span>
        <input class="input" name="${name}Custom" value="${customSelected ? escapeHtml(value) : ""}" autocomplete="off" />
      </label>
    </fieldset>`;
}

function renderEventEditor(calendarState, helpers) {
  const editor = calendarState.editor;
  if (!editor) return "";
  const { escapeHtml, icon } = helpers;
  const suggestions = calendarEventSuggestions(calendarState.events);
  const selectedDates = editor.selectedDates || [];
  const isRepeating = editor.recurrence !== "selected";
  const isImportant = editor.kind === "important";
  return `
    <div class="modal-backdrop calendar-event-backdrop" data-calendar-close-editor role="presentation">
      <section class="modal-window calendar-event-modal" role="dialog" aria-modal="true" aria-labelledby="calendar-event-modal-title" data-modal-window>
        <header class="modal-header">
          <div>
            <p class="modal-eyebrow">${isImportant ? "Interni koledar" : editor.id ? "Urejanje načrta" : "Nov načrt"}</p>
            <h2 class="modal-title" id="calendar-event-modal-title">${editor.id ? `Uredi ${isImportant ? "pomemben datum" : "program"}` : `Dodaj ${isImportant ? "pomemben datum" : "program"}`}</h2>
          </div>
          <button class="button button-icon-only button-ghost" type="button" data-calendar-close-editor aria-label="Zapri">${icon("x")}</button>
        </header>
        <form class="modal-body calendar-event-form" data-calendar-event-form novalidate>
          <div class="calendar-editor-date-summary">
            ${icon("calendar-days")}
            <span><strong>${selectedDates.length === 1 ? "1 izbran dan" : `${selectedDates.length} izbranih dni`}</strong><small>${selectedDatesLabel(selectedDates, escapeHtml)}</small></span>
          </div>
          ${fieldError(editor, "dates", escapeHtml)}
          ${fieldError(editor, "form", escapeHtml)}

          <label class="calendar-form-field calendar-form-field-wide">
            <span>${isImportant ? "Naziv pomembnega datuma" : "Naziv programa"} <b>*</b></span>
            <input class="input" name="title" value="${escapeHtml(editor.title)}" autocomplete="off" autofocus />
            ${fieldError(editor, "title", escapeHtml)}
          </label>

          ${isImportant ? `
            <div class="calendar-title-suggestions" aria-label="Pogosti pomembni datumi">
              ${CALENDAR_IMPORTANT_DATE_SUGGESTIONS.map((title) => `<button type="button" data-calendar-title-suggestion="${escapeHtml(title)}">${escapeHtml(title)}</button>`).join("")}
            </div>
            <fieldset class="calendar-impact-field">
              <legend>Vpliv na heatmap <b>*</b></legend>
              <div class="calendar-impact-options">
                ${CALENDAR_HEATMAP_IMPACTS.map((impact) => `
                  <label class="calendar-impact-option impact-${impact.value}">
                    <input type="radio" name="heatmapImpact" value="${impact.value}" ${editor.heatmapImpact === impact.value ? "checked" : ""} />
                    <span><strong>${escapeHtml(impact.label)}</strong><small>${escapeHtml(impact.description)}</small></span>
                  </label>`).join("")}
              </div>
            </fieldset>
            ${fieldError(editor, "heatmapImpact", escapeHtml)}
          ` : `
            ${renderEventChoiceField({
              name: "category",
              label: "Kategorija",
              options: suggestions.categories,
              value: editor.category,
              icon,
              escapeHtml
            })}
            ${fieldError(editor, "category", escapeHtml)}

            ${renderEventChoiceField({
              name: "location",
              label: "Lokacija",
              options: suggestions.locations,
              value: editor.location,
              icon,
              escapeHtml
            })}
            ${fieldError(editor, "location", escapeHtml)}

            <div class="calendar-form-grid calendar-time-grid">
              <label class="calendar-form-field">
                <span>Začetek <b>*</b></span>
                <input class="input" type="time" name="startTime" value="${escapeHtml(editor.startTime)}" />
                ${fieldError(editor, "startTime", escapeHtml)}
              </label>
              <label class="calendar-form-field">
                <span>Konec <b>*</b></span>
                <input class="input" type="time" name="endTime" value="${escapeHtml(editor.endTime)}" />
                ${fieldError(editor, "endTime", escapeHtml)}
              </label>
            </div>
            <div class="calendar-form-grid calendar-commercial-grid">
              <label class="calendar-form-field calendar-capacity-field">
                <span>Predvideno število udeležencev <small>neobvezno</small></span>
                <input class="input" type="number" name="capacity" value="${editor.capacity || ""}" min="1" step="1" inputmode="numeric" placeholder="npr. 12" />
                ${fieldError(editor, "capacity", escapeHtml)}
              </label>
              <label class="calendar-form-field calendar-ticket-price-field">
                <span>Predvidena cena vstopnice <small>neobvezno</small></span>
                <div class="calendar-price-input">
                  <input class="input" type="text" name="ticketPrice" value="${editor.ticketPriceCents ? escapeHtml((editor.ticketPriceCents / 100).toFixed(2).replace(".", ",")) : ""}" inputmode="decimal" placeholder="npr. 25,00" aria-label="Predvidena cena vstopnice v evrih" />
                  <span>€</span>
                </div>
                ${fieldError(editor, "ticketPrice", escapeHtml)}
              </label>
            </div>
          `}

          <fieldset class="calendar-repeat-box">
            <legend>Ponavljanje</legend>
            <div class="calendar-recurrence-options">
              ${CALENDAR_RECURRENCE_OPTIONS.map((option) => {
                const descriptions = {
                  selected: "Točno na izbrane datume",
                  daily: "Zaporedno do končnega datuma",
                  weekly: "Na izbrane dneve v tednu",
                  monthly: "Po istem vzorcu dneva"
                };
                return `
                  <label class="calendar-recurrence-option">
                    <input type="radio" name="recurrence" value="${option.value}" ${editor.recurrence === option.value ? "checked" : ""} data-calendar-recurrence />
                    <span><strong>${escapeHtml(option.label)}</strong><small>${escapeHtml(descriptions[option.value])}</small></span>
                  </label>`;
              }).join("")}
            </div>
            <label class="calendar-form-field calendar-recurrence-end${isRepeating ? "" : " is-hidden"}">
              <span>Ponavljaj do</span>
              <input class="input" type="date" name="recurrenceEnd" value="${escapeHtml(editor.recurrenceEnd)}" min="${escapeHtml(selectedDates[0] || "")}" ${isRepeating ? "" : "disabled"} />
              ${fieldError(editor, "recurrenceEnd", escapeHtml)}
            </label>
            <p class="calendar-repeat-hint" data-calendar-repeat-hint>${editor.recurrence === "monthly" ? "Vzorec temelji na izbranih datumih, na primer prvi ponedeljek v mesecu." : editor.recurrence === "weekly" ? "Ponavljajo se dnevi v tednu, ki si jih izbral na koledarju." : editor.recurrence === "daily" ? "Dogodek se doda na vsak dan do končnega datuma." : "Dogodek bo dodan samo na trenutno izbrane dni."}</p>
          </fieldset>

          <div class="modal-actions calendar-editor-actions">
            <button class="button button-outline" type="button" data-calendar-close-editor>Prekliči</button>
            <button class="button button-solid" type="submit">${icon("check")}<span>${editor.id ? "Shrani spremembe" : isImportant ? "Dodaj datum" : "Dodaj program"}</span></button>
          </div>
        </form>
      </section>
    </div>`;
}

function renderEventTypePicker(calendarState, helpers) {
  if (!calendarState.kindPickerOpen) return "";
  const { escapeHtml, icon } = helpers;
  const selectedDates = calendarState.selectedDates || [];
  return `
    <div class="modal-backdrop calendar-kind-picker-backdrop" data-calendar-close-kind-picker role="presentation">
      <section class="modal-window calendar-kind-picker" role="dialog" aria-modal="true" aria-labelledby="calendar-kind-picker-title" data-modal-window>
        <header class="modal-header">
          <div>
            <p class="modal-eyebrow">${selectedDatesLabel(selectedDates, escapeHtml)}</p>
            <h2 class="modal-title" id="calendar-kind-picker-title">Kaj želiš dodati?</h2>
          </div>
          <button class="button button-icon-only button-ghost" type="button" data-calendar-close-kind-picker aria-label="Zapri">${icon("x")}</button>
        </header>
        <div class="modal-body calendar-kind-options">
          <button type="button" data-calendar-pick-kind="program">
            ${icon("calendar-plus")}
            <span><strong>Program</strong><small>Dogodek z uro, kategorijo in lokacijo</small></span>
            ${icon("chevron-right")}
          </button>
          <button type="button" data-calendar-pick-kind="important">
            ${icon("flag")}
            <span><strong>Pomemben datum</strong><small>Interni datum, ki vpliva na heatmap</small></span>
            ${icon("chevron-right")}
          </button>
        </div>
      </section>
    </div>`;
}

function renderEventDeleteConfirm(calendarState, helpers) {
  const { escapeHtml, icon } = helpers;
  const event = calendarState.events.find((item) => item.id === calendarState.deleteConfirmId);
  if (!event) return "";
  return `
    <div class="modal-backdrop delete-modal-backdrop" data-calendar-cancel-delete role="presentation">
      <section class="modal-window delete-modal" role="dialog" aria-modal="true" aria-labelledby="calendar-delete-title" data-modal-window>
        <header class="modal-header">
          <h2 class="modal-title" id="calendar-delete-title">Izbrišem dogodek?</h2>
          <button class="button button-icon-only button-ghost" type="button" data-calendar-cancel-delete aria-label="Prekliči brisanje">${icon("x")}</button>
        </header>
        <div class="modal-body delete-modal-body">
          <p>Dogodek <strong>${escapeHtml(event.title)}</strong> bo odstranjen z vseh ${event.dates.length} načrtovanih datumov.</p>
          <p class="delete-warning">Tega ni mogoče razveljaviti.</p>
          <div class="modal-actions">
            <button class="button button-outline" type="button" data-calendar-cancel-delete>Prekliči</button>
            <button class="button button-solid button-danger" type="button" data-calendar-confirm-delete>Izbriši dogodek</button>
          </div>
        </div>
      </section>
    </div>`;
}

export function renderCalendarWorkspace({
  calendarState,
  disabledAttr,
  renderEvidenceTabs,
  icon,
  escapeHtml
}) {
  const helpers = { icon, escapeHtml };
  const coverage = calendarCoverageForYear(calendarState.year);
  const activeFilterCount = CALENDAR_FILTERS.filter((filter) => calendarState.filters[filter.key]).length;
  const monthlyView = calendarState.viewMode === "month";
  const monthIndex = Number.isInteger(calendarState.month) ? calendarState.month : 0;
  const periodLabel = monthlyView
    ? `${CALENDAR_MONTHS[monthIndex]} ${calendarState.year}`
    : `Koledar programov ${calendarState.year}`;
  return `
    <main class="app-shell evidence-shell evidence-calendar">
      <div class="app-topbar">
        <header class="toolbar">
          <div class="brand">
            <div class="brand-mark">${icon("folders")}</div>
            <div class="brand-copy">
              <div class="brand-title">Center Rog evidence</div>
              <div class="brand-subtitle">
                <span class="save-state-pill save-state-saved">${monthlyView ? "MESEČNI URNIK" : "LETNI PREGLED"}</span>
                <span>${escapeHtml(periodLabel)}</span>
              </div>
            </div>
          </div>
        </header>
        ${renderEvidenceTabs("calendar", disabledAttr)}
      </div>

      <section class="calendar-workspace" id="evidence-workspace" data-calendar-clear-area>
        <div class="calendar-surface${calendarState.heatmapVisible === false ? " is-heatmap-hidden" : ""}${monthlyView ? " is-monthly-view" : ""}">
          <div class="calendar-print-heading">
            <div><strong>Koledar programov ${calendarState.year}</strong><span>Center Rog · Osrednjeslovenska regija</span></div>
            <span>${escapeHtml(coverage.label)}</span>
          </div>
          <header class="calendar-header">
            <div class="calendar-heading-controls">
              <div class="calendar-title-block">
                <h1>Koledar programov</h1>
                <span>Osrednjeslovenska regija · ${escapeHtml(coverage.label)}</span>
              </div>
              <div class="calendar-mode-control" role="group" aria-label="Pogled koledarja">
                <button type="button" data-calendar-view-mode="year" aria-pressed="${!monthlyView}" class="${monthlyView ? "" : "is-active"}">${icon("calendar-days")}<span>Letno</span></button>
                <button type="button" data-calendar-view-mode="month" aria-pressed="${monthlyView}" class="${monthlyView ? "is-active" : ""}">${icon("calendar")}<span>Mesečno</span></button>
              </div>
              <div class="calendar-year-control" aria-label="Izberi leto">
                <button type="button" data-calendar-year-step="-1" aria-label="Prejšnje leto" ${calendarState.year <= CALENDAR_YEAR_MIN ? "disabled" : ""}>${icon("chevron-left")}</button>
                <span class="calendar-year-label" aria-live="polite">${calendarState.year}</span>
                <button type="button" data-calendar-year-step="1" aria-label="Naslednje leto" ${calendarState.year >= CALENDAR_YEAR_MAX ? "disabled" : ""}>${icon("chevron-right")}</button>
                <button class="calendar-today-button" type="button" data-calendar-today>Danes</button>
              </div>
              ${monthlyView ? `
                <div class="calendar-month-control" aria-label="Izberi mesec">
                  <button type="button" data-calendar-month-step="-1" aria-label="Prejšnji mesec" ${calendarState.year === CALENDAR_YEAR_MIN && monthIndex === 0 ? "disabled" : ""}>${icon("chevron-left")}</button>
                  <span class="calendar-month-label" aria-live="polite">${escapeHtml(CALENDAR_MONTHS[monthIndex])}</span>
                  <button type="button" data-calendar-month-step="1" aria-label="Naslednji mesec" ${calendarState.year === CALENDAR_YEAR_MAX && monthIndex === 11 ? "disabled" : ""}>${icon("chevron-right")}</button>
                </div>` : ""}
            </div>
            <div class="calendar-toolbar">
              <div class="calendar-view-controls" role="toolbar" aria-label="Orodja koledarja">
                <button class="button button-outline calendar-tool-button calendar-heatmap-toggle${calendarState.heatmapVisible === false ? "" : " is-active"}" type="button" data-calendar-heatmap-toggle aria-pressed="${calendarState.heatmapVisible === false ? "false" : "true"}" aria-label="Vključi ali izključi heatmap" title="Vključi ali izključi barvno oceno primernosti dni" data-tooltip="Heatmap">
                  ${icon("flame")}
                </button>
                <button class="button button-outline calendar-tool-button calendar-select-days-button${calendarState.selectionMode ? " is-active" : ""}" type="button" data-calendar-selection-mode aria-pressed="${Boolean(calendarState.selectionMode)}" aria-label="Izberi dneve" title="Izberi več dni; na računalniku lahko uporabiš tudi Shift" data-tooltip="Izberi dneve">
                  ${icon(calendarState.selectionMode ? "mouse-pointer-2" : "calendar-plus")}
                </button>
                <button class="button button-outline calendar-tool-button calendar-export-pdf-button" type="button" data-calendar-export-pdf data-busy-sensitive title="Izvozi ${monthlyView ? "mesečni urnik kot PDF A4 ležeče" : "letni koledar kot PDF A4 pokončno"}" aria-label="Izvozi koledar kot PDF" data-tooltip="Izvozi PDF">
                  ${icon("file-down")}
                </button>
                <button class="button button-outline calendar-tool-button calendar-export-asana-button" type="button" data-calendar-export-asana data-busy-sensitive title="Izvozi načrtovane programe v CSV za uvoz v Asano" aria-label="Izvozi koledar za Asano" data-tooltip="Asana CSV">
                  <span class="calendar-asana-mark" aria-hidden="true"><i></i><i></i><i></i></span>
                </button>
              </div>
              <details class="calendar-filter-menu" data-calendar-filter-menu ${calendarState.filterMenuOpen ? "open" : ""}>
                <summary aria-label="Viri ocene" title="Izberi koledarske vire, vključene v oceno primernosti">
                  ${icon("list-filter")}
                  <span>Viri ocene</span>
                  <strong>${activeFilterCount}/${CALENDAR_FILTERS.length}</strong>
                  ${icon("chevron-down")}
                </summary>
                <div class="calendar-filters" aria-label="Viri, vključeni v oceno">
                  ${CALENDAR_FILTERS.map(
                    (filter) => `
                      <label>
                        <input type="checkbox" data-calendar-filter="${escapeHtml(filter.key)}" ${calendarState.filters[filter.key] ? "checked" : ""} />
                        <span>${escapeHtml(filter.label)}</span>
                      </label>`
                  ).join("")}
                </div>
              </details>
            </div>
          </header>

          ${renderSelectionBar(calendarState, helpers)}

          <div class="calendar-layout">
            ${monthlyView
              ? renderMonthlySchedule(calendarState, helpers)
              : `<div class="calendar-year-grid">${[0, 1, 2, 3].map((quarter) => renderQuarter(quarter, calendarState, helpers)).join("")}</div>`}
            ${renderSelectedDay(calendarState, helpers)}
          </div>
        </div>
      </section>
      ${renderEventTypePicker(calendarState, helpers)}
      ${renderDayScheduleModal(calendarState, helpers)}
      ${renderEventEditor(calendarState, helpers)}
      ${renderEventDeleteConfirm(calendarState, helpers)}
    </main>`;
}
