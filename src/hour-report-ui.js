import {
  formatHours,
  hourReportBreakdown,
  hourReportMonthLabel,
  hourReportTotals,
  hourRowAmountCents,
  hoursInputValue
} from "./hour-report.js";

function moneyInput(cents) {
  return (Number(cents || 0) / 100).toLocaleString("sl-SI", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function reportTable(report, { escapeHtml, formatCurrency, icon }) {
  return `
    <div class="hour-report-table-wrap">
      <table class="hour-report-table">
        <colgroup>
          <col class="hour-col-date" />
          <col class="hour-col-time" />
          <col class="hour-col-time" />
          <col class="hour-col-type" />
          <col class="hour-col-description" />
          <col class="hour-col-hours" />
          <col class="hour-col-rate" />
          <col class="hour-col-amount" />
        </colgroup>
        <thead>
          <tr>
            <th>Datum</th>
            <th>Začetek</th>
            <th>Konec</th>
            <th>Tip dela</th>
            <th>Opis izmene</th>
            <th>Ur</th>
            <th>Postavka</th>
            <th>Znesek</th>
          </tr>
        </thead>
        <tbody>
          ${report.rows
            .map(
              (row) => `
                <tr data-hour-row="${escapeHtml(row.id)}">
                  <td>
                    <input class="hour-cell-input" type="date" data-hour-row-field="date" value="${escapeHtml(row.date)}" aria-label="Datum izmene" />
                  </td>
                  <td>
                    <input class="hour-cell-input hour-time-input" type="time" data-hour-row-field="startTime" value="${escapeHtml(row.startTime)}" aria-label="Ura začetka" />
                  </td>
                  <td>
                    <input class="hour-cell-input hour-time-input" type="time" data-hour-row-field="endTime" value="${escapeHtml(row.endTime)}" aria-label="Ura konca" />
                  </td>
                  <td>
                    <input class="hour-cell-input" data-hour-row-field="workType" value="${escapeHtml(row.workType)}" aria-label="Tip dela" />
                  </td>
                  <td>
                    <textarea class="hour-cell-input hour-description-input" rows="1" data-hour-row-field="shiftDescription" aria-label="Opis izmene">${escapeHtml(row.shiftDescription)}</textarea>
                  </td>
                  <td>
                    <input class="hour-cell-input hour-number-input" inputmode="decimal" data-hour-row-field="hours" value="${escapeHtml(hoursInputValue(row.hours))}" aria-label="Skupno število ur" />
                  </td>
                  <td>
                    <input class="hour-cell-input hour-number-input" inputmode="decimal" data-hour-row-field="rateCents" value="${escapeHtml(moneyInput(row.rateCents))}" aria-label="Urna postavka" />
                  </td>
                  <td>
                    <span class="hour-amount-cell">
                      <strong>${escapeHtml(formatCurrency(hourRowAmountCents(row)))}</strong>
                      <button class="hour-reset-row" type="button" data-reset-hour-row="${escapeHtml(row.id)}" title="Ponastavi uvožene ure in postavko" aria-label="Ponastavi vrstico">
                        ${icon("rotate-ccw")}
                      </button>
                    </span>
                  </td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function reportSummary(report, { escapeHtml, formatCurrency }) {
  const totals = hourReportTotals(report);
  const breakdown = hourReportBreakdown(report);
  return `
    <section class="hour-report-summary">
      <div class="hour-report-total-block">
        <h2>SKUPAJ</h2>
        <dl>
          <div><dt>Opravljene ure</dt><dd>${escapeHtml(formatHours(totals.workedHours))}</dd></div>
          <div><dt>Bonus ure</dt><dd>${escapeHtml(formatHours(totals.bonusHours))} · ${escapeHtml(formatCurrency(totals.bonusHoursCents))}</dd></div>
          <div><dt>Fiksni bonus</dt><dd>${escapeHtml(formatCurrency(totals.fixedBonusCents))}</dd></div>
          <div><dt>Skupno ur</dt><dd>${escapeHtml(formatHours(totals.totalHours))}</dd></div>
          <div class="hour-report-grand-total"><dt>Skupni znesek za izplačilo</dt><dd>${escapeHtml(formatCurrency(totals.totalCents))}</dd></div>
        </dl>
      </div>
      <div class="hour-report-breakdown">
        <h2>RAZČLENITEV UR IN STROŠKOV</h2>
        ${
          breakdown.length
            ? breakdown
                .map(
                  (type) => `
                    <div class="hour-breakdown-type">
                      <div class="hour-breakdown-line">
                        <strong>${escapeHtml(type.label)}</strong>
                        <strong>${escapeHtml(formatHours(type.hours))} · ${escapeHtml(formatCurrency(type.cents))}</strong>
                      </div>
                      ${type.descriptions
                        .map(
                          (description) => `
                            <div class="hour-breakdown-line hour-breakdown-description">
                              <span>${escapeHtml(description.label)}</span>
                              <span>${escapeHtml(formatHours(description.hours))} · ${escapeHtml(formatCurrency(description.cents))}</span>
                            </div>
                          `
                        )
                        .join("")}
                    </div>
                  `
                )
                .join("")
            : `<p class="empty-text">Razčlenitev bo prikazana po uvozu izmen.</p>`
        }
      </div>
    </section>
  `;
}

function reportPage(report, helpers) {
  const { escapeHtml } = helpers;
  return `
    <article class="paper hour-report-paper" aria-label="Poročilo ur za ${escapeHtml(report.personName)}">
      <header class="hour-report-header">
        <span class="hour-report-brand">CENTER ROG</span>
        <h1>POROČILO O OPRAVLJENIH URAH</h1>
      </header>
      <div class="hour-report-person">
        <span>Mentor/mentorica: <strong>${escapeHtml(report.personName)}</strong></span>
        <span>Obdobje: <strong>${escapeHtml(hourReportMonthLabel(report))}</strong></span>
      </div>
      ${reportTable(report, helpers)}
      ${reportSummary(report, helpers)}
      <footer class="hour-report-signature">
        <span>Podpis vodje laboratorija</span>
        <span class="hour-report-signature-line" aria-hidden="true"></span>
      </footer>
    </article>
  `;
}

function emptyPage({ icon }) {
  return `
    <section class="hour-report-empty">
      <span class="hour-report-empty-icon">${icon("file-spreadsheet")}</span>
      <h1>Poročila ur</h1>
      <p class="hour-report-empty-intro">Iz Connecteama pripravi izvoz ur, nato ga tukaj pretvori v ločena mesečna poročila.</p>
      <ol class="hour-report-import-steps">
        <li><strong>Odpri</strong> Connecteam.</li>
        <li><strong>Izberi</strong> razdelek <span lang="en">Schedule</span> in preklopi prikaz na <span lang="en">List view</span>.</li>
        <li><strong>Nastavi</strong> obdobje, za katero potrebuješ poročila o opravljenih urah.</li>
        <li><strong>Izvozi</strong> prikazane izmene kot datoteko XLSX.</li>
        <li><strong>Uvozi</strong> datoteko sem. Aplikacija bo za vsako osebo in mesec pripravila ločeno poročilo.</li>
        <li><strong>Preglej</strong> pripravljene tabele ter po potrebi popravi tip dela, opis izmene, ure ali postavko.</li>
      </ol>
      <button class="button button-solid" type="button" data-action="import-hours">
        ${icon("file-up")} Uvozi XLSX
      </button>
    </section>
  `;
}

function reportList(batch, selectedReport, { escapeHtml, formatCurrency, icon }) {
  return `
    <section class="panel">
      <div class="panel-header">
        <span class="panel-icon">${icon("users")}</span>
        <span class="panel-title">Najdene osebe in meseci</span>
      </div>
      <div class="panel-body">
        <p class="hour-import-file">${escapeHtml(batch.fileName)}</p>
        <div class="hour-report-list">
          ${batch.reports
            .map((report) => {
              const totals = hourReportTotals(report);
              return `
                <div class="hour-report-list-row${report.id === selectedReport?.id ? " is-active" : ""}">
                  <label class="hour-report-include" title="Vključi v skupni PDF in ZIP">
                    <input type="checkbox" data-hour-report-included="${escapeHtml(report.id)}" ${report.included ? "checked" : ""} />
                    <span class="sr-only">Vključi ${escapeHtml(report.personName)}</span>
                  </label>
                  <button type="button" data-select-hour-report="${escapeHtml(report.id)}">
                    <strong>${escapeHtml(report.personName)}</strong>
                    <small>${escapeHtml(hourReportMonthLabel(report))} · ${escapeHtml(formatHours(totals.totalHours))} · ${escapeHtml(formatCurrency(totals.totalCents))}</small>
                  </button>
                </div>
              `;
            })
            .join("")}
        </div>
      </div>
    </section>
  `;
}

function profilePanel(report, { escapeHtml, icon }) {
  const profile = report.profile;
  return `
    <section class="panel">
      <div class="panel-header">
        <span class="panel-icon">${icon("badge-euro")}</span>
        <span class="panel-title">Profil postavk</span>
      </div>
      <div class="panel-body hour-profile-fields">
        <label>
          <span>Med tednom</span>
          <span class="hour-money-input"><input inputmode="decimal" data-hour-profile-field="weekdayRateCents" value="${escapeHtml(moneyInput(profile.weekdayRateCents))}" /><small>€ / h</small></span>
        </label>
        <label>
          <span>Sobota</span>
          <span class="hour-money-input"><input inputmode="decimal" data-hour-profile-field="saturdayRateCents" value="${escapeHtml(moneyInput(profile.saturdayRateCents))}" /><small>€ / h</small></span>
        </label>
        <label>
          <span>Nedelja</span>
          <span class="hour-money-input"><input inputmode="decimal" data-hour-profile-field="sundayRateCents" value="${escapeHtml(moneyInput(profile.sundayRateCents))}" /><small>€ / h</small></span>
        </label>
        <label>
          <span>Bonus ure</span>
          <span class="hour-money-input"><input inputmode="decimal" data-hour-profile-field="bonusHours" value="${escapeHtml(hoursInputValue(profile.bonusHours))}" /><small>h</small></span>
        </label>
        <label>
          <span>Fiksni bonus</span>
          <span class="hour-money-input"><input inputmode="decimal" data-hour-profile-field="bonusCents" value="${escapeHtml(moneyInput(profile.bonusCents))}" /><small>€</small></span>
        </label>
        <p class="panel-note">Bonus ure se obračunajo po postavki med tednom. Profil se shrani lokalno za naslednji uvoz.</p>
      </div>
    </section>
  `;
}

function exportPanel(batch, selectedReport, { icon }) {
  const includedCount = batch.reports.filter((report) => report.included).length;
  return `
    <section class="panel">
      <div class="panel-header">
        <span class="panel-icon">${icon("package-open")}</span>
        <span class="panel-title">Izvoz poročil</span>
      </div>
      <div class="panel-body hour-export-actions">
        <button class="button button-outline button-full" type="button" data-action="download" ${selectedReport ? "" : "disabled"}>
          ${icon("file-down")} PDF izbrane osebe
        </button>
        <button class="button button-outline button-full" type="button" data-action="download-all-hours" ${includedCount ? "" : "disabled"}>
          ${icon("files")} Združeni PDF (${includedCount})
        </button>
        <button class="button button-solid button-full" type="button" data-action="download-hours-zip" ${includedCount ? "" : "disabled"}>
          ${icon("archive")} ZIP z ločenimi PDF-ji
        </button>
      </div>
    </section>
  `;
}

function securityError(security, escapeHtml) {
  return security.error
    ? `<div class="hour-security-error" role="alert">${escapeHtml(security.error)}</div>`
    : "";
}

function securityPinFields({
  confirmation = false,
  autofocus = false,
  autocomplete = "current-password",
  label = "Šestmestni PIN"
} = {}) {
  return `
    <label class="hour-security-field">
      <span>${label}</span>
      <input
        type="password"
        name="pin"
        inputmode="numeric"
        autocomplete="${autocomplete}"
        pattern="[0-9]{6}"
        maxlength="6"
        placeholder="••••••"
        ${autofocus ? "data-hour-security-autofocus" : ""}
        required
      />
    </label>
    ${
      confirmation
        ? `<label class="hour-security-field">
            <span>Ponovi PIN</span>
            <input type="password" name="pinConfirmation" inputmode="numeric" autocomplete="new-password" pattern="[0-9]{6}" maxlength="6" placeholder="••••••" required />
          </label>`
        : ""
    }
  `;
}

function hourSecurityCard(security, { icon, escapeHtml }) {
  if (security.screen === "setup") {
    return `
      <section class="hour-security-card" aria-labelledby="hour-security-title">
        <span class="hour-security-icon">${icon("shield-check")}</span>
        <p class="hour-security-eyebrow">Zasebni podatki</p>
        <h1 id="hour-security-title">Zaščiti Poročila ur</h1>
        <p class="hour-security-copy">Izberi šestmestni PIN za ta brskalnik. Z njim bodo zaščitene urne postavke in bonusi.</p>
        ${securityError(security, escapeHtml)}
        <form class="hour-security-form" data-hour-security-setup>
          <div class="hour-security-pin-grid">
            ${securityPinFields({ confirmation: true, autofocus: true, autocomplete: "new-password" })}
          </div>
          <p class="hour-security-note">PIN si zapomni. Če ga pozabiš, lahko zaščito ponastaviš, vendar se izbrišejo samo shranjene postavke in bonusi Poročil ur.</p>
          <button class="button button-solid button-full" type="submit">Nastavi PIN in odkleni</button>
        </form>
      </section>
    `;
  }

  if (security.screen === "reset-confirm") {
    return `
      <section class="hour-security-card" aria-labelledby="hour-security-title">
        <span class="hour-security-icon hour-security-icon-danger">${icon("trash-2")}</span>
        <p class="hour-security-eyebrow">Ponastavitev zaščite</p>
        <h1 id="hour-security-title">Ponastavi pozabljeni PIN?</h1>
        <p class="hour-security-copy">Ponastavitev izbriše samo PIN, profile postavk, bonuse in trenutni uvoz Poročil ur.</p>
        <p class="hour-security-note">Predlogi nakupa, izdajnice, podpisni listi, podpisi in priponke ostanejo nedotaknjeni.</p>
        ${securityError(security, escapeHtml)}
        <div class="hour-security-actions">
          ${
            security.config
              ? `<button class="button button-outline" type="button" data-hour-security-action="unlock">Nazaj na PIN</button>`
              : ""
          }
          <button class="button button-danger" type="button" data-hour-security-action="reset-final">Nadaljuj s ponastavitvijo</button>
        </div>
      </section>
    `;
  }

  if (security.screen === "reset-final") {
    return `
      <section class="hour-security-card" aria-labelledby="hour-security-title">
        <span class="hour-security-icon hour-security-icon-danger">${icon("trash-2")}</span>
        <p class="hour-security-eyebrow">Zadnja potrditev</p>
        <h1 id="hour-security-title">Izbriši samo podatke Poročil ur?</h1>
        <p class="hour-security-copy">Za dokončno potrditev napiši <strong>IZBRIŠI</strong>.</p>
        ${securityError(security, escapeHtml)}
        <form class="hour-security-form" data-hour-security-reset>
          <label class="hour-security-field">
            <span>Potrditev</span>
            <input name="confirmation" autocomplete="off" data-hour-security-autofocus required />
          </label>
          <div class="hour-security-actions">
            <button class="button button-outline" type="button" data-hour-security-action="reset-confirm">Nazaj</button>
            <button class="button button-danger" type="submit">Ponastavi PIN in profile</button>
          </div>
        </form>
      </section>
    `;
  }

  const lockedOut = security.remainingSeconds > 0;
  return `
    <section class="hour-security-card hour-security-card-unlock" aria-labelledby="hour-security-title">
      <span class="hour-security-icon">${icon("lock-keyhole")}</span>
      <p class="hour-security-eyebrow">Poročila ur</p>
      <h1 id="hour-security-title">Odkleni zasebni zavihek</h1>
      <p class="hour-security-copy">PIN velja samo za ta brskalnik in ostane odklenjen do osvežitve ali zaprtja strani.</p>
      ${securityError(security, escapeHtml)}
      <form class="hour-security-form" data-hour-security-unlock>
        ${securityPinFields({ autofocus: !lockedOut })}
        ${
          lockedOut
            ? `<p class="hour-security-cooldown" role="status">Ponovni poskus čez <strong>${security.remainingSeconds} s</strong>.</p>`
            : ""
        }
        <button class="button button-solid button-full" type="submit" ${lockedOut ? "disabled" : ""}>Odkleni</button>
      </form>
      <button class="button button-ghost hour-security-forgot" type="button" data-hour-security-action="reset-confirm">Pozabil/a sem PIN</button>
    </section>
  `;
}

function hourSecurityPanel({ icon }) {
  return `
    <section class="panel">
      <div class="panel-header">
        <span class="panel-icon">${icon("shield-check")}</span>
        <span class="panel-title">Zaščita</span>
      </div>
      <div class="panel-body">
        <p class="panel-note">PIN varuje postavke in bonuse samo v tem brskalniku.</p>
        <button class="button button-outline button-full" type="button" data-hour-security-action="change-pin">
          ${icon("key-round")} Spremeni PIN
        </button>
      </div>
    </section>
  `;
}

function changeHourPinModal(security, { icon, escapeHtml }) {
  if (security.screen !== "change-pin") return "";
  return `
    <div class="modal-backdrop hour-security-modal-backdrop" role="presentation" data-hour-security-action="unlock">
      <section class="modal-window hour-security-modal" role="dialog" aria-modal="true" aria-labelledby="hour-change-pin-title" data-modal-window>
        <header class="modal-header">
          <div>
            <p class="hour-security-eyebrow">Zaščita Poročil ur</p>
            <h2 class="modal-title" id="hour-change-pin-title">Spremeni PIN</h2>
          </div>
          <button class="button button-icon-only button-ghost" type="button" data-hour-security-action="unlock" aria-label="Zapri">
            ${icon("x")}
          </button>
        </header>
        <form class="modal-body hour-security-form" data-hour-security-change-pin>
          ${securityError(security, escapeHtml)}
          <label class="hour-security-field">
            <span>Trenutni PIN</span>
            <input type="password" name="currentPin" inputmode="numeric" autocomplete="current-password" pattern="[0-9]{6}" maxlength="6" placeholder="••••••" data-hour-security-autofocus required />
          </label>
          <div class="hour-security-pin-grid">
            ${securityPinFields({ confirmation: true, autocomplete: "new-password", label: "Novi šestmestni PIN" })}
          </div>
          <div class="modal-actions">
            <button class="button button-outline" type="button" data-hour-security-action="unlock">Prekliči</button>
            <button class="button button-solid" type="submit">Shrani novi PIN</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function anonymizedHourReportPreview() {
  return `
    <article class="paper hour-security-preview" aria-hidden="true">
      <header class="hour-security-preview-header">
        <span>CENTER ROG</span>
        <strong>POROČILO O OPRAVLJENIH URAH</strong>
      </header>
      <div class="hour-security-preview-meta">
        <span></span><span></span>
      </div>
      <div class="hour-security-preview-table">
        ${Array.from({ length: 9 }, () => `<span></span>`).join("")}
      </div>
      <div class="hour-security-preview-summary">
        <span></span><span></span>
      </div>
    </article>
  `;
}

function renderHourSecurityWorkspace(context) {
  const {
    security,
    saveState,
    disabledAttr,
    renderEvidenceTabs,
    icon,
    escapeHtml
  } = context;
  return `
    <main class="app-shell evidence-shell hour-reports-shell evidence-hourReports">
      <div class="app-topbar">
        <header class="toolbar">
          <div class="brand">
            <div class="brand-mark">${icon("folders")}</div>
            <div class="brand-copy">
              <div class="brand-title">Center Rog evidence</div>
              <div class="brand-subtitle">
                <span class="save-state-pill save-state-${escapeHtml(saveState.kind)}">${escapeHtml(saveState.label)}</span>
                <span>${escapeHtml(saveState.detail)}</span>
              </div>
            </div>
          </div>
        </header>
        ${renderEvidenceTabs("hourReports", disabledAttr)}
      </div>
      <section class="workspace hour-security-workspace" id="evidence-workspace">
        <div class="hour-security-stage">
          <div class="hour-security-preview-wrap">${anonymizedHourReportPreview()}</div>
          ${hourSecurityCard(security, { icon, escapeHtml })}
        </div>
      </section>
    </main>
  `;
}

export function renderHourReportsWorkspace(context) {
  const {
    batch,
    selectedReport,
    saveState,
    disabledAttr,
    toolsPanelOpen,
    renderEvidenceTabs,
    renderDocumentCommands,
    renderUnsavedPrompt,
    icon,
    escapeHtml,
    formatCurrency
  } = context;
  const helpers = { icon, escapeHtml, formatCurrency };

  if (context.security.status !== "unlocked") {
    return renderHourSecurityWorkspace(context);
  }

  return `
    <main class="app-shell evidence-shell hour-reports-shell evidence-hourReports">
      <div class="app-topbar">
        <header class="toolbar">
          <div class="brand">
            <div class="brand-mark">${icon("folders")}</div>
            <div class="brand-copy">
              <div class="brand-title">Center Rog evidence</div>
              <div class="brand-subtitle">
                <span class="save-state-pill save-state-${escapeHtml(saveState.kind)}">${escapeHtml(saveState.label)}</span>
                <span>${escapeHtml(saveState.detail)}</span>
              </div>
            </div>
          </div>
        </header>
        ${renderEvidenceTabs("hourReports", disabledAttr)}
      </div>

      <section class="workspace hour-reports-workspace" id="evidence-workspace">
        <div class="document-stage hour-report-document-stage">
          ${selectedReport ? `<div class="hour-report-paper-frame">${reportPage(selectedReport, helpers)}</div>` : emptyPage(helpers)}
        </div>

        <aside class="side-panel${toolsPanelOpen ? " is-open" : ""}" id="toolsPanel" aria-label="Pregled poročil ur">
          <div class="panel-drawer-header">
            <span>${icon("panel-right")} Pregled poročil</span>
            <button class="button button-icon-only button-ghost" type="button" data-action="close-tools" aria-label="Zapri pregled">${icon("x")}</button>
          </div>
          ${renderDocumentCommands("hourReports", saveState, disabledAttr)}
          <section class="panel">
            <div class="panel-header">
              <span class="panel-icon">${icon("file-spreadsheet")}</span>
              <span class="panel-title">Connecteam izvoz</span>
            </div>
            <div class="panel-body">
              <p class="empty-text">${batch ? "Za nov pregled lahko naložiš drug Excelov izvoz." : "Naloži datoteko XLSX iz pogleda List view v Connecteamu."}</p>
              <button class="hour-import-dropzone" type="button" data-action="import-hours" data-hour-import-dropzone>
                ${icon("upload")} <strong>${batch ? "Zamenjaj XLSX" : "Povleci XLSX sem"}</strong>
                <small>ali klikni za izbor datoteke</small>
              </button>
            </div>
          </section>
          ${batch ? reportList(batch, selectedReport, helpers) : ""}
          ${selectedReport ? profilePanel(selectedReport, helpers) : ""}
          ${batch ? exportPanel(batch, selectedReport, helpers) : ""}
          ${hourSecurityPanel(helpers)}
        </aside>
      </section>

      <div class="tools-panel-backdrop${toolsPanelOpen ? " is-open" : ""}" data-action="close-tools" aria-hidden="true"></div>
      <button class="mobile-panel-toggle" type="button" data-action="toggle-tools" aria-controls="toolsPanel" aria-expanded="${toolsPanelOpen ? "true" : "false"}">
        ${icon("panel-right")} Pregled
      </button>
      <input class="hidden-input" type="file" id="hourReportInput" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
      ${changeHourPinModal(context.security, helpers)}
      ${renderUnsavedPrompt()}
    </main>
  `;
}
