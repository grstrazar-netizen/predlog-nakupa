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
  calendarYearSummary,
  formatCalendarDate,
  todayCalendarDate
} from "./calendar-planner.js";
import {
  CALENDAR_RECURRENCE_OPTIONS,
  CALENDAR_HEATMAP_IMPACTS,
  CALENDAR_IMPORTANT_DATE_SUGGESTIONS,
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

function dayMarkers(events) {
  const categories = [...new Set(events.map((item) => item.category))]
    .sort((left, right) => Number(right === "internal") - Number(left === "internal"));
  return categories
    .slice(0, 3)
    .map((category) => `<span class="calendar-day-marker marker-${category}" aria-hidden="true"></span>`)
    .join("");
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
            const analysis = cell.analysis;
            const detail = analysis.reasons.map((item) => item.title).join(", ");
            return `
              <button
                class="calendar-day level-${analysis.level.key}${analysis.weekend ? " is-weekend" : ""}${selected ? " is-selected" : ""}${batchSelected ? " is-batch-selected" : ""}${plannedEvents.length ? " has-planned-events" : ""}${cell.date === today ? " is-today" : ""}"
                type="button"
                data-calendar-date="${escapeHtml(cell.date)}"
                ${selected ? 'aria-current="date"' : ""}
                aria-pressed="${batchSelected}"
                aria-label="${escapeHtml(`${formatCalendarDate(cell.date)}: ${analysis.score} od 100, ${analysis.level.label}${detail ? `, ${detail}` : ""}${plannedEvents.length ? `, ${plannedEvents.length} načrtovanih dogodkov` : ""}`)}"
              >
                <span>${cell.day}</span>
                <span class="calendar-day-markers">${dayMarkers(analysis.events)}</span>
                ${plannedEvents.length ? `<span class="calendar-event-count" aria-hidden="true">${plannedEvents.length}</span>` : ""}
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

  return `
    <aside class="calendar-analysis" aria-label="Analiza izbranega dne">
      ${renderYearPlan(calendarState, helpers)}
      <section class="calendar-legend" aria-labelledby="calendar-legend-title">
        <h2 id="calendar-legend-title">Primernost termina</h2>
        <div><span class="legend-swatch level-recommended"></span><span>Priporočljivo</span><strong>78–100</strong></div>
        <div><span class="legend-swatch level-neutral"></span><span>Nevtralno</span><strong>58–77</strong></div>
        <div><span class="legend-swatch level-caution"></span><span>Previdno</span><strong>35–57</strong></div>
        <div><span class="legend-swatch level-avoid"></span><span>Odsvetovano</span><strong>0–34</strong></div>
      </section>

      <section class="calendar-selected-day">
        <p class="calendar-selected-date">${escapeHtml(formatCalendarDate(calendarState.selectedDate))}</p>
        <div class="calendar-score score-${analysis.level.key}">
          <strong>${analysis.score}</strong><span>/ 100</span>
        </div>
        <span class="calendar-level-label level-${analysis.level.key}">${escapeHtml(analysis.level.label)}</span>
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
          <h3>Dogodki in pomembni datumi</h3>
          <span>${plannedEvents.length}</span>
        </div>
        ${plannedEvents.length
          ? `<div class="calendar-event-list">
              ${plannedEvents.map((event) => `
                <article class="calendar-event-item${event.kind === "important" ? " is-important" : ""}">
                  <div class="calendar-event-time">${event.kind === "important" ? icon("flag") : `${escapeHtml(event.startTime)}–${escapeHtml(event.endTime)}`}</div>
                  <div class="calendar-event-copy">
                    <strong>${escapeHtml(event.title)}</strong>
                    <small>${event.kind === "important" ? `Pomemben datum · ${escapeHtml(HEATMAP_IMPACT_LABELS[event.heatmapImpact] || "Previdno")}` : `${escapeHtml(event.category)} · ${escapeHtml(event.location)}${event.capacity ? ` · ${event.capacity} mest` : ""}`}</small>
                  </div>
                  <div class="calendar-event-actions">
                    <button type="button" data-calendar-edit-event="${escapeHtml(event.id)}" aria-label="Uredi ${escapeHtml(event.title)}" title="Uredi dogodek">${icon("pencil")}</button>
                    <button type="button" data-calendar-delete-event="${escapeHtml(event.id)}" aria-label="Izbriši ${escapeHtml(event.title)}" title="Izbriši dogodek">${icon("trash-2")}</button>
                  </div>
                </article>`).join("")}
            </div>`
          : `<p class="calendar-event-empty">Na ta dan še ni programov ali pomembnih datumov.</p>`}
      </section>

      <section class="calendar-best-days">
        <h3>Najboljši dnevi v ${escapeHtml(CALENDAR_MONTHS[selectedMonth].toLowerCase())}</h3>
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
      </section>

      <section class="calendar-methodology">
        <h3>Viri in metodologija</h3>
        <p>Uradni datumi so dopolnjeni z načrtovalnimi ocenami za mostove in običajna obdobja dopustov.</p>
        <p>${escapeHtml(coverage.description)}</p>
        <div class="calendar-source-links">
          ${CALENDAR_SOURCES.map(
            (source) => `<a href="${escapeHtml(source.href)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)} ${icon("external-link")}</a>`
          ).join("")}
        </div>
      </section>
    </aside>`;
}

function formatPlanNumber(value, maximumFractionDigits = 1) {
  return Number(value || 0).toLocaleString("sl-SI", { maximumFractionDigits });
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
  return `
    <section class="calendar-year-plan" aria-labelledby="calendar-year-plan-title">
      <div class="calendar-section-heading calendar-year-plan-heading">
        <h2 id="calendar-year-plan-title">Letni načrt programov</h2>
        <span>${calendarState.year}</span>
      </div>
      <div class="calendar-plan-metrics">
        <div><strong>${formatPlanNumber(statistics.hours)}</strong><span>ur programa</span></div>
        <div><strong>${statistics.programCount}</strong><span>${slovenianCount(statistics.programCount, ["program", "programa", "programi", "programov"]).replace(/^\S+\s/, "")}</span></div>
        <div><strong>${statistics.occurrenceCount}</strong><span>${slovenianCount(statistics.occurrenceCount, ["termin", "termina", "termini", "terminov"]).replace(/^\S+\s/, "")}</span></div>
        <div><strong>${participantValue}</strong><span>${statistics.capacityDefinedCount ? slovenianCount(statistics.participantCapacity, ["predvideno mesto", "predvideni mesti", "predvidena mesta", "predvidenih mest"]).replace(/^\S+\s/, "") : "predvidenih mest"}</span></div>
      </div>
      ${statistics.categories.length
        ? `<div class="calendar-category-breakdown">
            <h3>Ure po kategorijah</h3>
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
          </div>`
        : `<p class="calendar-plan-empty">Dodaj prvi program in tukaj se bodo prikazale ure, termini ter razpoložljiva mesta.</p>`}
      <p class="calendar-plan-method">Ure se seštevajo po terminih, predvidena mesta pa enkrat na program.</p>
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

function renderEventChoiceField({ name, label, options, value, icon, escapeHtml }) {
  const selectedOption = options.includes(value);
  const customSelected = !selectedOption;
  return `
    <fieldset class="calendar-choice-field">
      <legend>${escapeHtml(label)} <b>*</b></legend>
      <div class="calendar-choice-options">
        ${options.map((option, index) => `
          <label class="calendar-choice-option">
            <input type="radio" name="${name}Preset" value="${escapeHtml(option)}" ${option === value ? "checked" : ""} data-calendar-choice-radio="${name}" />
            <span>${escapeHtml(option)}</span>
          </label>`).join("")}
        <label class="calendar-choice-option calendar-choice-custom-trigger">
          <input type="radio" name="${name}Preset" value="custom" ${customSelected ? "checked" : ""} data-calendar-choice-radio="${name}" />
          <span>${icon("plus")} Drugo</span>
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
            <label class="calendar-form-field calendar-capacity-field">
              <span>Predvideno število udeležencev <small>neobvezno</small></span>
              <input class="input" type="number" name="capacity" value="${editor.capacity || ""}" min="1" step="1" inputmode="numeric" placeholder="npr. 12" />
              ${fieldError(editor, "capacity", escapeHtml)}
            </label>
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
  const summary = calendarYearSummary(calendarState.year, calendarState.filters, calendarState.events);
  const coverage = calendarCoverageForYear(calendarState.year);
  const yearOptions = Array.from(
    { length: CALENDAR_YEAR_MAX - CALENDAR_YEAR_MIN + 1 },
    (_, index) => CALENDAR_YEAR_MIN + index
  );
  return `
    <main class="app-shell evidence-shell evidence-calendar">
      <div class="app-topbar">
        <header class="toolbar">
          <div class="brand">
            <div class="brand-mark">${icon("folders")}</div>
            <div class="brand-copy">
              <div class="brand-title">Center Rog evidence</div>
              <div class="brand-subtitle">
                <span class="save-state-pill save-state-saved">LETNI PREGLED</span>
                <span>Koledar programov ${calendarState.year}</span>
              </div>
            </div>
          </div>
        </header>
        ${renderEvidenceTabs("calendar", disabledAttr)}
      </div>

      <section class="calendar-workspace" id="evidence-workspace" data-calendar-clear-area>
        <div class="calendar-surface${calendarState.heatmapVisible === false ? " is-heatmap-hidden" : ""}">
          <div class="calendar-print-heading">
            <div><strong>Koledar programov ${calendarState.year}</strong><span>Center Rog · Osrednjeslovenska regija</span></div>
            <span>${escapeHtml(coverage.label)}</span>
          </div>
          <header class="calendar-header">
            <div class="calendar-title-block">
              <h1>Koledar programov</h1>
              <span>Osrednjeslovenska regija · ${escapeHtml(coverage.label)}</span>
            </div>
            <div class="calendar-year-control" aria-label="Izberi leto">
              <button type="button" data-calendar-year-step="-1" aria-label="Prejšnje leto" ${calendarState.year <= CALENDAR_YEAR_MIN ? "disabled" : ""}>${icon("chevron-left")}</button>
              <select data-calendar-year-select aria-label="Leto">
                ${yearOptions.map((year) => `<option value="${year}" ${year === calendarState.year ? "selected" : ""}>${year}</option>`).join("")}
              </select>
              <button type="button" data-calendar-year-step="1" aria-label="Naslednje leto" ${calendarState.year >= CALENDAR_YEAR_MAX ? "disabled" : ""}>${icon("chevron-right")}</button>
              <button class="calendar-today-button" type="button" data-calendar-today>Danes</button>
            </div>
            <div class="calendar-view-controls">
              <button class="button button-outline calendar-heatmap-toggle${calendarState.heatmapVisible === false ? "" : " is-active"}" type="button" data-calendar-heatmap-toggle aria-pressed="${calendarState.heatmapVisible === false ? "false" : "true"}" title="Prikaži ali skrij barvno oceno primernosti dni.">
                ${icon("layout-grid")}
                <span>Heatmap</span>
              </button>
              <button class="button button-outline calendar-select-days-button${calendarState.selectionMode ? " is-active" : ""}" type="button" data-calendar-selection-mode aria-pressed="${Boolean(calendarState.selectionMode)}" title="Na računalniku lahko več dni izbereš tudi s tipko Shift.">
                ${icon(calendarState.selectionMode ? "mouse-pointer-2" : "calendar-plus")}
                <span>${calendarState.selectionMode ? "Izbiranje vključeno" : "Izberi dneve"}</span>
              </button>
              <button class="button button-outline calendar-export-pdf-button" type="button" data-calendar-export-pdf data-busy-sensitive title="Izvozi letni koledar kot PDF A4 pokončno." aria-label="Izvozi koledar kot PDF">
                ${icon("download")}
                <span>Izvozi PDF</span>
              </button>
              <button class="button button-outline calendar-export-asana-button" type="button" data-calendar-export-asana data-busy-sensitive title="Izvozi načrtovane programe v CSV za uvoz v Asano." aria-label="Izvozi koledar za Asano">
                ${icon("file-spreadsheet")}
                <span>Asana CSV</span>
              </button>
            </div>
            <div class="calendar-filters" aria-label="Viri, vključeni v oceno">
              ${CALENDAR_FILTERS.map(
                (filter) => `
                  <label>
                    <input type="checkbox" data-calendar-filter="${escapeHtml(filter.key)}" ${calendarState.filters[filter.key] ? "checked" : ""} />
                    <span>${escapeHtml(filter.label)}</span>
                  </label>`
              ).join("")}
            </div>
            <div class="calendar-summary" aria-label="Povzetek leta">
              <span><strong>${summary.recommended}</strong> priporočljivih</span>
              <span><strong>${summary.caution}</strong> tveganih</span>
              <span><strong>${summary.themes}</strong> tematskih</span>
            </div>
          </header>

          ${renderSelectionBar(calendarState, helpers)}

          <div class="calendar-layout">
            <div class="calendar-year-grid">
              ${[0, 1, 2, 3].map((quarter) => renderQuarter(quarter, calendarState, helpers)).join("")}
            </div>
            ${renderSelectedDay(calendarState, helpers)}
          </div>
        </div>
      </section>
      ${renderEventTypePicker(calendarState, helpers)}
      ${renderEventEditor(calendarState, helpers)}
      ${renderEventDeleteConfirm(calendarState, helpers)}
    </main>`;
}
