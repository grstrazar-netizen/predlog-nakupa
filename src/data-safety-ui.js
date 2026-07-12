import { APP_VERSION, CURRENT_RELEASE } from "./app-version.js";
import { supportsDirectoryBackup } from "./backup.js";

function formatBackupTime(value) {
  if (!value) return "Varnostna kopija še ni bila ustvarjena.";
  return new Intl.DateTimeFormat("sl-SI", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function backupOverview(dataSafety, { icon, escapeHtml }) {
  const config = dataSafety.config;
  const automatic = Boolean(config?.directoryHandle);
  return `
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
        : backupOverview(dataSafety, helpers);
  return `
    <div class="modal-backdrop data-safety-backdrop" data-action="close-data-safety" role="presentation">
      <section class="modal-window data-safety-modal" role="dialog" aria-modal="true" aria-labelledby="data-safety-title" data-modal-window>
        <header class="modal-header">
          <div>
            <span class="modal-eyebrow">Podatki in varnost</span>
            <h2 class="modal-title" id="data-safety-title">Varnostne kopije</h2>
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
