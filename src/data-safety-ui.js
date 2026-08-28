import { APP_VERSION, CURRENT_RELEASE } from "./app-version.js";
import { supportsDirectoryBackup } from "./backup.js";

function formatBackupTime(value) {
  if (!value) return "Varnostna kopija še ni bila ustvarjena.";
  return new Intl.DateTimeFormat("sl-SI", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function transferSummary(summary, { icon }) {
  if (!summary) {
    return `<div class="transfer-summary-loading">${icon("loader-circle")} Preverjam shranjene podatke ...</div>`;
  }
  return `
    <dl class="transfer-summary" aria-label="Vsebina predajnega paketa">
      <div><dt>${summary.proposals}</dt><dd>predlogov nakupa</dd></div>
      <div><dt>${summary.materialIssues}</dt><dd>izdajnic</dd></div>
      <div><dt>${summary.attendanceSheets}</dt><dd>podpisnih listov</dd></div>
      <div><dt>${summary.hourProfiles}</dt><dd>poročil ur</dd></div>
      <div><dt>${summary.attachments}</dt><dd>priponk</dd></div>
      <div><dt>${summary.settings}</dt><dd>nastavitev in sredstev</dd></div>
    </dl>
  `;
}

function backupOverview(dataSafety, { icon, escapeHtml }) {
  const config = dataSafety.config;
  const automatic = Boolean(config?.directoryHandle);
  return `
    <section class="transfer-callout">
      <span class="transfer-callout-icon">${icon("laptop-minimal-check")}</span>
      <div>
        <strong>Prenos na nov računalnik</strong>
        <p>Pripravi en šifriran paket z vso zgodovino, priponkami, podpisi, podjetji in nastavitvami.</p>
      </div>
      <button class="button button-solid" type="button" data-action="show-data-transfer">Začni prenos</button>
    </section>
    <div class="data-safety-summary">
      <span class="data-safety-status ${config ? "is-ready" : "is-unconfigured"}">
        ${icon(config ? "shield-check" : "shield-alert")}
        ${config ? (automatic ? "Samodejni backup je nastavljen" : "Ročni šifrirani backup") : "Backup še ni nastavljen"}
      </span>
      ${
        config
          ? `<dl class="data-safety-details">
              <div><dt>Mapa</dt><dd>${escapeHtml(config.directoryHandle?.name || "Ročni prenos")}</dd></div>
              <div><dt>Urnik</dt><dd>${automatic ? "Vsak dan ob 19.30" : "Na zahtevo"}</dd></div>
              <div><dt>Zadnji backup</dt><dd>${escapeHtml(formatBackupTime(config.lastBackupAt))}</dd></div>
            </dl>`
          : `<p>Izberi ciljno mapo in določi geslo. Aplikacija bo varnostno kopijo šifrirala, zato osebni podatki brez gesla ne bodo berljivi.</p>`
      }
      ${
        dataSafety.permissionNeeded
          ? `<div class="data-safety-warning" role="status">${icon("folder-lock")} Brskalnik potrebuje ponovno dovoljenje za zapis v izbrano mapo.</div>`
          : ""
      }
    </div>
    <div class="data-safety-actions">
      ${
        config
          ? `<button class="button button-solid" type="button" data-action="create-backup-now">${icon("archive")} Naredi backup zdaj</button>
             <button class="button button-outline" type="button" data-action="show-backup-setup">${icon("folder-cog")} Spremeni nastavitev</button>`
          : `<button class="button button-solid" type="button" data-action="show-backup-setup">${icon("folder-key")} Nastavi backup</button>`
      }
      <button class="button button-outline" type="button" data-action="choose-backup-restore">${icon("folder-up")} Obnovi podatke</button>
    </div>
    <p class="data-safety-footnote">
      Samodejni zapis deluje v Chromu in Edgeu, ko je aplikacija odprta. Če je ob 19.30 zaprta, se backup izvede ob naslednjem primernem odprtju aplikacije.
    </p>
    <p class="data-safety-version">Različica aplikacije ${APP_VERSION}</p>
  `;
}

function dataTransfer(dataSafety, helpers) {
  const { icon } = helpers;
  const installLabel = helpers.install?.available ? "Namesti aplikacijo" : "Pokaži navodila";
  return `
    <div class="transfer-layout">
      <section class="transfer-step">
        <span class="transfer-step-number">1</span>
        <div class="transfer-step-heading">
          <span class="transfer-step-icon">${icon("package-check")}</span>
          <div>
            <strong>Na starem računalniku</strong>
            <p>Prenesi šifriran predajni paket in geslo sporoči novi odgovorni osebi po ločeni poti.</p>
          </div>
        </div>
        ${transferSummary(dataSafety.summary, helpers)}
        ${
          dataSafety.hasUnsavedChanges
            ? `<div class="data-safety-warning">${icon("triangle-alert")} Pred izdelavo paketa shrani ali zavrzi trenutne neshranjene spremembe.</div>`
            : ""
        }
        <form class="data-safety-form transfer-export-form" data-transfer-export-form>
          <div class="transfer-password-grid">
            <label>
              <span>Novo geslo predajnega paketa</span>
              <input type="password" data-transfer-password minlength="8" autocomplete="new-password" required />
            </label>
            <label>
              <span>Ponovi geslo</span>
              <input type="password" data-transfer-password-confirm minlength="8" autocomplete="new-password" required />
            </label>
          </div>
          <button class="button button-solid transfer-primary-action" type="submit" data-busy-sensitive ${dataSafety.hasUnsavedChanges ? "disabled" : ""}>
            ${icon("download")} Prenesi predajni paket
          </button>
        </form>
        ${
          dataSafety.transferCreatedAt
            ? `<div class="transfer-success" role="status">${icon("check-circle-2")} Paket je pripravljen. Ne izbriši podatkov s starega računalnika, dokler prenosa ne preveriš na novem.</div>`
            : ""
        }
      </section>

      <section class="transfer-step">
        <span class="transfer-step-number">2</span>
        <div class="transfer-step-heading">
          <span class="transfer-step-icon">${icon("monitor-down")}</span>
          <div>
            <strong>Na novem računalniku</strong>
            <p>Odpri aplikacijo, jo namesti in nato izberi prejeti paket. Po obnovitvi bo zgodovina takoj na voljo.</p>
          </div>
        </div>
        <ol class="transfer-instructions">
          <li>Odpri <strong>predlog-nakupa.vercel.app</strong> v Chromu ali Edgeu.</li>
          <li>Namesti aplikacijo, da bo dostopna kot običajen program.</li>
          <li>Izberi predajni paket in vnesi geslo.</li>
          <li>Primerjaj število dokumentov s povzetkom na starem računalniku.</li>
        </ol>
        <div class="data-safety-actions transfer-receive-actions">
          <button class="button button-outline" type="button" data-action="install-app">${icon("monitor-down")} ${installLabel}</button>
          <button class="button button-solid" type="button" data-action="choose-backup-restore">${icon("folder-up")} Izberi predajni paket</button>
        </div>
      </section>
    </div>
    <div class="data-safety-actions transfer-footer-actions">
      <button class="button button-outline" type="button" data-action="show-backup-overview">Nazaj na backup</button>
    </div>
  `;
}

function installInstructions(install, { icon }) {
  return `
    <div class="install-guide">
      <div class="data-safety-explainer">
        ${icon(install?.installed ? "badge-check" : "monitor-down")}
        <div>
          <strong>${install?.installed ? "Aplikacija je že nameščena" : "Namesti Center Rog evidence"}</strong>
          <p>Namestitev ustvari samostojno okno in bližnjico. Podatki ostanejo v istem brskalniškem profilu.</p>
        </div>
      </div>
      ${
        install?.installed
          ? `<div class="transfer-success">${icon("check-circle-2")} Aplikacijo lahko odpreš iz menija Start, Applications ali opravilne vrstice.</div>`
          : `<ol class="transfer-instructions install-instructions">
              <li><strong>Chrome ali Edge:</strong> v naslovni vrstici klikni ikono za namestitev. Če je ni, odpri meni brskalnika in izberi <strong>Namesti stran kot aplikacijo</strong>.</li>
              <li><strong>Safari na Macu:</strong> v meniju <strong>File</strong> izberi <strong>Add to Dock</strong>.</li>
              <li><strong>Firefox:</strong> namestitev kot samostojna namizna aplikacija ni podprta; ustvari zaznamek in uporabljaj spletno različico.</li>
            </ol>`
      }
      <div class="data-safety-actions">
        <button class="button button-outline" type="button" data-action="show-data-transfer">Nazaj na prenos</button>
        ${
          install?.available && !install?.installed
            ? `<button class="button button-solid" type="button" data-action="install-app">${icon("download")} Namesti zdaj</button>`
            : ""
        }
      </div>
    </div>
  `;
}

function backupSetup(dataSafety, { icon }) {
  const directorySupported = supportsDirectoryBackup();
  return `
    <form class="data-safety-form" data-backup-setup-form>
      <div class="data-safety-explainer">
        ${icon(directorySupported ? "folder-clock" : "download")}
        <div>
          <strong>${directorySupported ? "Dnevni backup v izbrano mapo" : "Šifrirani ročni backup"}</strong>
          <p>${
            directorySupported
              ? "Po potrditvi boš enkrat izbral/a mapo. Brskalnik lahko ob novem zagonu ponovno zahteva dovoljenje za zapis."
              : "Ta brskalnik ne dovoljuje samodejnega zapisovanja v mapo. Backup boš lahko prenesel/a z enim klikom."
          }</p>
        </div>
      </div>
      <label>
        <span>Geslo varnostne kopije</span>
        <input type="password" data-backup-password minlength="8" autocomplete="new-password" required />
        <small>Vsaj 8 znakov. Gesla ne hranimo in ga brez tebe ne moremo obnoviti.</small>
      </label>
      <label>
        <span>Ponovi geslo</span>
        <input type="password" data-backup-password-confirm minlength="8" autocomplete="new-password" required />
      </label>
      <div class="data-safety-actions">
        <button class="button button-outline" type="button" data-action="show-backup-overview">Nazaj</button>
        <button class="button button-solid" type="submit">
          ${icon(directorySupported ? "folder-check" : "shield-check")}
          ${directorySupported ? "Izberi mapo in nastavi" : "Nastavi zaščito"}
        </button>
      </div>
    </form>
  `;
}

function backupRestore(dataSafety, { icon, escapeHtml }) {
  return `
    <form class="data-safety-form" data-backup-restore-form>
      <div class="data-safety-explainer">
        ${icon("rotate-ccw")}
        <div>
          <strong>${escapeHtml(dataSafety.pendingRestoreFile?.name || "Izbrana varnostna kopija")}</strong>
          <p>Obnovitev bo zamenjala lokalne evidence, priponke, podpise in nastavitve s podatki iz kopije.</p>
        </div>
      </div>
      <label>
        <span>Geslo varnostne kopije</span>
        <input type="password" data-backup-restore-password autocomplete="current-password" required />
      </label>
      <div class="data-safety-warning">${icon("triangle-alert")} Pred obnovitvijo priporočamo, da najprej preneseš še trenutno varnostno kopijo.</div>
      <div class="data-safety-actions">
        <button class="button button-outline" type="button" data-action="show-backup-overview">Prekliči</button>
        <button class="button button-solid" type="submit">${icon("database-backup")} Obnovi podatke</button>
      </div>
    </form>
  `;
}

export function renderDataSafetyModal(dataSafety, helpers) {
  if (!dataSafety.open) return "";
  const body =
    dataSafety.screen === "setup"
      ? backupSetup(dataSafety, helpers)
      : dataSafety.screen === "restore"
        ? backupRestore(dataSafety, helpers)
        : dataSafety.screen === "transfer"
          ? dataTransfer(dataSafety, helpers)
          : dataSafety.screen === "install"
            ? installInstructions(helpers.install, helpers)
            : backupOverview(dataSafety, helpers);
  const title =
    dataSafety.screen === "transfer"
      ? "Prenos na nov računalnik"
      : dataSafety.screen === "install"
        ? "Namestitev aplikacije"
        : "Varnostne kopije";
  return `
    <div class="modal-backdrop data-safety-backdrop" data-action="close-data-safety" role="presentation">
      <section class="modal-window data-safety-modal${dataSafety.screen === "transfer" ? " data-safety-modal-transfer" : ""}" role="dialog" aria-modal="true" aria-labelledby="data-safety-title" data-modal-window>
        <header class="modal-header">
          <div>
            <span class="modal-eyebrow">Podatki in varnost</span>
            <h2 class="modal-title" id="data-safety-title">${title}</h2>
          </div>
          <button class="button button-icon-only button-ghost" type="button" data-action="close-data-safety" aria-label="Zapri">${helpers.icon("x")}</button>
        </header>
        <div class="modal-body">
          ${dataSafety.error ? `<div class="form-error-banner" role="alert">${helpers.escapeHtml(dataSafety.error)}</div>` : ""}
          ${body}
        </div>
      </section>
    </div>
  `;
}

export function renderUpdateBanner(update, { icon, escapeHtml }) {
  if (!update.available || update.dismissed) return "";
  return `
    <aside class="app-update-banner" role="status">
      <span>${icon("sparkles")} Na voljo je nova različica ${escapeHtml(update.available.version)}.</span>
      <div>
        <button class="button button-ghost" type="button" data-action="dismiss-update">Pozneje</button>
        <button class="button button-solid" type="button" data-action="install-update">Posodobi zdaj</button>
      </div>
    </aside>
  `;
}

export function renderReleaseNotesModal(update, helpers) {
  if (!update.releaseNotesOpen) return "";
  return `
    <div class="modal-backdrop release-notes-backdrop" role="presentation">
      <section class="modal-window release-notes-modal" role="dialog" aria-modal="true" aria-labelledby="release-notes-title" data-modal-window>
        <header class="modal-header">
          <div>
            <span class="modal-eyebrow">Različica ${helpers.escapeHtml(APP_VERSION)}</span>
            <h2 class="modal-title" id="release-notes-title">Kaj je novega</h2>
          </div>
        </header>
        <div class="modal-body">
          <h3>${helpers.escapeHtml(CURRENT_RELEASE.title)}</h3>
          <ul class="release-notes-list">
            ${CURRENT_RELEASE.notes.map((note) => `<li>${helpers.icon("check-circle-2")}<span>${helpers.escapeHtml(note)}</span></li>`).join("")}
          </ul>
          <div class="data-safety-actions">
            <button class="button button-solid" type="button" data-action="close-release-notes">Razumem</button>
          </div>
        </div>
      </section>
    </div>
  `;
}
