import {
  DEFAULTS,
  centsToInputValue,
  createBlankProposal,
  deriveLabCodeFromName,
  downloadBlob,
  extractEuroTotalCents,
  formatCurrency,
  formatSlovenianDate,
  generateId,
  normalizeSignaturePlacement,
  normalizeLabCode,
  parseMoneyToCents,
  proposalWithChangeLog,
  proposalWithSaveMetadata,
  safeFileName,
  sortRecent,
  validateProposalRequiredFields,
  spendingBreakdownForYear,
  spendingForYear,
  uniqueSuggestions,
  yearFromDate
} from "./utils.js";
import {
  deleteOrphanAttachments,
  deleteAsset,
  deleteAttendanceSheet,
  getAllAttendanceSheets,
  getAllHourProfiles,
  getAllMaterialIssues,
  getAsset,
  getDatabaseBackupSnapshot,
  deleteProposalBundle,
  getAllProposals,
  getAttachment,
  saveAsset,
  replaceDatabaseFromBackup,
  saveAttendanceSheet as persistAttendanceSheet,
  saveAttendanceSheets as persistAttendanceSheets,
  saveHourSecurityBundle,
  clearHourSecurityData,
  saveMaterialIssue as persistMaterialIssue,
  saveProposal,
  saveProposalBundle
} from "./db.js";
import {
  BACKUP_CONFIG_ASSET_ID,
  backupFileName,
  backupIsDue,
  createBackupEncryption,
  createEncryptedBackup,
  decryptBackupFile,
  directoryPermission,
  localDateKey,
  millisecondsUntilBackup,
  supportsDirectoryBackup,
  validateBackupPassword,
  writeBackupFile
} from "./backup.js";
import {
  APP_VERSION,
  APP_VERSION_STORAGE_KEY,
  CURRENT_RELEASE,
  UPDATE_CHECK_INTERVAL_MS,
  fetchLatestVersion,
  isNewerVersion
} from "./app-version.js";
import {
  renderDataSafetyModal,
  renderReleaseNotesModal,
  renderUpdateBanner
} from "./data-safety-ui.js";
import { createCombinedPdfBlob } from "./pdf.js";
import { createMaterialIssuePdfBlob } from "./material-issue-pdf.js";
import { createAttendanceSheetPdfBlob } from "./attendance-sheet-pdf.js";
import { createHourReportPdfBlob, createHourReportsPdfBlob } from "./hour-report-pdf.js";
import { renderHourReportsWorkspace } from "./hour-report-ui.js";
import {
  createHourProfile,
  hoursBetweenTimes,
  hourReportFileName,
  normalizeHours,
  normalizeRateCents,
  parseConnecteamWorkbook,
  profileRateForDate,
  removeHourReportRow,
  resetHourRow,
  updateHourReportRow,
  updateReportProfile,
  validateHourReport
} from "./hour-report.js";
import {
  HOUR_SECURITY_ASSET_ID,
  createHourSecurity,
  createUnprotectedHourSecurity,
  decryptHourProfiles,
  encryptHourProfiles,
  isEncryptedHourProfileRecord,
  isUnprotectedHourSecurity,
  replaceHourPin,
  unlockHourDataKey,
  validateHourPin
} from "./hour-security.js";
import {
  ATTENDANCE_CATEGORY_ASSET_ID,
  ATTENDANCE_ROWS_PER_PAGE,
  DEFAULT_ATTENDANCE_CATEGORIES,
  attendanceParticipantEmailDisplay,
  isRelatedAttendanceParticipant,
  attendanceVisibleRowCount,
  attendanceSheetFromImportGroup,
  attendanceSheetWithSaveMetadata,
  attendanceStatistics,
  attendanceSuggestions,
  createAttendanceParticipant,
  createBlankAttendanceSheet,
  createCustomAttendanceCategory,
  normalizeAttendanceCategories,
  normalizePhotoConsent,
  parseWagtailAttendanceCsv,
  photoConsentLabel,
  searchAttendance,
  validateAttendanceSheet
} from "./attendance-sheet.js";
import {
  MATERIAL_ISSUE_STATUSES,
  MATERIAL_UNITS,
  createBlankMaterialIssue,
  createBlankMaterialRow,
  materialIssueTotalCents,
  materialIssueWithSaveMetadata,
  materialRowAmountCents,
  nextMaterialIssueSerial,
  normalizeMaterialTariff,
  validateMaterialIssue
} from "./material-issue.js";
import {
  createCanvasTextMeasurer,
  createProposalLayout,
  documentLayoutCssVariables
} from "./document-layout.js";

const root = document.getElementById("app");
const SIGNATURE_ASSET_ID = "lab-manager-signature";
const COMPANY_DIRECTORY_ASSET_ID = "center-rog-company-directory-v1";
const MAX_SIGNATURE_FILE_SIZE = 2 * 1024 * 1024;

const KEYBOARD_SHORTCUTS = {
  n: "new",
  s: "save",
  p: "print"
};

const state = {
  documentType: "proposal",
  proposals: [],
  current: createBlankProposal(),
  materialIssues: [],
  currentMaterialIssue: createBlankMaterialIssue(),
  attendanceSheets: [],
  currentAttendanceSheet: createBlankAttendanceSheet(),
  attendanceCategories: normalizeAttendanceCategories(),
  attendanceImport: null,
  attendanceArchiveOpen: false,
  attendanceArchiveTab: "search",
  attendanceSearchQuery: "",
  attendanceCategoryModalOpen: false,
  attendanceDeleteConfirmId: "",
  attendanceExportPrompt: null,
  hourProfiles: [],
  hourBatch: null,
  selectedHourReportId: "",
  hourRowDeleteConfirm: null,
  hourSecurity: {
    status: "loading",
    screen: "setup",
    config: null,
    profileRecords: [],
    activeKey: null,
    error: "",
    failedAttempts: 0,
    lockoutUntil: 0
  },
  attachment: null,
  persistedAttachmentId: "",
  signatureAsset: null,
  signatureUrl: "",
  companies: [],
  companyDirectory: {
    editingId: "",
    error: ""
  },
  historyModalOpen: false,
  proposalPreviewId: "",
  proposalPreviewMode: "view",
  proposalPreviewZoom: 0.82,
  proposalPreviewAttachment: null,
  proposalPreviewAttachmentUrl: "",
  toolsPanelOpen: false,
  evidenceMenuOpen: false,
  statusMenu: null,
  materialStatusMenu: null,
  collapsedPanels: {},
  documentPopover: null,
  deleteConfirmId: "",
  unsavedPrompt: null,
  onboarding: {
    active: false,
    stage: "",
    step: 0,
    labName: "",
    labCodePreview: DEFAULTS.labCode
  },
  dirty: false,
  busy: false,
  validation: {
    message: "",
    fields: {},
    firstInvalidField: ""
  },
  materialValidation: {
    message: "",
    fields: {},
    firstInvalidField: ""
  },
  attendanceValidation: {
    message: "",
    fields: {},
    firstInvalidField: ""
  },
  toast: "",
  dataSafety: {
    open: false,
    screen: "overview",
    config: null,
    pendingRestoreFile: null,
    permissionNeeded: false,
    error: ""
  },
  update: {
    available: null,
    dismissed: false,
    releaseNotesOpen: false
  }
};

let outsideClickBound = false;
let onboardingViewportBound = false;
let onboardingPositionFrame = 0;
let onboardingDemoTimer = 0;
let onboardingCalculatorSnapshot = null;
let touchPopoverTimer = 0;
let hoverPopoverTimer = 0;
let recentDeleteDrag = null;
let toolbarTooltipDelayArmed = false;
let suppressedRecentClickId = "";
let beforeUnloadBound = false;
let pendingAttendanceFile = null;
let pendingHourReportFile = null;
let hourSecurityCooldownTimer = 0;
let automaticBackupTimer = 0;
let updateCheckTimer = 0;
const ONBOARDING_STORAGE_KEY = "predlog-nakupa:onboarding-complete:v1";
const DOCUMENT_POPOVER_HOVER_DELAY_MS = 1000;
const RECENT_DELETE_DRAG_DISTANCE = 92;
const EXPLANATION_EMPTY_EXAMPLE_LINES = [
  "- Merkur: vijaki, mozniki in sidra 3 x 12,90 EUR",
  "- zaščitne rokavice 4 x 7,50 EUR",
  "- brusni papir in čistila 25 EUR"
];
const ONBOARDING_CALCULATOR_DEMO_TEXT = EXPLANATION_EMPTY_EXAMPLE_LINES.join("\n");
const DOCUMENT_STATUS_OPTIONS = [
  { value: "", label: "Brez statusa", className: "none" },
  { value: "submitted", label: "Oddano", className: "submitted" },
  { value: "approved", label: "Potrjeno", className: "approved" },
  { value: "rejected", label: "Zavrnjeno", className: "rejected" }
];
const ONBOARDING_STEPS = [
  {
    target: "#fullName",
    title: "Zadnje uporabljeno ostane pri roki",
    body:
      "Ime in priimek bo pri novem dokumentu vedno vzeto iz zadnjega uporabljenega dokumenta. Enako velja za delovno mesto in polje za potrebe, vse pa lahko kadarkoli prepišeš."
  },
  {
    target: ".explanation-notes",
    demo: "calculator",
    title: "Opis lahko deluje kot mali kalkulator",
    body:
      "V obrazložitev lahko napišeš 2*230 EUR, 100 - 10% EUR ali (3*100+6) EUR. Polje zna seštevati, odštevati, množiti, deliti in računati popuste, seštevek pa se prenese spodaj. Kratek primer se vpiše samodejno, seveda pa lahko seštevek vedno popraviš ročno."
  },
  {
    target: "#company",
    title: "Podjetja si zapomni samodejno",
    body:
      "Ko enkrat vneseš podjetje, ga bo aplikacija naslednjič ponudila kot predlog za samodejno dopolnjevanje. Prvi vnos naj bo zato čim bolj pravilen, ker si ga bo zapomnila."
  },
  {
    target: ".date-field",
    title: "Datum je samodejno današnji",
    body:
      "Ob novem dokumentu je datum izdaje nastavljen na današnji datum. Če urejaš dokument za nazaj, ga lahko še vedno spremeniš."
  },
  {
    target: "[data-offer-dropzone]",
    title: "Ponudba gre skupaj z dokumentom",
    body:
      "Sem lahko povlečeš ponudbo v obliki datoteke PDF ali slike. Pri izvozu se doda za obrazec, zato ima direktorica podpisni list in ponudbo v enem dokumentu PDF."
  },
  {
    target: ".history-head",
    title: "Zadnji predlogi in statusi",
    body:
      "Tu se pokaže zadnjih pet izdanih predlogov. Dokument lahko kategoriziraš z desnim klikom miške na vrstico, na telefonu pa se dotakni majhne statusne pike ob številki."
  },
  {
    target: ".metric",
    title: "Poraba brez zavrnjenih predlogov",
    body:
      "Aplikacija samodejno sešteva izdane predloge za tekoče leto, da se lažje vidi, koliko je že porabljeno. Če predlog označiš kot zavrnjen, se ne šteje v skupni seštevek."
  }
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function icon(name) {
  return `<i data-lucide="${name}" aria-hidden="true"></i>`;
}

function setSignatureAsset(asset) {
  if (state.signatureUrl) URL.revokeObjectURL(state.signatureUrl);
  state.signatureAsset = asset || null;
  state.signatureUrl = asset?.blob ? URL.createObjectURL(asset.blob) : "";
}

function currentSignatureDocument() {
  if (state.documentType === "materialIssue") return state.currentMaterialIssue;
  if (state.documentType === "hourReports") return selectedHourReport() || state.current;
  return state.current;
}

function currentSignaturePlacement() {
  return normalizeSignaturePlacement(currentSignatureDocument().signaturePlacement);
}

function updateCurrentSignaturePlacement(nextPlacement, { rerender = true } = {}) {
  currentSignatureDocument().signaturePlacement = normalizeSignaturePlacement(nextPlacement);
  markDirty();
  if (rerender) render();
}

function renderSignatureZone(context = "proposal", document = currentSignatureDocument(), { interactive = true } = {}) {
  const hasSignature = Boolean(state.signatureAsset?.blob && state.signatureUrl);
  const placement = normalizeSignaturePlacement(document?.signaturePlacement);
  const isInserted = hasSignature && placement.inserted;
  const zoneAttrs = interactive ? "data-signature-zone" : "";
  const objectAttrs = interactive
    ? `data-signature-object tabindex="0" aria-label="Vstavljen podpis. Povleci ga za premik ali uporabi ročico za spremembo velikosti."`
    : `aria-hidden="true"`;

  return `
    <span class="signature-zone signature-zone-${escapeHtml(context)}${isInserted ? " has-inserted-signature" : ""}" ${zoneAttrs}>
      <span class="signature-zone-rule" aria-hidden="true"></span>
      ${
        isInserted
          ? `<span
              class="signature-object"
              ${objectAttrs}
              style="left:${placement.x}%;top:${placement.y}%;width:${placement.width}%"
            >
              <img src="${escapeHtml(state.signatureUrl)}" alt="Podpis vodje laba" draggable="false" />
              ${interactive ? `<span class="signature-resize-handle" data-signature-resize aria-hidden="true"></span>` : ""}
            </span>`
          : hasSignature && interactive
            ? `<button class="signature-quick-insert" type="button" data-action="insert-signature" aria-label="Vstavi shranjeni podpis" title="Vstavi shranjeni podpis">${icon("pen-tool")}</button>`
            : ""
      }
    </span>
  `;
}

function renderSignaturePanel() {
  const hasSignature = Boolean(state.signatureAsset?.blob && state.signatureUrl);
  const placement = currentSignaturePlacement();
  return `
    <section class="panel signature-panel">
      <div class="panel-header">
        <span class="panel-icon">${icon("signature")}</span>
        <span class="panel-title">Moj podpis</span>
      </div>
      <div class="panel-body">
        ${
          hasSignature
            ? `<div class="signature-library-preview">
                <img src="${escapeHtml(state.signatureUrl)}" alt="Shranjeni podpis" />
              </div>
              <div class="signature-panel-actions">
                <button class="button button-outline" type="button" data-action="${placement.inserted ? "remove-inserted-signature" : "insert-signature"}">
                  ${icon(placement.inserted ? "undo-2" : "pen-tool")}
                  ${placement.inserted ? "Odstrani iz dokumenta" : "Vstavi v dokument"}
                </button>
                <button class="button button-icon-only button-ghost" type="button" data-action="upload-signature" aria-label="Zamenjaj podpis" title="Zamenjaj podpis">
                  ${icon("image-up")}
                </button>
                <button class="button button-icon-only button-ghost" type="button" data-action="remove-signature" aria-label="Izbriši shranjeni podpis" title="Izbriši shranjeni podpis">
                  ${icon("trash-2")}
                </button>
              </div>
              ${
                placement.inserted
                  ? `<label class="signature-size-control">
                      <span>Velikost podpisa</span>
                      <input type="range" min="25" max="${100 - placement.x}" step="1" value="${placement.width}" data-signature-size />
                    </label>
                    <p class="signature-helper">Na dokumentu ga lahko povlečeš ali spremeniš velikost z ročico v kotu.</p>`
                  : `<p class="signature-helper">Podpis je pripravljen. Vstavi ga samo v dokumente, ki jih želiš elektronsko podpisati.</p>`
              }`
            : `<p class="empty-text">Enkrat naloži fotografijo podpisa PNG ali JPG. Nato ga lahko vstaviš v izbrane dokumente.</p>
              <button class="button button-outline" type="button" data-action="upload-signature">
                ${icon("image-up")} Naloži podpis
              </button>`
        }
        <p class="signature-storage-note">${icon("hard-drive")} Podpis je shranjen samo v tem brskalniku in na tem računalniku.</p>
      </div>
    </section>
  `;
}

function normalizeCompanyDirectory(companies) {
  if (!Array.isArray(companies)) return [];
  const seen = new Set();
  return companies
    .map((company) => ({
      id: String(company?.id || generateId()),
      name: String(company?.name || "").trim(),
      address: String(company?.address || "").trim(),
      taxNumber: String(company?.taxNumber || "").trim(),
      createdAt: company?.createdAt || "",
      updatedAt: company?.updatedAt || ""
    }))
    .filter((company) => company.name && company.address)
    .filter((company) => {
      const key = company.name.toLocaleLowerCase("sl-SI");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "sl-SI"));
}

function editingCompany() {
  return state.companies.find((company) => company.id === state.companyDirectory.editingId) || null;
}

function companyDirectorySuggestions(currentValue = "") {
  const lower = String(currentValue || "").trim().toLocaleLowerCase("sl-SI");
  const values = [
    ...state.companies.map((company) => company.name),
    ...uniqueSuggestions(state.proposals, "company", currentValue)
  ].filter(Boolean);
  const unique = values.filter(
    (value, index) =>
      values.findIndex((candidate) => candidate.toLocaleLowerCase("sl-SI") === value.toLocaleLowerCase("sl-SI")) === index
  );
  return (lower
    ? unique.filter((value) => value.toLocaleLowerCase("sl-SI").includes(lower))
    : unique
  ).slice(0, 6);
}

function renderCompanyDirectoryPanel() {
  const editing = editingCompany();
  const hasCompanies = state.companies.length > 0;
  return `
    <section class="panel company-directory-panel">
      <div class="panel-header">
        <span class="panel-icon">${icon("building-2")}</span>
        <span class="panel-title">Podjetja</span>
      </div>
      <div class="panel-body">
        <p class="company-directory-intro">Shrani podatke partnerjev za hitrejši in pravilnejši vnos v dokumente.</p>
        <form class="company-directory-form" data-company-directory-form>
          <label>
            <span>Ime podjetja <b aria-hidden="true">*</b></span>
            <input type="text" name="name" value="${escapeHtml(editing?.name || "")}" autocomplete="organization" required />
          </label>
          <label>
            <span>Naslov <b aria-hidden="true">*</b></span>
            <textarea name="address" rows="2" required>${escapeHtml(editing?.address || "")}</textarea>
          </label>
          <label>
            <span>Davčna številka <small>neobvezno</small></span>
            <input type="text" name="taxNumber" value="${escapeHtml(editing?.taxNumber || "")}" inputmode="numeric" autocomplete="off" />
          </label>
          ${
            state.companyDirectory.error
              ? `<p class="field-error" role="alert">${escapeHtml(state.companyDirectory.error)}</p>`
              : ""
          }
          <div class="company-directory-actions">
            ${
              editing
                ? `<button class="button button-outline" type="button" data-action="cancel-company-edit">Prekliči</button>`
                : ""
            }
            <button class="button button-solid" type="submit">${editing ? "Shrani spremembe" : "Dodaj podjetje"}</button>
          </div>
        </form>
        ${
          hasCompanies
            ? `<div class="company-directory-list" aria-label="Shranjena podjetja">
                ${state.companies
                  .map(
                    (company) => `
                      <div class="company-directory-row">
                        <button class="company-directory-select" type="button" data-action="edit-company" data-company-id="${escapeHtml(company.id)}" aria-label="Uredi podjetje ${escapeHtml(company.name)}">
                          <strong>${escapeHtml(company.name)}</strong>
                          <span>${escapeHtml(company.address)}</span>
                          ${company.taxNumber ? `<small>Davčna št.: ${escapeHtml(company.taxNumber)}</small>` : ""}
                        </button>
                        <button class="button button-icon-only button-ghost company-directory-delete" type="button" data-action="delete-company" data-company-id="${escapeHtml(company.id)}" aria-label="Odstrani podjetje ${escapeHtml(company.name)}" title="Odstrani podjetje">
                          ${icon("trash-2")}
                        </button>
                      </div>`
                  )
                  .join("")}
              </div>`
            : `<p class="empty-text">Dodaj podjetje, ki ga želiš imeti pri roki za naslednje predloge.</p>`
        }
      </div>
    </section>
  `;
}

function serialPreviewFor(proposal) {
  if (proposal.serial) return proposal.serial;
  return `${normalizeLabCode(proposal.labCode)}-${yearFromDate(proposal.issueDate)}-___`;
}

function accountingNumberPreviewFor(proposal) {
  return `${yearFromDate(proposal.issueDate)}- ____`;
}

function renderProposalInput({
  proposal,
  field,
  baseClass,
  id,
  idPrefix = "",
  type = "text",
  inputmode = "",
  smartField = false,
  autocomplete = "",
  ariaLabel = "",
  preview = false,
  value = proposal[field] || ""
}) {
  const actualId = `${idPrefix}${id || field}`;
  const className = preview ? `${baseClass} preview-readonly-field` : validationControlClass(baseClass, field);
  const smartAttr = !preview && smartField ? ` data-smart-field="${escapeHtml(field)}"` : "";
  const dataFieldAttr = preview ? "" : ` data-field="${escapeHtml(field)}"`;
  const readonlyAttr = preview ? " readonly tabindex=\"-1\"" : "";
  const autocompleteAttr = autocomplete ? ` autocomplete="${escapeHtml(autocomplete)}"` : "";
  const inputmodeAttr = inputmode ? ` inputmode="${escapeHtml(inputmode)}"` : "";
  const ariaLabelAttr = ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : "";
  const validationAttrs = preview ? "" : validationControlAttrs(field);

  return `<input class="${className}" id="${escapeHtml(actualId)}"${dataFieldAttr}${smartAttr} type="${escapeHtml(type)}"${inputmodeAttr}${autocompleteAttr}${ariaLabelAttr} value="${escapeHtml(value)}"${readonlyAttr} ${validationAttrs} />`;
}

function renderProposalPaper(proposal = state.current, { preview = false, modal = false } = {}) {
  const validation = preview ? emptyValidationState() : state.validation || emptyValidationState();
  const idPrefix = preview ? "preview-" : modal ? "modal-" : "";
  const fullNameId = `${idPrefix}fullName`;
  const jobTitleId = `${idPrefix}jobTitle`;
  const companyId = `${idPrefix}company`;
  const valueId = `${idPrefix}estimatedValue`;
  const fieldError = (field) => (preview ? "" : renderFieldError(field));
  const textareaClass = preview
    ? "doc-textarea explanation-notes preview-readonly-field"
    : validationControlClass("doc-textarea explanation-notes", "explanation");
  const textareaAttrs = preview
    ? "readonly tabindex=\"-1\""
    : `data-field="explanation" data-smart-field="explanation" ${validationControlAttrs("explanation")}`;

  return `
    <article class="paper${preview ? " proposal-preview-document-paper" : ""}" aria-label="Predlog nakupa drobnega materiala">
      <div class="paper-header">
        ${centerRogLogoMarkup()}
      </div>

      <h1 class="document-title">PREDLOG NAKUPA DROBNEGA MATERIALA</h1>
      ${
        !preview && validation.message
          ? `<div class="form-error-banner" role="alert">${escapeHtml(validation.message)}</div>`
          : ""
      }

      <div class="doc-line">
        <label for="${escapeHtml(fullNameId)}">Ime in priimek:</label>
        <span class="smart-field">
          ${renderProposalInput({
            proposal,
            field: "fullName",
            baseClass: "doc-field person-name-field",
            id: "fullName",
            idPrefix,
            autocomplete: "name",
            preview
          })}
          ${fieldError("fullName")}
        </span>
      </div>

      <div class="doc-line">
        <label for="${escapeHtml(jobTitleId)}">Zaposlen/a na delovnem mestu:</label>
        <span class="smart-field">
          ${renderProposalInput({
            proposal,
            field: "jobTitle",
            baseClass: "doc-field person-job-field",
            id: "jobTitle",
            idPrefix,
            preview
          })}
          ${fieldError("jobTitle")}
        </span>
      </div>

      <div class="doc-block purpose-block">
        <p class="doc-block-label">Predlagam nakup naslednjega drobnega materiala za potrebe:</p>
        <span class="smart-field">
          ${renderProposalInput({
            proposal,
            field: "purpose",
            baseClass: "doc-field doc-purpose",
            idPrefix,
            smartField: true,
            preview
          })}
          ${fieldError("purpose")}
        </span>
      </div>

      <div class="doc-block">
        <p class="doc-block-label explanation-label">Opis / obrazložitev potrebe:</p>
        <span class="smart-field">
          <textarea class="${textareaClass}" ${textareaAttrs} rows="6" aria-label="Opis oziroma obrazložitev potrebe" placeholder="- Merkur: vijaki, mozniki in sidra 3 x 12,90 EUR&#10;- zaščitne rokavice 4 x 7,50 EUR&#10;- brusni papir in čistila 25 EUR">${escapeHtml(proposal.explanation)}</textarea>
          ${fieldError("explanation")}
        </span>
      </div>

      <div class="doc-line">
        <label for="${escapeHtml(companyId)}">Podjetje:</label>
        <span class="smart-field">
          ${renderProposalInput({
            proposal,
            field: "company",
            baseClass: "doc-field",
            id: "company",
            idPrefix,
            smartField: true,
            preview
          })}
          ${fieldError("company")}
        </span>
      </div>

      <div class="doc-line value-line">
        <label for="${escapeHtml(valueId)}">V okvirni skupni vrednosti: cca</label>
        <span class="field-stack amount-field-stack">
          ${renderProposalInput({
            proposal,
            field: "estimatedValueCents",
            baseClass: "doc-field amount-field",
            id: "estimatedValue",
            idPrefix,
            inputmode: "decimal",
            value: centsToInputValue(proposal.estimatedValueCents),
            preview
          })}
          ${fieldError("estimatedValueCents")}
        </span>
        <span>brez DDV</span>
      </div>

      <footer class="doc-footer">
        <div class="issue-signature-row">
          <div class="issue-line">
            <span class="fixed-place" aria-label="Kraj izdaje">${escapeHtml(DEFAULTS.city)}</span>
            <span class="field-stack date-field-stack">
              ${renderProposalInput({
                proposal,
                field: "issueDate",
                baseClass: "doc-field date-field",
                idPrefix,
                type: "date",
                ariaLabel: "Datum izdaje",
                value: proposal.issueDate,
                preview
              })}
              ${fieldError("issueDate")}
            </span>
          </div>
          <div class="signature-box">
            <span class="signature-label">Podpis vodje laba</span>
            ${renderSignatureZone("proposal", proposal, { interactive: !preview })}
          </div>
        </div>

        <div class="accounting-number-line">
          <span>Št.:</span>
          <strong>${escapeHtml(accountingNumberPreviewFor(proposal))}</strong>
        </div>

        <div class="approval-box">
          <div class="approval-choice-group">
            <span class="approval-label">SOGLAŠAM</span>
            <span class="approval-options">
              <span>DA</span>
              <span>/</span>
              <span>NE</span>
            </span>
          </div>
          <div class="director-block">
            <span class="director-fixed-name">${escapeHtml(DEFAULTS.directorName)}, <em>${escapeHtml(DEFAULTS.directorRole)}</em></span>
            <span class="director-signature-rule" aria-label="Podpis direktorice"></span>
          </div>
        </div>
      </footer>
    </article>
  `;
}

function documentStatusOption(value) {
  return DOCUMENT_STATUS_OPTIONS.find((option) => option.value === value) || DOCUMENT_STATUS_OPTIONS[0];
}

function renderDocumentRow(proposal, { modal = false } = {}) {
  const status = documentStatusOption(proposal.documentStatus || "");
  const serial = proposal.serial || "Brez številke";
  const company = proposal.company || "Brez podjetja";
  const rowLabel = `Poglej dokument ${serial}; ${company}; ${formatCurrency(proposal.estimatedValueCents || 0)}`;
  return `
    <button
      class="recent-row${modal ? " modal-recent-row" : ""} status-${status.className}"
      type="button"
      aria-label="${escapeHtml(rowLabel)}"
      data-load-id="${escapeHtml(proposal.id)}"
      data-status-context-id="${escapeHtml(proposal.id)}"
    >
      <span class="recent-meta">
        <span class="recent-title">
          <span
            class="recent-status-dot recent-status-dot-${status.className}"
            data-status-menu-id="${escapeHtml(proposal.id)}"
            title="Status: ${escapeHtml(status.label)}"
            aria-hidden="true"
          ></span>
          ${proposal.offerAttachmentId ? `<span class="recent-attachment-icon" title="Pripeta ponudba" aria-label="Pripeta ponudba">${icon("paperclip")}</span>` : ""}
          <span>${escapeHtml(serial)}</span>
        </span>
      </span>
      ${icon("chevron-right")}
    </button>
  `;
}

function renderStatusMenu() {
  if (!state.statusMenu) return "";
  const proposal = state.proposals.find((item) => item.id === state.statusMenu.proposalId);
  if (!proposal) return "";

  const currentStatus = proposal.documentStatus || "";
  return `
    <div
      class="status-menu"
      style="left: ${Math.round(state.statusMenu.x)}px; top: ${Math.round(state.statusMenu.y)}px;"
      role="menu"
      aria-label="Status dokumenta"
    >
      ${DOCUMENT_STATUS_OPTIONS.map((option) => {
        const selected = option.value === currentStatus;
        return `
          <button
            class="status-menu-option"
            type="button"
            role="menuitem"
            data-status-option-id="${escapeHtml(proposal.id)}"
            data-status-value="${escapeHtml(option.value)}"
          >
            <span class="recent-status-dot recent-status-dot-${option.className}" aria-hidden="true"></span>
            <span>${escapeHtml(option.label)}</span>
            ${selected ? icon("check") : ""}
          </button>
        `;
      }).join("")}
      <span class="status-menu-separator" aria-hidden="true"></span>
      <button
        class="status-menu-option status-menu-option-danger"
        type="button"
        role="menuitem"
        data-delete-request-id="${escapeHtml(proposal.id)}"
      >
        ${icon("trash-2")}
        <span>Izbriši predlog ...</span>
      </button>
    </div>
  `;
}

function renderMaterialIssueRow(issue) {
  const status = materialIssueStatusOption(issue.status || "draft");
  const serial = issue.serial || "Osnutek";
  const buyer = issue.buyerName || "Brez uporabnika";
  return `
    <button
      class="recent-row material-recent-row status-${status.className}"
      type="button"
      data-load-material-issue-id="${escapeHtml(issue.id)}"
      data-material-status-context-id="${escapeHtml(issue.id)}"
      aria-label="Odpri izdajnico ${escapeHtml(serial)}"
    >
      <span class="recent-meta">
        <span class="recent-title">
          <span
            class="recent-status-dot recent-status-dot-${status.className}"
            data-material-status-menu-id="${escapeHtml(issue.id)}"
            title="Status: ${escapeHtml(status.label)}"
            aria-hidden="true"
          ></span>
          <span>${escapeHtml(serial)}</span>
        </span>
        <span class="recent-subtitle">${escapeHtml(buyer)} · ${formatCurrency(materialIssueTotalCents(issue))}</span>
      </span>
      ${icon("chevron-right")}
    </button>
  `;
}

function renderMaterialStatusMenu() {
  if (!state.materialStatusMenu) return "";
  const issue = state.materialIssues.find((item) => item.id === state.materialStatusMenu.issueId);
  if (!issue) return "";

  const currentStatus = issue.status || "draft";
  return `
    <div
      class="status-menu"
      style="left: ${Math.round(state.materialStatusMenu.x)}px; top: ${Math.round(state.materialStatusMenu.y)}px;"
      role="menu"
      aria-label="Status izdajnice"
    >
      ${MATERIAL_ISSUE_STATUSES.map((option) => {
        const selected = option.value === currentStatus;
        const status = materialIssueStatusOption(option.value);
        return `
          <button
            class="status-menu-option"
            type="button"
            role="menuitem"
            data-material-status-option-id="${escapeHtml(issue.id)}"
            data-material-status-value="${escapeHtml(option.value)}"
          >
            <span class="recent-status-dot recent-status-dot-${status.className}" aria-hidden="true"></span>
            <span>${escapeHtml(option.label)}</span>
            ${selected ? icon("check") : ""}
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderDocumentPopover() {
  if (!state.documentPopover) return "";
  const proposal = state.proposals.find((item) => item.id === state.documentPopover.proposalId);
  if (!proposal) return "";

  const status = documentStatusOption(proposal.documentStatus || "");
  const company = proposal.company || "Brez podjetja";
  const attachmentText = proposal.offerAttachmentId ? "Pripeta ponudba" : "Brez pripete ponudbe";

  return `
    <div
      class="document-popover"
      style="left: ${Math.round(state.documentPopover.x)}px; top: ${Math.round(state.documentPopover.y)}px;"
      role="tooltip"
    >
      <span class="document-popover-label">Podjetje</span>
      <strong>${escapeHtml(company)}</strong>
      <span>${formatCurrency(proposal.estimatedValueCents || 0)} · ${escapeHtml(status.label)} · ${escapeHtml(attachmentText)}</span>
    </div>
  `;
}

function formatChangeLogDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("sl-SI", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatModalDate(value) {
  if (!value) return "Brez datuma";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Brez datuma";
  return new Intl.DateTimeFormat("sl-SI", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function formatFileSize(size) {
  const bytes = Number(size || 0);
  if (!bytes) return "Velikost ni znana";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

function proposalStatusTone(status) {
  if (status.value === "approved") return "approved";
  if (status.value === "submitted") return "review";
  if (status.value === "rejected") return "rejected";
  return "draft";
}

function formatProposalChangeValue(change, value) {
  if (change?.field === "estimatedValueCents") return formatCurrency(Number(value || 0));
  if (change?.field === "documentStatus") return documentStatusOption(value || "").label;
  if (change?.field === "issueDate") return formatSlovenianDate(value);
  const normalized = String(value ?? "").trim();
  return normalized || "prazno";
}

function truncateTimelineValue(value) {
  const text = String(value ?? "");
  return text.length > 54 ? `${text.slice(0, 52)}...` : text;
}

function renderProposalTimeline(changeLog, author) {
  if (!changeLog.length) return `<p class="empty-text">Za ta dokument še ni zabeleženih sprememb.</p>`;

  return `
    <ol class="proposal-change-log proposal-timeline">
      ${changeLog
        .map((entry) => {
          const changes = Array.isArray(entry.changes) ? entry.changes : [];
          const fields = changes.length ? changes.map((change) => change.label) : Array.isArray(entry.fields) ? entry.fields : [];
          return `
            <li class="proposal-timeline-entry">
              <span class="proposal-timeline-icon">${icon(entry.type === "created" ? "file-plus-2" : "history")}</span>
              <div class="proposal-timeline-content">
                <time>${escapeHtml(formatChangeLogDate(entry.createdAt))}</time>
                <strong>${escapeHtml(author || "Uporabnik")}</strong>
                ${
                  changes.length
                    ? `<div class="proposal-timeline-diff">
                        ${changes
                          .slice(0, 3)
                          .map((change) => {
                            const before = truncateTimelineValue(formatProposalChangeValue(change, change.before));
                            const after = truncateTimelineValue(formatProposalChangeValue(change, change.after));
                            return `
                              <span class="proposal-timeline-field">${escapeHtml(change.label)}</span>
                              <span class="proposal-timeline-values">${escapeHtml(before)} <span aria-hidden="true">-&gt;</span> ${escapeHtml(after)}</span>
                            `;
                          })
                          .join("")}
                        ${
                          changes.length > 3
                            ? `<span class="proposal-timeline-more">+ ${changes.length - 3} dodatnih sprememb</span>`
                            : ""
                        }
                      </div>`
                    : `<span>${escapeHtml(fields.length ? `Spremenjena polja: ${fields.join(", ")}.` : entry.summary || "Sprememba dokumenta.")}</span>`
                }
              </div>
            </li>
          `;
        })
        .join("")}
    </ol>
  `;
}

function setProposalPreviewAttachment(attachment) {
  if (state.proposalPreviewAttachmentUrl) {
    URL.revokeObjectURL(state.proposalPreviewAttachmentUrl);
  }
  state.proposalPreviewAttachment = attachment || null;
  state.proposalPreviewAttachmentUrl = attachment?.blob
    ? URL.createObjectURL(attachment.blob)
    : "";
}

function renderProposalAttachmentPreview(attachment, attachmentUrl, { editable = false } = {}) {
  const hasAttachment = Boolean(attachment && attachmentUrl);
  const isImage = String(attachment?.mimeType || "").startsWith("image/");
  const isPdf = String(attachment?.mimeType || "").includes("pdf");

  return `
    <section class="proposal-preview-section proposal-attachment-card">
      <div class="proposal-preview-section-head">
        <h3>${icon("paperclip")} Priponke</h3>
      </div>
      ${
        hasAttachment
          ? `<div class="proposal-attachment-file">
              <span class="proposal-attachment-file-icon">${icon(isPdf ? "file-text" : "image")}</span>
              <span>
                <strong>${escapeHtml(attachment.fileName || "Priponka")}</strong>
                <small>${escapeHtml(formatFileSize(attachment.size))}</small>
              </span>
            </div>
            <div class="proposal-attachment-viewer">
              ${
                isImage
                  ? `<img src="${escapeHtml(attachmentUrl)}" alt="Predogled pripete ponudbe" />`
                  : isPdf
                    ? `<iframe src="${escapeHtml(attachmentUrl)}" title="Predogled pripete ponudbe"></iframe>`
                    : `<div class="proposal-attachment-fallback">${icon("paperclip")} Priponka je dodana, vendar je ni mogoče prikazati v predogledu.</div>`
              }
            </div>`
          : `<div class="proposal-attachment-empty">
              ${icon("file-up")}
              <strong>Ni pripete ponudbe</strong>
              <span>Ponudbo PDF ali sliko lahko dodaš med urejanjem dokumenta.</span>
              ${
                editable
                  ? `<button class="button button-outline" type="button" data-action="choose-preview-attachment">${icon("upload")} Naloži priponko</button>`
                  : ""
              }
            </div>`
      }
      ${
        editable && hasAttachment
          ? `<div class="proposal-attachment-actions">
              <button class="button button-outline" type="button" data-action="choose-preview-attachment">
                ${icon("upload")} Zamenjaj
              </button>
              <button class="button button-ghost" type="button" data-action="remove-preview-attachment">
                ${icon("x")} Odstrani
              </button>
            </div>`
          : ""
      }
    </section>
  `;
}

function renderProposalPreviewModal() {
  if (!state.proposalPreviewId) return "";
  const proposal = state.proposals.find((item) => item.id === state.proposalPreviewId);
  if (!proposal) return "";

  const isEditMode = state.proposalPreviewMode === "edit";
  const proposalForDocument = isEditMode && state.current.id === proposal.id ? state.current : proposal;
  const attachment = isEditMode ? state.attachment : state.proposalPreviewAttachment;
  const serial = proposal.serial || "Brez številke";
  const changeLog = Array.isArray(proposal.changeLog) ? proposal.changeLog.slice().reverse() : [];
  const status = documentStatusOption(proposal.documentStatus || "");
  const statusTone = proposalStatusTone(status);
  const author = proposal.fullName || "Brez avtorja";
  const createdAt = proposal.createdAt || proposal.updatedAt || proposal.issueDate;
  const zoom = Number(state.proposalPreviewZoom || 0.82);
  const zoomLabel = `${Math.round(zoom * 100)} %`;

  return `
    <div class="modal-backdrop proposal-preview-backdrop" data-action="close-proposal-preview" role="presentation">
      <section class="modal-window proposal-preview-modal" role="dialog" aria-modal="true" aria-labelledby="proposal-preview-title" data-modal-window>
        <header class="proposal-preview-header">
          <div class="proposal-preview-title-block">
            <p>${isEditMode ? "Urejanje dokumenta" : "Predogled dokumenta"}</p>
            <h2 id="proposal-preview-title">Predlog nakupa drobnega materiala</h2>
            <div class="proposal-preview-meta-line">
              <strong>${escapeHtml(serial)}</strong>
              <span>${escapeHtml(author)} · ustvarjeno ${escapeHtml(formatModalDate(createdAt))}</span>
            </div>
          </div>
          <button class="button button-icon-only proposal-preview-close" type="button" data-action="close-proposal-preview" aria-label="Zapri predogled">
            ${icon("x")}
          </button>
        </header>
        <div class="modal-body proposal-preview-body">
          <main class="proposal-preview-main" aria-label="${isEditMode ? "Urejanje dokumenta" : "Predogled dokumenta"}">
            <div class="proposal-preview-viewer-toolbar" aria-label="Orodja predogleda PDF">
              <div class="proposal-preview-toolbar-tools">
                <span class="proposal-preview-zoom-group">
                  <button class="button button-icon-only button-ghost" type="button" data-action="zoom-proposal-preview-out" aria-label="Pomanjšaj predogled">${icon("minus")}</button>
                  <strong>${escapeHtml(zoomLabel)}</strong>
                  <button class="button button-icon-only button-ghost" type="button" data-action="zoom-proposal-preview-in" aria-label="Povečaj predogled">${icon("plus")}</button>
                </span>
                <button class="button button-outline proposal-fit-button" type="button" data-action="fit-proposal-preview">${icon("maximize-2")} Fit width</button>
                <span class="proposal-page-indicator">Stran 1 / 1</span>
              </div>
              <div class="proposal-preview-toolbar-actions">
                ${
                  isEditMode
                    ? `<button class="button button-solid" type="button" data-action="save-proposal-preview">${icon("save")} Shrani spremembe</button>
                      <button class="button button-outline" type="button" data-action="finish-proposal-preview-edit">${icon("arrow-left")} Predogled</button>`
                    : `<button class="button button-solid" type="button" data-action="edit-proposal-preview">${icon("pencil")} Uredi dokument</button>
                      <button class="button button-outline" type="button" data-action="download-preview-proposal">${icon("download")} Export PDF</button>
                      <button class="button button-outline" type="button" data-action="print-preview-proposal">${icon("printer")} Natisni</button>`
                }
              </div>
            </div>
            <div class="proposal-preview-document${isEditMode ? " is-editing" : ""}" style="${documentLayoutCssVariables()}">
              <div class="paper-frame proposal-preview-paper-frame" style="--proposal-preview-scale:${zoom}">
                ${renderProposalPaper(proposalForDocument, { preview: !isEditMode, modal: isEditMode })}
              </div>
            </div>
          </main>
          <aside class="proposal-preview-side" aria-label="Podatki in dejanja dokumenta">
            ${renderProposalAttachmentPreview(attachment, state.proposalPreviewAttachmentUrl, { editable: isEditMode })}
            <section class="proposal-preview-section">
              <div class="proposal-preview-section-head">
                <h3>${icon("circle-dot")} Status</h3>
              </div>
              <span class="proposal-status-badge proposal-status-badge-${escapeHtml(statusTone)}">${escapeHtml(status.label)}</span>
            </section>
            <section class="proposal-preview-section proposal-change-card">
              <div class="proposal-preview-section-head">
                <h3>${icon("git-commit-vertical")} Zgodovina</h3>
              </div>
              ${renderProposalTimeline(changeLog, author)}
            </section>
          </aside>
        </div>
      </section>
    </div>
  `;
}

function renderDeleteConfirm() {
  if (!state.deleteConfirmId) return "";
  const proposal = state.proposals.find((item) => item.id === state.deleteConfirmId);
  if (!proposal) return "";

  const serial = proposal.serial || "ta predlog";
  const company = proposal.company || "Brez podjetja";

  return `
    <div class="modal-backdrop delete-modal-backdrop" data-action="cancel-delete" role="presentation">
      <section class="modal-window delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title" data-modal-window>
        <header class="modal-header">
          <h2 class="modal-title" id="delete-modal-title">Izbrišem predlog?</h2>
          <button class="button button-icon-only button-ghost" type="button" data-action="cancel-delete" aria-label="Prekliči brisanje">
            ${icon("x")}
          </button>
        </header>
        <div class="modal-body delete-modal-body">
          <p>
            Predlog <strong>${escapeHtml(serial)}</strong> za <strong>${escapeHtml(company)}</strong> bo odstranjen iz lokalne evidence in letnega seštevka.
          </p>
          <p class="delete-warning">Tega ni mogoče razveljaviti. Datoteke PDF, ki so že prenesene ali natisnjene zunaj aplikacije, se seveda ne izbrišejo.</p>
          <div class="modal-actions">
            <button class="button button-outline" type="button" data-action="cancel-delete">Prekliči</button>
            <button class="button button-solid button-danger" type="button" data-action="confirm-delete">Izbriši predlog</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderHourRowDeleteConfirm() {
  const pending = state.hourRowDeleteConfirm;
  if (!pending) return "";
  const report = state.hourBatch?.reports.find((item) => item.id === pending.reportId);
  const row = report?.rows.find((item) => item.id === pending.rowId);
  if (!report || !row) return "";

  const rowLabel = [row.date, row.shiftDescription || row.workType]
    .filter(Boolean)
    .join(" · ");

  return `
    <div class="modal-backdrop delete-modal-backdrop" data-action="cancel-hour-row-delete" role="presentation">
      <section class="modal-window delete-modal" role="dialog" aria-modal="true" aria-labelledby="hour-row-delete-title" data-modal-window>
        <header class="modal-header">
          <h2 class="modal-title" id="hour-row-delete-title">Izbrišem vrstico?</h2>
          <button class="button button-icon-only button-ghost" type="button" data-action="cancel-hour-row-delete" aria-label="Prekliči brisanje vrstice">
            ${icon("x")}
          </button>
        </header>
        <div class="modal-body delete-modal-body">
          <p>
            Vrstica <strong>${escapeHtml(rowLabel || "iz poročila ur")}</strong> bo odstranjena iz poročila za <strong>${escapeHtml(report.personName)}</strong>.
          </p>
          <p class="delete-warning">Po brisanju se bodo ure, zneski in razčlenitev samodejno preračunali.</p>
          <div class="modal-actions">
            <button class="button button-outline" type="button" data-action="cancel-hour-row-delete">Prekliči</button>
            <button class="button button-solid button-danger" type="button" data-action="confirm-hour-row-delete">Izbriši vrstico</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderUnsavedPrompt() {
  if (!state.unsavedPrompt) return "";

  return `
    <div class="modal-backdrop unsaved-modal-backdrop" data-action="cancel-unsaved" role="presentation">
      <section class="modal-window unsaved-modal" role="dialog" aria-modal="true" aria-labelledby="unsaved-modal-title" data-modal-window>
        <header class="modal-header">
          <h2 class="modal-title" id="unsaved-modal-title">Neshranjene spremembe</h2>
          <button class="button button-icon-only button-ghost" type="button" data-action="cancel-unsaved" aria-label="Ostani na obrazcu">
            ${icon("x")}
          </button>
        </header>
        <div class="modal-body delete-modal-body">
          <p>V obrazcu imate vnesene podatke, ki še niso shranjeni. Če nadaljujete, se lahko izgubijo.</p>
          <div class="modal-actions">
            <button class="button button-outline" type="button" data-action="cancel-unsaved">Ostani na obrazcu</button>
            <button class="button button-solid button-danger" type="button" data-action="confirm-unsaved">Nadaljuj brez shranjevanja</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function proposalCountLabel(count) {
  if (count === 1) return "1 predlog";
  if (count === 2) return "2 predloga";
  if (count === 3 || count === 4) return `${count} predlogi`;
  return `${count} predlogov`;
}

function renderSpendingBreakdown(breakdown, totalCents) {
  if (!breakdown.length) {
    return `
      <span class="spending-breakdown-empty">Ni še shranjenih predlogov za to leto.</span>
    `;
  }

  return `
    <span class="spending-breakdown-head">
      <span>Razčlenitev po potrebah</span>
      <strong>${formatCurrency(totalCents)}</strong>
    </span>
    <span class="spending-breakdown-list">
      ${breakdown
        .map(
          (item) => `
            <span class="spending-breakdown-row">
              <span class="spending-breakdown-label">
                <strong>${escapeHtml(item.label)}</strong>
                <span>${proposalCountLabel(item.count)}</span>
              </span>
              <span class="spending-breakdown-value">${formatCurrency(item.cents)}</span>
            </span>
          `
        )
        .join("")}
    </span>
  `;
}

function renderOnboarding() {
  if (!state.onboarding.active) return "";
  if (state.onboarding.stage === "welcome") return renderOnboardingWelcome();
  if (state.onboarding.stage === "tour") return renderOnboardingTour();
  if (state.onboarding.stage === "storage-warning") return renderOnboardingStorageWarning();
  if (state.onboarding.stage === "install-shortcut") return renderOnboardingInstallShortcut();
  return "";
}

function renderOnboardingWelcome() {
  return `
    <div class="onboarding-backdrop" role="presentation">
      <section class="onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <form data-onboarding-welcome-form>
          <h2 class="onboarding-title" id="onboarding-title">Živjo, nekdo, ki bi rad, da se kaj zgodi samo od sebe.</h2>
          <p class="onboarding-copy">
            Za začetek mi povej, kako se imenuje tvoj lab ali oddelek, da bo obema lažje.
          </p>

          <label class="onboarding-label" for="onboardingLabName">Naziv laba ali oddelka</label>
          <input
            class="onboarding-input"
            id="onboardingLabName"
            data-onboarding-lab-name
            value="${escapeHtml(state.onboarding.labName)}"
            placeholder="Kovinarski lab"
            autocomplete="organization-title"
            required
          />
          <div class="onboarding-code-preview">
            <span>Interna kratica</span>
            <strong data-onboarding-code-preview>${escapeHtml(state.onboarding.labCodePreview || DEFAULTS.labCode)}</strong>
          </div>

          <div class="onboarding-actions">
            <button class="button button-outline" type="button" data-onboarding-action="skip">Preskoči</button>
            <button class="button button-solid" type="submit">Začni</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderOnboardingTour() {
  const step = ONBOARDING_STEPS[state.onboarding.step] || ONBOARDING_STEPS[0];
  const stepNumber = state.onboarding.step + 1;
  const isLast = stepNumber === ONBOARDING_STEPS.length;

  return `
    <div class="onboarding-tour-layer" aria-live="polite">
      <div class="onboarding-spotlight" data-onboarding-spotlight aria-hidden="true"></div>
      <section class="onboarding-tooltip" data-onboarding-tooltip role="dialog" aria-labelledby="onboarding-step-title">
        <div class="onboarding-step-count">${stepNumber} / ${ONBOARDING_STEPS.length}</div>
        <h2 class="onboarding-tooltip-title" id="onboarding-step-title">${escapeHtml(step.title)}</h2>
        <p class="onboarding-tooltip-copy">${escapeHtml(step.body)}</p>
        <div class="onboarding-tooltip-actions">
          <button class="button button-outline" type="button" data-onboarding-action="skip">Preskoči</button>
          <span class="onboarding-action-spacer"></span>
          ${
            state.onboarding.step > 0
              ? `<button class="button button-outline" type="button" data-onboarding-action="back">Nazaj</button>`
              : ""
          }
          <button class="button button-solid" type="button" data-onboarding-action="${isLast ? "finish" : "next"}">
            ${isLast ? "Končaj" : "Naprej"}
          </button>
        </div>
      </section>
    </div>
  `;
}

function renderOnboardingStorageWarning() {
  return `
    <aside class="onboarding-storage-warning" role="status" aria-live="polite">
      <div class="onboarding-storage-icon">${icon("triangle-alert")}</div>
      <div class="onboarding-storage-content">
        <h2 class="onboarding-storage-title">Pomembno: ta aplikacija si stvari zapomni lokalno</h2>
        <p>
          Dokumenti, serijske številke, pripete ponudbe in predlogi za samodejno dopolnjevanje se shranjujejo v tem brskalniku na tem računalniku.
        </p>
        <ul>
          <li>Za isto evidenco uporabljaj isti računalnik, isti brskalnik in isti uporabniški profil.</li>
          <li>Ne briši podatkov strani, zgodovine brskanja, predpomnilnika ali podatkov spletnega mesta za to aplikacijo, ker se lahko izbrišejo tudi shranjeni predlogi in ponudbe.</li>
          <li>To ni skupna baza. Po uvodu odpri <strong>Backup</strong>, izberi mapo in nastavi dnevno šifrirano varnostno kopijo.</li>
          <li>Za uradni arhiv še vedno prenesi končni dokument PDF in ga shrani na dogovorjeno mesto.</li>
          <li>Če računalnik uporablja več oseb, upoštevaj, da so lokalno shranjeni dokumenti vidni v istem brskalniškem profilu.</li>
        </ul>
        <div class="onboarding-storage-actions">
          <button class="button button-solid" type="button" data-onboarding-action="confirm-storage">Razumem</button>
        </div>
      </div>
    </aside>
  `;
}

function renderOnboardingInstallShortcut() {
  return `
    <div class="onboarding-backdrop" role="presentation">
      <section class="onboarding-modal onboarding-shortcut-modal" role="dialog" aria-modal="true" aria-labelledby="onboarding-shortcut-title">
        <h2 class="onboarding-title" id="onboarding-shortcut-title">Še zadnji trik: namesti aplikacijo</h2>
        <p class="onboarding-copy">
          Če aplikacijo namestiš v Chromu, se odpre kot svoje okno in jo lahko pripneš v meni Start ali opravilno vrstico.
          Na računalniku z operacijskim sistemom Windows je postopek običajno tak:
        </p>
        <div class="shortcut-visual" aria-label="Shematski prikaz Chromovega menija za namestitev aplikacije">
          <div class="shortcut-browser-bar">
            <span class="shortcut-address">predlog-nakupa.vercel.app</span>
            <span class="shortcut-install-chip">${icon("download")} Namesti</span>
            <span class="shortcut-more" aria-hidden="true">⋮</span>
          </div>
          <div class="shortcut-menu-visual">
            <span>⋮ Več možnosti</span>
            <span>Predvajanje, shranjevanje in deljenje</span>
            <strong>Namesti stran kot aplikacijo</strong>
          </div>
        </div>
        <ol class="onboarding-steps-list">
          <li>Odpri aplikacijo v Google Chromu.</li>
          <li>Če se v desnem delu naslovne vrstice pokaže ikona za namestitev, klikni nanjo in izberi <strong>Namesti</strong>.</li>
          <li>Če ikone ni, klikni ikono s tremi pikami zgoraj desno.</li>
          <li>Izberi <strong>Predvajanje, shranjevanje in deljenje</strong>, nato <strong>Namesti stran kot aplikacijo</strong>.</li>
          <li>Potrdi namestitev. Aplikacija se pokaže v meniju Start; z desnim klikom jo lahko pripneš tudi v opravilno vrstico.</li>
        </ol>
        <p class="onboarding-copy onboarding-copy-muted">
          Če želiš klasično bližnjico prav na namizju, odpri <strong>chrome://apps</strong>, z desno tipko miške klikni aplikacijo, izberi <strong>Ustvari bližnjico</strong>, označi <strong>Namizje</strong> in klikni <strong>Ustvari</strong>.
          Če teh možnosti ni, ima Chrome morda drugačen jezik vmesnika ali pa ga upravlja organizacija.
        </p>
        <div class="onboarding-actions">
          <button class="button button-solid" type="button" data-onboarding-action="finish-onboarding">Razumem, začnimo</button>
        </div>
      </section>
    </div>
  `;
}

function serialPreview() {
  if (state.current.serial) return state.current.serial;
  return `${normalizeLabCode(state.current.labCode)}-${yearFromDate(state.current.issueDate)}-___`;
}

function accountingNumberPreview() {
  return `${yearFromDate(state.current.issueDate)}- ____`;
}

function documentSaveState() {
  if (!state.current.serial) {
    return {
      kind: "unsaved",
      label: "Ni shranjeno",
      detail: `Predvidena interna evidenca: ${serialPreview()}`,
      saveLabel: "Shrani dokument"
    };
  }

  if (state.dirty) {
    return {
      kind: "dirty",
      label: "Neshranjene spremembe",
      detail: `Interna evidenca: ${state.current.serial}`,
      saveLabel: "Shrani spremembe"
    };
  }

  return {
    kind: "saved",
    label: "Shranjeno",
    detail: `Interna evidenca: ${state.current.serial}`,
    saveLabel: "Shrani"
  };
}

function materialIssueSerialPreview() {
  const issue = state.currentMaterialIssue;
  if (issue.serial) return issue.serial;
  return `IZD-${normalizeLabCode(issue.labCode)}-${yearFromDate(issue.issueDate)}-___`;
}

function materialIssueSaveState() {
  const issue = state.currentMaterialIssue;
  if (!issue.serial) {
    return {
      kind: "unsaved",
      label: "Osnutek ni shranjen",
      detail: `Predvidena številka: ${materialIssueSerialPreview()}`,
      saveLabel: "Shrani osnutek"
    };
  }

  if (state.dirty) {
    return {
      kind: "dirty",
      label: "Neshranjene spremembe",
      detail: `Izdajnica: ${issue.serial}`,
      saveLabel: "Shrani spremembe"
    };
  }

  return {
    kind: "saved",
    label: issue.status === "draft" ? "Osnutek shranjen" : "Shranjeno",
    detail: `Izdajnica: ${issue.serial}`,
    saveLabel: "Shrani"
  };
}

function attendanceSaveState() {
  const sheet = state.currentAttendanceSheet;
  if (!sheet.id) {
    return {
      kind: "unsaved",
      label: "Ni shranjeno",
      detail: sheet.programName ? `Program: ${sheet.programName}` : "Nov podpisni list",
      saveLabel: "Shrani podpisni list"
    };
  }

  if (state.dirty) {
    return {
      kind: "dirty",
      label: "Neshranjene spremembe",
      detail: `${sheet.programName} · ${formatSlovenianDate(sheet.eventDate)}`,
      saveLabel: "Shrani spremembe"
    };
  }

  return {
    kind: "saved",
    label: "Shranjeno",
    detail: `${sheet.programName} · ${formatSlovenianDate(sheet.eventDate)}`,
    saveLabel: "Shrani"
  };
}

function hourReportsSaveState() {
  if (!hourReportsUnlocked()) {
    return {
      kind: "locked",
      label: "Zaklenjeno",
      detail:
        state.hourSecurity.status === "unconfigured"
          ? "Nastavi šestmestni PIN"
          : "Za dostop vnesi PIN",
      saveLabel: "Shrani profile"
    };
  }
  const report = selectedHourReport();
  if (!state.hourBatch) {
    return {
      kind: "unsaved",
      label: "Ni uvoza",
      detail: "Naloži Connecteam XLSX",
      saveLabel: "Shrani profile"
    };
  }

  if (state.dirty) {
    return {
      kind: "dirty",
      label: "Neshranjene spremembe",
      detail: report ? `${report.personName} · ${report.monthKey}` : state.hourBatch.fileName,
      saveLabel: "Shrani profile"
    };
  }

  return {
    kind: "saved",
    label: "Profili shranjeni",
    detail: report ? `${report.personName} · ${report.monthKey}` : state.hourBatch.fileName,
    saveLabel: "Shrani profile"
  };
}

function materialValidationError(fieldName) {
  return state.materialValidation.fields?.[fieldName] || "";
}

function materialValidationAttrs(fieldName) {
  const message = materialValidationError(fieldName);
  if (!message) return "";
  return `aria-invalid="true" aria-describedby="material-error-${escapeHtml(fieldName)}"`;
}

function materialValidationClass(baseClass, fieldName) {
  return `${baseClass}${materialValidationError(fieldName) ? " is-invalid" : ""}`;
}

function renderMaterialError(fieldName) {
  const message = materialValidationError(fieldName);
  return message
    ? `<span class="field-error material-field-error" id="material-error-${escapeHtml(fieldName)}">${escapeHtml(message)}</span>`
    : "";
}

function attendanceValidationError(fieldName) {
  return state.attendanceValidation.fields?.[fieldName] || "";
}

function attendanceValidationAttrs(fieldName) {
  const message = attendanceValidationError(fieldName);
  if (!message) return "";
  return `aria-invalid="true" aria-describedby="attendance-error-${escapeHtml(fieldName)}"`;
}

function attendanceValidationClass(baseClass, fieldName) {
  return `${baseClass}${attendanceValidationError(fieldName) ? " is-invalid" : ""}`;
}

function renderAttendanceError(fieldName) {
  const message = attendanceValidationError(fieldName);
  return message
    ? `<span class="field-error attendance-field-error" id="attendance-error-${escapeHtml(fieldName)}">${escapeHtml(message)}</span>`
    : "";
}

function materialStatusLabel(value) {
  return MATERIAL_ISSUE_STATUSES.find((status) => status.value === value)?.label || "Osnutek";
}

function materialIssueStatusOption(value) {
  const status = MATERIAL_ISSUE_STATUSES.find((option) => option.value === value) || MATERIAL_ISSUE_STATUSES[0];
  const classNameByStatus = {
    draft: "none",
    printed: "submitted",
    paid: "approved",
    collected: "approved"
  };
  return {
    ...status,
    className: classNameByStatus[status.value] || "none"
  };
}

function centerRogLogoMarkup() {
  return `
    <img class="center-rog-logo" src="/assets/center-rog-logo.svg" alt="Center Rog" />
  `;
}

function markDirty() {
  setDirtyState(true);
  syncSaveStateIndicator();
}

function clearDirty() {
  setDirtyState(false);
}

function setDirtyState(isDirty) {
  state.dirty = isDirty;
  updateBeforeUnloadProtection();
}

function syncSaveStateIndicator() {
  const saveState =
    state.documentType === "materialIssue"
      ? materialIssueSaveState()
      : state.documentType === "attendance"
        ? attendanceSaveState()
        : state.documentType === "hourReports"
          ? hourReportsSaveState()
        : documentSaveState();
  const pill = document.querySelector(".save-state-pill");
  if (pill) {
    pill.className = `save-state-pill save-state-${saveState.kind}`;
    pill.textContent = saveState.label;
  }

  const detail = document.querySelector(".brand-subtitle > span:last-child");
  if (detail) detail.textContent = saveState.detail;
}

function updateBeforeUnloadProtection() {
  if (state.dirty && !beforeUnloadBound) {
    window.addEventListener("beforeunload", handleBeforeUnload);
    beforeUnloadBound = true;
    return;
  }

  if (!state.dirty && beforeUnloadBound) {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    beforeUnloadBound = false;
  }
}

function handleBeforeUnload(event) {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = "";
  return "";
}

function emptyValidationState() {
  return {
    message: "",
    fields: {},
    firstInvalidField: "",
    firstInvalidSelector: ""
  };
}

function clearValidation() {
  state.validation = emptyValidationState();
}

function setValidation(validation) {
  state.validation = {
    message: validation?.message || "",
    fields: validation?.fields || {},
    firstInvalidField: validation?.firstInvalidField || "",
    firstInvalidSelector: validation?.firstInvalidSelector || ""
  };
}

function validationFieldError(fieldName) {
  return state.validation.fields?.[fieldName] || "";
}

function validationFieldIsInvalid(fieldName) {
  return Boolean(validationFieldError(fieldName));
}

function validationFieldId(fieldName) {
  return `validation-error-${fieldName}`;
}

function validationControlAttrs(fieldName) {
  if (!validationFieldIsInvalid(fieldName)) return "";
  return `aria-invalid="true" aria-describedby="${validationFieldId(fieldName)}"`;
}

function validationControlClass(baseClass, fieldName) {
  return `${baseClass}${validationFieldIsInvalid(fieldName) ? " is-invalid" : ""}`;
}

function renderFieldError(fieldName) {
  const message = validationFieldError(fieldName);
  return message ? `<p class="field-error" id="${validationFieldId(fieldName)}">${escapeHtml(message)}</p>` : "";
}

function validationTargetSelector(fieldName) {
  const inPreviewEdit = state.proposalPreviewId && state.proposalPreviewMode === "edit";
  if (inPreviewEdit) {
    const modalSelectors = {
      fullName: "#modal-fullName",
      jobTitle: "#modal-jobTitle",
      purpose: '.proposal-preview-modal [data-field="purpose"]',
      explanation: '.proposal-preview-modal [data-field="explanation"]',
      company: "#modal-company",
      estimatedValueCents: "#modal-estimatedValue",
      issueDate: '.proposal-preview-modal [data-field="issueDate"]',
      labCode: "#labCode"
    };
    return modalSelectors[fieldName] || "";
  }

  const selectors = {
    fullName: "#fullName",
    jobTitle: "#jobTitle",
    purpose: '[data-field="purpose"]',
    explanation: '[data-field="explanation"]',
    company: "#company",
    estimatedValueCents: "#estimatedValue",
    issueDate: '[data-field="issueDate"]',
    labCode: "#labCode"
  };
  return selectors[fieldName] || "";
}

async function validateCurrentDocument() {
  const baseValidation = validateProposalRequiredFields(state.current);
  const fields = { ...baseValidation.fields };
  await document.fonts?.load('15px "Noto Sans"');
  const layout = createProposalLayout(state.current, createCanvasTextMeasurer());
  layout.overflowFields.forEach((field) => {
    if (!fields[field]) fields[field] = "Besedilo je predolgo za eno stran A4.";
  });
  const valid = Object.keys(fields).length === 0;
  const firstInvalidField =
    baseValidation.firstInvalidField ||
    ["fullName", "jobTitle", "purpose", "explanation", "company"].find((field) => fields[field]) ||
    "";

  return {
    valid,
    message: valid
      ? ""
      : layout.overflowFields.length
        ? "Dokument je predolg za eno stran A4. Skrajšajte označena polja."
        : "Pred nadaljevanjem izpolnite vsa obvezna polja.",
    fields,
    firstInvalidField,
    firstInvalidSelector: validationTargetSelector(firstInvalidField)
  };
}

function prepareValidationFocus(validation) {
  const selector = validation?.firstInvalidSelector || validationTargetSelector(validation?.firstInvalidField);
  if (selector === "#labCode") {
    state.toolsPanelOpen = true;
  }
}

function focusValidationTarget(validation) {
  const selector = validation?.firstInvalidSelector || validationTargetSelector(validation?.firstInvalidField);
  if (!selector) return;

  window.requestAnimationFrame(() => {
    const target = document.querySelector(selector);
    if (!target || !(target instanceof HTMLElement)) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "center", inline: "nearest" });
  });
}

function syncCalculatedValueDisplay(calculatedCents) {
  const valueInput = document.getElementById("estimatedValue");
  if (valueInput && calculatedCents > 0) {
    valueInput.value = centsToInputValue(calculatedCents);
  }
}

function showToast(message) {
  state.toast = message;
  renderToast();
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    state.toast = "";
    renderToast();
  }, 3600);
}

function setBusy(isBusy) {
  state.busy = isBusy;
  document.querySelectorAll("[data-busy-sensitive]").forEach((element) => {
    element.disabled = isBusy;
  });
}

function renderToast() {
  document.querySelector(".toast")?.remove();
  if (!state.toast) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = state.toast;
  document.body.append(toast);
}

function renderGlobalOverlays() {
  document.querySelector("[data-global-overlays]")?.remove();
  const container = document.createElement("div");
  container.dataset.globalOverlays = "";
  container.innerHTML = `
    ${renderUpdateBanner(state.update, { icon, escapeHtml })}
    ${renderDataSafetyModal(state.dataSafety, { icon, escapeHtml })}
    ${renderReleaseNotesModal(state.update, { icon, escapeHtml })}
    <input class="hidden-input" type="file" data-backup-restore-input accept=".backup,application/x-center-rog-backup,application/json" />
  `;
  document.body.append(container);
  bindGlobalOverlayEvents(container);
}

function bindGlobalOverlayEvents(container) {
  container.querySelector("[data-backup-setup-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void configureBackup();
  });
  container.querySelector("[data-backup-restore-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void restoreBackup();
  });
  container.querySelector("[data-backup-restore-input]")?.addEventListener("change", (event) => {
    const [file] = event.currentTarget.files || [];
    event.currentTarget.value = "";
    if (!file) return;
    state.dataSafety.pendingRestoreFile = file;
    state.dataSafety.screen = "restore";
    state.dataSafety.error = "";
    render();
  });
  container.querySelectorAll("[data-modal-window]").forEach((modal) => {
    modal.addEventListener("click", (event) => event.stopPropagation());
  });
}

async function currentBackupBlob(config = state.dataSafety.config) {
  const stores = await getDatabaseBackupSnapshot({
    excludeAssetIds: [BACKUP_CONFIG_ASSET_ID]
  });
  return createEncryptedBackup(stores, config);
}

async function performBackup({ automatic = false } = {}) {
  const config = state.dataSafety.config;
  if (!config?.encryptionKey) {
    if (!automatic) {
      state.dataSafety.open = true;
      state.dataSafety.screen = "setup";
      render();
    }
    return false;
  }

  let permission = "unsupported";
  if (config.directoryHandle) {
    permission = await directoryPermission(config.directoryHandle, { request: !automatic });
  }
  if (automatic && config.directoryHandle && permission !== "granted") {
    state.dataSafety.permissionNeeded = true;
    showToast("Samodejni backup potrebuje dovoljenje za izbrano mapo.");
    return false;
  }

  const now = new Date();
  const blob = await currentBackupBlob(config);
  const fileName = backupFileName(now);
  if (config.directoryHandle && permission === "granted") {
    await writeBackupFile(config.directoryHandle, fileName, blob);
  } else if (!automatic) {
    downloadBlob(blob, fileName);
  } else {
    return false;
  }

  const updatedConfig = {
    ...config,
    lastBackupDate: localDateKey(now),
    lastBackupAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  await saveAsset(updatedConfig);
  state.dataSafety.config = updatedConfig;
  state.dataSafety.permissionNeeded = false;
  if (!automatic) showToast("Varnostna kopija je pripravljena.");
  scheduleAutomaticBackup();
  if (state.dataSafety.open) render();
  return true;
}

async function configureBackup() {
  const password = document.querySelector("[data-backup-password]")?.value || "";
  const confirmation = document.querySelector("[data-backup-password-confirm]")?.value || "";
  if (!validateBackupPassword(password)) {
    state.dataSafety.error = "Geslo naj vsebuje vsaj 8 znakov.";
    render();
    return;
  }
  if (password !== confirmation) {
    state.dataSafety.error = "Vneseni gesli se ne ujemata.";
    render();
    return;
  }

  try {
    let directoryHandle = null;
    if (supportsDirectoryBackup()) {
      directoryHandle = await window.showDirectoryPicker({
        id: "center-rog-evidence-backups",
        mode: "readwrite",
        startIn: "documents"
      });
    }
    const encryption = await createBackupEncryption(password);
    const now = new Date().toISOString();
    const config = {
      id: BACKUP_CONFIG_ASSET_ID,
      type: "center-rog-backup-config",
      version: 1,
      ...encryption,
      directoryHandle,
      scheduledTime: "19:30",
      lastBackupDate: "",
      lastBackupAt: "",
      createdAt: state.dataSafety.config?.createdAt || now,
      updatedAt: now
    };
    await saveAsset(config);
    state.dataSafety.config = config;
    state.dataSafety.screen = "overview";
    state.dataSafety.error = "";
    await performBackup();
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.error(error);
    state.dataSafety.error = error.message || "Backupa ni bilo mogoče nastaviti.";
    render();
  }
}

async function restoreBackup() {
  const file = state.dataSafety.pendingRestoreFile;
  const password = document.querySelector("[data-backup-restore-password]")?.value || "";
  if (!file) {
    state.dataSafety.error = "Najprej izberi datoteko varnostne kopije.";
    render();
    return;
  }
  try {
    const payload = await decryptBackupFile(file, password);
    await replaceDatabaseFromBackup(payload.stores, {
      preserveAssetIds: [BACKUP_CONFIG_ASSET_ID]
    });
    state.dataSafety.pendingRestoreFile = null;
    window.location.reload();
  } catch (error) {
    console.error(error);
    state.dataSafety.error = error.message || "Podatkov ni bilo mogoče obnoviti.";
    render();
  }
}

function scheduleAutomaticBackup() {
  window.clearTimeout(automaticBackupTimer);
  const config = state.dataSafety.config;
  if (!config?.directoryHandle) return;
  if (backupIsDue(config)) {
    void performBackup({ automatic: true });
  }
  automaticBackupTimer = window.setTimeout(() => {
    void performBackup({ automatic: true });
  }, millisecondsUntilBackup());
}

function maybeOpenReleaseNotes() {
  if (state.onboarding.active) return;
  let seenVersion = "";
  try {
    seenVersion = window.localStorage.getItem(APP_VERSION_STORAGE_KEY) || "";
  } catch {
    // Release notes can still be opened manually through a later update.
  }
  if (seenVersion !== APP_VERSION) state.update.releaseNotesOpen = true;
}

async function checkForAppUpdate() {
  try {
    const latest = await fetchLatestVersion();
    if (isNewerVersion(latest.version)) {
      state.update.available = latest;
      state.update.dismissed = false;
      render();
    }
  } catch (error) {
    console.warn("Version check failed", error);
  }
}

function scheduleUpdateChecks() {
  window.clearInterval(updateCheckTimer);
  updateCheckTimer = window.setInterval(checkForAppUpdate, UPDATE_CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkForAppUpdate();
  });
}

async function installAppUpdate() {
  state.busy = true;
  try {
    const registration = await navigator.serviceWorker?.getRegistration?.();
    await registration?.update?.();
    let waitingWorker = registration?.waiting || null;
    if (!waitingWorker && registration?.installing) {
      waitingWorker = await new Promise((resolve) => {
        const worker = registration.installing;
        const timeout = window.setTimeout(() => resolve(null), 5_000);
        worker.addEventListener("statechange", () => {
          if (worker.state !== "installed") return;
          window.clearTimeout(timeout);
          resolve(worker);
        });
      });
    }
    waitingWorker?.postMessage?.({ type: "SKIP_WAITING" });
    if (waitingWorker) {
      await Promise.race([
        new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true })),
        new Promise((resolve) => window.setTimeout(resolve, 2_000))
      ]);
    }
    window.location.reload();
  } catch (error) {
    console.error(error);
    state.busy = false;
    showToast("Posodobitve ni bilo mogoče namestiti. Poskusi osvežiti stran.");
  }
}

function closeReleaseNotes() {
  try {
    window.localStorage.setItem(APP_VERSION_STORAGE_KEY, APP_VERSION);
  } catch {
    // The modal may reappear when local storage is unavailable.
  }
  state.update.releaseNotesOpen = false;
  render();
}

function normalizePanelId(value) {
  return String(value || "panel")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function sidebarPanelDefaultCollapsed(title) {
  return ["Moj podpis", "Urejanje dokumenta"].includes(String(title || "").trim());
}

function sidebarPanelCollapsed(panelId, title) {
  if (Object.prototype.hasOwnProperty.call(state.collapsedPanels, panelId)) {
    return Boolean(state.collapsedPanels[panelId]);
  }
  return sidebarPanelDefaultCollapsed(title);
}

function setSidebarPanelCollapsed(panelId, collapsed) {
  state.collapsedPanels = {
    ...state.collapsedPanels,
    [panelId]: collapsed
  };
}

function applySidebarPanelCollapsed(panel, collapsed) {
  if (!panel) return;
  const body = panel.querySelector(":scope > .panel-body");
  const header = panel.querySelector(":scope > .panel-header");
  const toggleButton = header?.querySelector("[data-panel-toggle-id]");
  panel.classList.toggle("is-collapsed", collapsed);
  if (body) body.hidden = collapsed;
  if (header) header.setAttribute("aria-expanded", collapsed ? "false" : "true");
  if (toggleButton) {
    toggleButton.setAttribute("aria-expanded", collapsed ? "false" : "true");
    toggleButton.setAttribute("aria-label", collapsed ? "Odpri kartico" : "Zapri kartico");
  }
}

function toggleSidebarPanel(panelId) {
  if (!panelId) return;
  const panel = [...document.querySelectorAll(".side-panel .panel")].find((item) => item.dataset.panelId === panelId);
  const nextCollapsed = panel
    ? !panel.classList.contains("is-collapsed")
    : !Boolean(state.collapsedPanels[panelId]);
  setSidebarPanelCollapsed(panelId, nextCollapsed);
  applySidebarPanelCollapsed(panel, nextCollapsed);
}

function panelEventTargetElement(target) {
  if (!target) return null;
  if (target.nodeType === 1) return target;
  return target.parentElement || null;
}

function panelToggleShouldIgnore(target, header) {
  let element = panelEventTargetElement(target);
  while (element && element !== header) {
    if (element.matches?.("button, a, input, select, textarea, [data-no-panel-toggle]")) {
      return true;
    }
    element = element.parentElement;
  }
  return false;
}

function enhanceCollapsiblePanels() {
  document.querySelectorAll(".side-panel .panel").forEach((panel, index) => {
    const header = panel.querySelector(":scope > .panel-header");
    const body = panel.querySelector(":scope > .panel-body");
    const title = panel.querySelector(":scope > .panel-header .panel-title")?.textContent?.trim() || `Kartica ${index + 1}`;
    if (!header || !body) return;

    const panelId = panel.dataset.panelId || `${state.documentType}-${normalizePanelId(title)}-${index}`;
    panel.dataset.panelId = panelId;
    const bodyId = body.id || `panel-body-${panelId}`;
    body.id = bodyId;

    const collapsed = sidebarPanelCollapsed(panelId, title);
    applySidebarPanelCollapsed(panel, collapsed);

    header.classList.add("panel-header-collapsible");
    header.setAttribute("role", "button");
    header.setAttribute("tabindex", "0");
    header.setAttribute("aria-controls", bodyId);
    header.setAttribute("aria-expanded", collapsed ? "false" : "true");
    header.insertAdjacentHTML(
      "beforeend",
      `<button
        class="panel-collapse-button"
        type="button"
        data-action="toggle-panel"
        data-panel-toggle-id="${escapeHtml(panelId)}"
        aria-controls="${escapeHtml(bodyId)}"
        aria-expanded="${collapsed ? "false" : "true"}"
        aria-label="${collapsed ? "Odpri kartico" : "Zapri kartico"}"
      >
        <span class="panel-collapse-indicator" aria-hidden="true">${icon("chevron-down")}</span>
      </button>`
    );

    header.addEventListener("click", (event) => {
      if (panelToggleShouldIgnore(event.target, header)) return;
      toggleSidebarPanel(panelId);
    });
    header.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleSidebarPanel(panelId);
    });
  });
}

const EVIDENCE_TABS = [
  {
    type: "proposal",
    label: "Predlogi nakupa",
    icon: "file-text"
  },
  {
    type: "materialIssue",
    label: "Izdajnice materiala",
    icon: "clipboard-list"
  },
  {
    type: "attendance",
    label: "Podpisni listi",
    icon: "list-checks"
  },
  {
    type: "hourReports",
    label: "Poročila ur",
    icon: "clock-3"
  }
];

function evidenceTabMarkup(tab, activeType, disabledAttr = "") {
  const isActive = tab.type === activeType;
  return `
    <button
      class="evidence-tab evidence-tab-${escapeHtml(tab.type)}${isActive ? " is-active" : ""}"
      type="button"
      role="tab"
      aria-selected="${isActive ? "true" : "false"}"
      aria-controls="evidence-workspace"
      tabindex="${isActive ? "0" : "-1"}"
      data-evidence-tab
      data-evidence-target="${escapeHtml(tab.type)}"
      data-busy-sensitive
      ${disabledAttr}
    >
      ${icon(tab.icon)}
      <span>${escapeHtml(tab.label)}</span>
    </button>
  `;
}

function renderEvidenceTabs(activeType, disabledAttr = "") {
  const activeTab = EVIDENCE_TABS.find((tab) => tab.type === activeType) || EVIDENCE_TABS[0];
  return `
    <nav class="evidence-navigation evidence-navigation-${escapeHtml(activeType)}" aria-label="Evidence dokumentov">
      <div class="evidence-tabs-desktop" role="tablist" aria-label="Izberi evidenco">
        ${EVIDENCE_TABS.map((tab) => evidenceTabMarkup(tab, activeType, disabledAttr)).join("")}
      </div>

      <div class="evidence-tabs-compact">
        <button
          class="evidence-compact-tab evidence-tab-${escapeHtml(activeTab.type)}"
          type="button"
          data-evidence-menu-toggle
          aria-haspopup="menu"
          aria-expanded="${state.evidenceMenuOpen ? "true" : "false"}"
          data-busy-sensitive
          ${disabledAttr}
        >
          ${icon(activeTab.icon)}
          <span>${escapeHtml(activeTab.label)}</span>
          ${icon("chevron-down")}
        </button>
        ${
          state.evidenceMenuOpen
            ? `<div class="evidence-menu" role="menu" aria-label="Izberi evidenco">
                ${EVIDENCE_TABS.map(
                  (tab) => `
                    <button
                      class="evidence-menu-option${tab.type === activeType ? " is-active" : ""}"
                      type="button"
                      role="menuitemradio"
                      aria-checked="${tab.type === activeType ? "true" : "false"}"
                      data-evidence-target="${escapeHtml(tab.type)}"
                    >
                      <span class="evidence-menu-swatch evidence-menu-swatch-${escapeHtml(tab.type)}" aria-hidden="true"></span>
                      ${icon(tab.icon)}
                      <span>${escapeHtml(tab.label)}</span>
                      ${tab.type === activeType ? icon("check") : ""}
                    </button>
                  `
                ).join("")}
              </div>`
            : ""
        }
      </div>
      <button
        class="data-safety-trigger"
        type="button"
        data-action="open-data-safety"
        aria-label="Odpri varnostne kopije"
        title="Varnostne kopije"
      >
        ${icon("shield-check")}<span>Backup</span>
      </button>
    </nav>
  `;
}

function renderDocumentCommands(type, saveState, disabledAttr = "") {
  if (type === "hourReports") {
    return `
      <nav class="toolbar-actions command-bar side-command-bar" aria-label="Ukazi poročil ur">
        <div class="command-section" role="group" aria-label="Uvoz">
          <button class="button toolbar-button" type="button" data-action="new" data-tooltip="Počisti trenutni uvoz. Bližnjica: Ctrl/Cmd+N." aria-label="Nov uvoz" data-busy-sensitive ${disabledAttr}>
            ${icon("file-plus-2")}
          </button>
          <button class="button toolbar-button" type="button" data-action="save" data-tooltip="${escapeHtml(saveState.saveLabel)} in bonuse za naslednji uvoz. Bližnjica: Ctrl/Cmd+S." aria-label="${escapeHtml(saveState.saveLabel)}" data-busy-sensitive ${disabledAttr}>
            ${icon("save")}
          </button>
        </div>
        <span class="command-divider" aria-hidden="true"></span>
        <div class="command-section" role="group" aria-label="Excel">
          <button class="button toolbar-button" type="button" data-action="import-hours" data-tooltip="Uvozi Connecteam datoteko XLSX." aria-label="Uvozi XLSX" data-busy-sensitive ${disabledAttr}>
            ${icon("file-up")}
          </button>
        </div>
        <span class="command-divider" aria-hidden="true"></span>
        <div class="command-section" role="group" aria-label="Izvoz">
          <button class="button toolbar-button toolbar-button-primary" type="button" data-action="download" data-tooltip="Prenesi PDF izbrane osebe." aria-label="Prenesi PDF" data-busy-sensitive ${disabledAttr}>
            ${icon("download")}
          </button>
          <button class="button toolbar-button" type="button" data-action="print" data-tooltip="Natisni poročilo izbrane osebe. Bližnjica: Ctrl/Cmd+P." aria-label="Natisni poročilo" data-busy-sensitive ${disabledAttr}>
            ${icon("printer")}
          </button>
        </div>
      </nav>
    `;
  }

  if (type === "attendance") {
    return `
      <nav class="toolbar-actions command-bar side-command-bar" aria-label="Ukazi podpisnega lista">
        <div class="command-section" role="group" aria-label="Dokument">
          <button class="button toolbar-button" type="button" data-action="new" data-tooltip="Nov podpisni list. Bližnjica: Ctrl/Cmd+N." aria-label="Nov podpisni list" data-busy-sensitive ${disabledAttr}>
            ${icon("file-plus-2")}
          </button>
          <button class="button toolbar-button" type="button" data-action="save" data-tooltip="${escapeHtml(saveState.saveLabel)}. Bližnjica: Ctrl/Cmd+S." aria-label="${escapeHtml(saveState.saveLabel)}" data-busy-sensitive ${disabledAttr}>
            ${icon("save")}
          </button>
        </div>
        <span class="command-divider" aria-hidden="true"></span>
        <div class="command-section" role="group" aria-label="Uvoz">
          <button class="button toolbar-button" type="button" data-action="import-attendance" data-tooltip="Uvozi Wagtail CSV in pripravi podpisne liste po terminih." aria-label="Uvozi CSV" data-busy-sensitive ${disabledAttr}>
            ${icon("file-up")}
          </button>
        </div>
        <span class="command-divider" aria-hidden="true"></span>
        <div class="command-section" role="group" aria-label="Izvoz">
          <button class="button toolbar-button toolbar-button-primary" type="button" data-action="download" data-tooltip="Prenesi podpisni list v obliki PDF." aria-label="Prenesi PDF" data-busy-sensitive ${disabledAttr}>
            ${icon("download")}
          </button>
          <button class="button toolbar-button" type="button" data-action="print" data-tooltip="Natisni podpisni list A4. Bližnjica: Ctrl/Cmd+P." aria-label="Natisni podpisni list" data-busy-sensitive ${disabledAttr}>
            ${icon("printer")}
          </button>
        </div>
      </nav>
    `;
  }

  if (type === "materialIssue") {
    return `
      <nav class="toolbar-actions command-bar side-command-bar" aria-label="Ukazi izdajnice">
        <div class="command-section" role="group" aria-label="Dokument">
          <button class="button toolbar-button" type="button" data-action="new" data-tooltip="Nova izdajnica. Bližnjica: Ctrl/Cmd+N." aria-label="Nova izdajnica" data-busy-sensitive ${disabledAttr}>
            ${icon("file-plus-2")}
          </button>
          <button class="button toolbar-button" type="button" data-action="save" data-tooltip="${escapeHtml(saveState.saveLabel)}. Nepopolno izdajnico lahko shraniš kot osnutek. Bližnjica: Ctrl/Cmd+S." aria-label="${escapeHtml(saveState.saveLabel)}" data-busy-sensitive ${disabledAttr}>
            ${icon("save")}
          </button>
        </div>
        <span class="command-divider" aria-hidden="true"></span>
        <div class="command-section" role="group" aria-label="Izvoz">
          <button class="button toolbar-button toolbar-button-primary" type="button" data-action="download" data-tooltip="Prenesi izdajnico v formatu PDF. Pred izvozom morajo biti izpolnjena vsa obvezna polja." aria-label="Prenesi PDF" data-busy-sensitive ${disabledAttr}>
            ${icon("download")}
          </button>
          <button class="button toolbar-button" type="button" data-action="print" data-tooltip="Natisni izdajnico A4. Status se spremeni v Natisnjeno. Bližnjica: Ctrl/Cmd+P." aria-label="Natisni izdajnico" data-busy-sensitive ${disabledAttr}>
            ${icon("printer")}
          </button>
        </div>
      </nav>
    `;
  }

  return `
    <nav class="toolbar-actions command-bar side-command-bar" aria-label="Ukazi dokumenta">
      <div class="command-section" role="group" aria-label="Dokument">
        <button class="button toolbar-button" type="button" data-action="new" data-tooltip="Nov dokument: odpre svež predlog in ohrani zadnje uporabljene pametne podatke. Bližnjica: Ctrl/Cmd+N." aria-label="Nov dokument" data-busy-sensitive ${disabledAttr}>
          ${icon("file-plus-2")}
        </button>
        <button class="button toolbar-button" type="button" data-action="save" data-tooltip="${escapeHtml(saveState.saveLabel)}: shrani predlog in mu po potrebi dodeli interno številko. Bližnjica: Ctrl/Cmd+S." aria-label="${escapeHtml(saveState.saveLabel)}" data-busy-sensitive ${disabledAttr}>
          ${icon("save")}
        </button>
      </div>
      <span class="command-divider" aria-hidden="true"></span>
      <div class="command-section" role="group" aria-label="Priloga">
        <button class="button toolbar-button" type="button" data-action="attach" data-tooltip="Pripni ponudbo: dodaj datoteko PDF ali sliko k predlogu." aria-label="Pripni ponudbo" data-busy-sensitive ${disabledAttr}>
          ${icon("paperclip")}
        </button>
      </div>
      <span class="command-divider" aria-hidden="true"></span>
      <div class="command-section" role="group" aria-label="Izvoz">
        <button class="button toolbar-button toolbar-button-primary" type="button" data-action="download" data-tooltip="Prenesi PDF: shrani predlog in prenese končni dokument." aria-label="Prenesi PDF" data-busy-sensitive ${disabledAttr}>
          ${icon("download")}
        </button>
        <button class="button toolbar-button" type="button" data-action="print" data-tooltip="Natisni: pripravi dokument PDF in odpre tiskanje. Bližnjica: Ctrl/Cmd+P." aria-label="Natisni" data-busy-sensitive ${disabledAttr}>
          ${icon("printer")}
        </button>
      </div>
    </nav>
  `;
}

function renderMaterialIssue() {
  const issue = state.currentMaterialIssue;
  const saveState = materialIssueSaveState();
  const disabledAttr = state.busy ? "disabled" : "";
  const recentIssues = sortRecent(state.materialIssues).slice(0, 5);
  const totalCents = materialIssueTotalCents(issue);
  const validation = state.materialValidation;

  root.innerHTML = `
    <main class="app-shell evidence-shell material-issue-shell evidence-materialIssue">
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
        ${renderEvidenceTabs("materialIssue", disabledAttr)}
      </div>

      <section class="workspace material-issue-workspace" id="evidence-workspace">
        <div class="document-stage">
          <div class="material-issue-paper-frame">
            <article class="paper material-issue-paper" aria-label="Izdajnica materiala">
              <header class="material-issue-header">
                ${centerRogLogoMarkup()}
                <div class="material-issue-heading">
                  <span class="material-issue-kicker">CENTER ROG</span>
                  <h1>IZDAJNICA MATERIALA</h1>
                </div>
                <span class="material-issue-number">${escapeHtml(issue.serial || "OSNUTEK")}</span>
              </header>

              ${
                validation.message
                  ? `<div class="form-error-banner material-error-banner" role="alert">${escapeHtml(validation.message)}</div>`
                  : ""
              }

              <section class="material-issue-meta" aria-label="Podatki izdajnice">
                <label class="material-meta-field">
                  <span>Izdaja</span>
                  <input class="${materialValidationClass("material-input", "issuerName")}" data-material-field="issuerName" value="${escapeHtml(issue.issuerName)}" autocomplete="name" ${materialValidationAttrs("issuerName")} />
                  ${renderMaterialError("issuerName")}
                </label>
                <label class="material-meta-field">
                  <span>Delovno mesto</span>
                  <input class="${materialValidationClass("material-input", "issuerRole")}" data-material-field="issuerRole" value="${escapeHtml(issue.issuerRole)}" ${materialValidationAttrs("issuerRole")} />
                  ${renderMaterialError("issuerRole")}
                </label>
                <label class="material-meta-field">
                  <span>Laboratorij</span>
                  <input class="${materialValidationClass("material-input", "labName")}" data-material-field="labName" value="${escapeHtml(issue.labName)}" ${materialValidationAttrs("labName")} />
                  ${renderMaterialError("labName")}
                </label>
                <label class="material-meta-field">
                  <span>Uporabnik / kupec</span>
                  <input class="${materialValidationClass("material-input", "buyerName")}" data-material-field="buyerName" value="${escapeHtml(issue.buyerName)}" autocomplete="name" ${materialValidationAttrs("buyerName")} />
                  ${renderMaterialError("buyerName")}
                </label>
                <label class="material-meta-field material-meta-date">
                  <span>Datum</span>
                  <input class="${materialValidationClass("material-input", "issueDate")}" type="date" data-material-field="issueDate" value="${escapeHtml(issue.issueDate)}" ${materialValidationAttrs("issueDate")} />
                  ${renderMaterialError("issueDate")}
                </label>
                <label class="material-meta-field material-meta-time">
                  <span>Ura</span>
                  <input class="${materialValidationClass("material-input", "issueTime")}" type="time" data-material-field="issueTime" value="${escapeHtml(issue.issueTime)}" ${materialValidationAttrs("issueTime")} />
                  ${renderMaterialError("issueTime")}
                </label>
                <label class="material-meta-field">
                  <span>Kraj izdaje</span>
                  <input class="${materialValidationClass("material-input", "city")}" data-material-field="city" value="${escapeHtml(issue.city)}" ${materialValidationAttrs("city")} />
                  ${renderMaterialError("city")}
                </label>
              </section>

              <section class="material-table-section">
                <div class="material-table-wrap">
                  <table class="material-table">
                    <colgroup>
                      <col class="material-col-index" />
                      <col class="material-col-name" />
                      <col class="material-col-unit" />
                      <col class="material-col-quantity" />
                      <col class="material-col-tariff" />
                      <col class="material-col-amount" />
                      <col class="material-col-action" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Št.</th>
                        <th>Naziv materiala</th>
                        <th>EM</th>
                        <th>Količina</th>
                        <th>Tarifa</th>
                        <th>Znesek</th>
                        <th><span class="sr-only">Dejanje</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      ${issue.items
                        .map((row, index) => {
                          const prefix = `items.${row.id}`;
                          return `
                            <tr data-material-row="${escapeHtml(row.id)}">
                              <td class="material-row-index">${index + 1}</td>
                              <td>
                                <input
                                  class="${materialValidationClass("material-cell-input", `${prefix}.name`)}"
                                  data-material-item-field="name"
                                  data-material-item-id="${escapeHtml(row.id)}"
                                  value="${escapeHtml(row.name)}"
                                  aria-label="Naziv materiala v vrstici ${index + 1}"
                                  ${materialValidationAttrs(`${prefix}.name`)}
                                />
                                ${renderMaterialError(`${prefix}.name`)}
                              </td>
                              <td>
                                <select
                                  class="${materialValidationClass("material-cell-input material-unit-select", `${prefix}.unit`)}"
                                  data-material-item-field="unit"
                                  data-material-item-id="${escapeHtml(row.id)}"
                                  aria-label="Merska enota v vrstici ${index + 1}"
                                  ${materialValidationAttrs(`${prefix}.unit`)}
                                >
                                  ${MATERIAL_UNITS.map((unit) => `<option value="${escapeHtml(unit)}" ${row.unit === unit ? "selected" : ""}>${escapeHtml(unit)}</option>`).join("")}
                                </select>
                                ${renderMaterialError(`${prefix}.unit`)}
                              </td>
                              <td>
                                <input
                                  class="${materialValidationClass("material-cell-input material-number-input", `${prefix}.quantity`)}"
                                  data-material-item-field="quantity"
                                  data-material-item-id="${escapeHtml(row.id)}"
                                  value="${escapeHtml(row.quantity)}"
                                  inputmode="decimal"
                                  aria-label="Količina v vrstici ${index + 1}"
                                  ${materialValidationAttrs(`${prefix}.quantity`)}
                                />
                                ${renderMaterialError(`${prefix}.quantity`)}
                              </td>
                              <td>
                                <input
                                  class="${materialValidationClass("material-cell-input material-number-input", `${prefix}.tariffCents`)}"
                                  data-material-item-field="tariffCents"
                                  data-material-item-id="${escapeHtml(row.id)}"
                                  value="${escapeHtml(centsToInputValue(row.tariffCents))}"
                                  inputmode="decimal"
                                  aria-label="Tarifa v vrstici ${index + 1}"
                                  ${materialValidationAttrs(`${prefix}.tariffCents`)}
                                />
                                ${renderMaterialError(`${prefix}.tariffCents`)}
                              </td>
                              <td class="material-row-amount" data-material-row-amount="${escapeHtml(row.id)}">${formatCurrency(materialRowAmountCents(row))}</td>
                              <td>
                                <button class="material-row-remove" type="button" data-remove-material-row="${escapeHtml(row.id)}" aria-label="Odstrani vrstico ${index + 1}" ${issue.items.length === 1 ? "disabled" : ""}>
                                  ${icon("trash-2")}
                                </button>
                              </td>
                            </tr>
                          `;
                        })
                        .join("")}
                      ${Array.from(
                        { length: Math.max(0, 8 - issue.items.length) },
                        (_, index) => `
                          <tr class="material-placeholder-row" aria-hidden="true">
                            <td>${issue.items.length + index + 1}</td>
                            <td></td>
                            <td></td>
                            <td></td>
                            <td></td>
                            <td></td>
                            <td></td>
                          </tr>
                        `
                      ).join("")}
                    </tbody>
                  </table>
                </div>
                <div class="material-table-actions">
                  <button class="button button-outline material-add-row" type="button" data-action="add-material-row" ${issue.items.length >= 8 ? "disabled" : ""}>
                    ${icon("plus")} Dodaj vrstico
                  </button>
                  <div class="material-total">
                    <span>Skupaj za plačilo</span>
                    <strong data-material-total>${formatCurrency(totalCents)}</strong>
                  </div>
                </div>
              </section>

              <section class="material-issue-footer">
                <label class="material-note-field">
                  <span>Opomba</span>
                  <textarea class="material-note-input" data-material-field="note" rows="3" placeholder="Dodatna navodila ali opomba za blagajno in prevzem.">${escapeHtml(issue.note)}</textarea>
                </label>
                <div class="material-signature">
                  <span>Podpis osebe, ki izdaja dokument</span>
                  ${renderSignatureZone("material")}
                </div>
              </section>

              <p class="material-payment-note">
                Material se izroči po plačilu na blagajni in predložitvi računa.
              </p>
            </article>
          </div>
        </div>

        <aside class="side-panel${state.toolsPanelOpen ? " is-open" : ""}" id="toolsPanel" aria-label="Pregled izdajnice">
          <div class="panel-drawer-header">
            <span>${icon("panel-right")} Pregled izdajnice</span>
            <button class="button button-icon-only button-ghost" type="button" data-action="close-tools" aria-label="Zapri pregled izdajnice">
              ${icon("x")}
            </button>
          </div>

          ${renderDocumentCommands("materialIssue", saveState, disabledAttr)}

          <section class="panel">
            <div class="panel-header">
              <span class="panel-icon">${icon("history")}</span>
              <span class="panel-title">Zadnje izdajnice</span>
            </div>
            <div class="panel-body">
              ${
                recentIssues.length
                  ? recentIssues
                      .map((savedIssue) => renderMaterialIssueRow(savedIssue))
                      .join("")
                  : `<p class="empty-text">Shranjene izdajnice se bodo pokazale tukaj.</p>`
              }
            </div>
          </section>

          ${renderSignaturePanel()}

          <section class="panel">
            <div class="panel-header">
              <span class="panel-icon">${icon("pencil")}</span>
              <span class="panel-title">Podatki dokumenta</span>
            </div>
            <div class="panel-body">
              <div class="settings-summary">
                <div class="settings-summary-row">
                  <span>Številka</span>
                  <strong>${escapeHtml(issue.serial || materialIssueSerialPreview())}</strong>
                </div>
                <div class="settings-summary-row">
                  <span>Skupni znesek</span>
                  <strong>${formatCurrency(totalCents)}</strong>
                </div>
                <div class="settings-summary-row">
                  <span>Status</span>
                  <strong>${escapeHtml(materialStatusLabel(issue.status))}</strong>
                </div>
                <div class="settings-summary-row settings-summary-editable">
                  <label for="materialLabCode">Kratica laba</label>
                  <span class="settings-code-field-wrap">
                    <input class="${materialValidationClass("settings-code-input", "labCode")}" id="materialLabCode" data-material-field="labCode" value="${escapeHtml(issue.labCode)}" aria-label="Kratica laba za številčenje izdajnice" ${materialValidationAttrs("labCode")} />
                    ${renderMaterialError("labCode")}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </section>

      <div class="tools-panel-backdrop${state.toolsPanelOpen ? " is-open" : ""}" data-action="close-tools" aria-hidden="true"></div>
      <button class="mobile-panel-toggle" type="button" data-action="toggle-tools" aria-controls="toolsPanel" aria-expanded="${state.toolsPanelOpen ? "true" : "false"}">
        ${icon("panel-right")} Pregled
      </button>
      <input class="hidden-input" type="file" id="signatureInput" accept="image/png,image/jpeg,.png,.jpg,.jpeg" />
      ${renderUnsavedPrompt()}
    </main>
  `;

  renderGlobalOverlays();
  bindMaterialIssueEvents();
  refreshIcons();
  renderToast();
}

function visibleAttendanceCategories(selectedId = "") {
  return state.attendanceCategories.filter((category) => !category.hidden || category.id === selectedId);
}

function attendanceCategoryOptions(selectedId = "") {
  return visibleAttendanceCategories(selectedId)
    .map(
      (category) =>
        `<option value="${escapeHtml(category.id)}" ${category.id === selectedId ? "selected" : ""}>${escapeHtml(category.label)}</option>`
    )
    .join("");
}

function attendanceCategoryLabel(categoryId) {
  return state.attendanceCategories.find((category) => category.id === categoryId)?.label || "Brez kategorije";
}

function parseAttendanceContactEmail(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  const separator = /\s+-\s+/;
  if (!separator.test(text)) return { contactName: "", email: text };
  const [contactName, ...emailParts] = text.split(separator);
  return {
    contactName: contactName.trim(),
    email: emailParts.join(" - ").trim()
  };
}

function attendanceParticipantMarkup(participant, displayIndex) {
  const prefix = `participants.${participant.id}`;
  const emailDisplay = attendanceParticipantEmailDisplay(participant);
  const emailFieldName = participant.contactName ? "contactEmail" : "email";
  const relatedParticipant = isRelatedAttendanceParticipant(participant);
  const participantKind = participant.participantType === "child" ? "Otrok" : "Dodatna oseba";
  return `
    <tr data-attendance-participant-row="${escapeHtml(participant.id)}" class="${relatedParticipant ? "attendance-related-participant" : ""}">
      <td class="attendance-index-cell">${displayIndex}</td>
      <td>
        <input
          class="${attendanceValidationClass("attendance-cell-input", `${prefix}.firstName`)}"
          data-attendance-participant-field="firstName"
          data-attendance-participant-id="${escapeHtml(participant.id)}"
          value="${escapeHtml(participant.firstName)}"
          aria-label="Ime udeleženca ${displayIndex}"
          ${attendanceValidationAttrs(`${prefix}.firstName`)}
        />
        ${relatedParticipant ? `<span class="attendance-participant-kind">${participantKind}</span>` : ""}
        ${renderAttendanceError(`${prefix}.firstName`)}
      </td>
      <td>
        <input
          class="${attendanceValidationClass("attendance-cell-input", `${prefix}.lastName`)}"
          data-attendance-participant-field="lastName"
          data-attendance-participant-id="${escapeHtml(participant.id)}"
          value="${escapeHtml(participant.lastName)}"
          aria-label="Priimek udeleženca ${displayIndex}"
          ${attendanceValidationAttrs(`${prefix}.lastName`)}
        />
        ${renderAttendanceError(`${prefix}.lastName`)}
      </td>
      <td class="${participant.duplicateEmail ? "attendance-duplicate-cell" : ""}">
        <input
          class="${attendanceValidationClass("attendance-cell-input", `${prefix}.email`)}"
          data-attendance-participant-field="${emailFieldName}"
          data-attendance-participant-id="${escapeHtml(participant.id)}"
          value="${escapeHtml(emailDisplay)}"
          inputmode="email"
          aria-label="E-pošta oziroma kontakt starša za udeleženca ${displayIndex}"
          ${relatedParticipant ? 'title="Kontakt prijavitelja"' : attendanceValidationAttrs(`${prefix}.email`)}
        />
        ${participant.duplicateEmail ? `<span class="attendance-duplicate-hint">${icon("copy")} Podvojen naslov</span>` : ""}
        ${renderAttendanceError(`${prefix}.email`)}
      </td>
      <td class="attendance-signature-cell">
      </td>
      <td class="attendance-photo-consent-cell">
        <div class="attendance-photo-consent-controls">
          <select
            class="${attendanceValidationClass("attendance-photo-consent-select", `${prefix}.photoConsent`)}"
            data-attendance-participant-field="photoConsent"
            data-attendance-participant-id="${escapeHtml(participant.id)}"
            aria-label="Soglasje za fotografiranje udeleženca ${displayIndex}"
            title="Soglasje za fotografiranje"
            ${relatedParticipant ? 'title="Soglasje prijavitelja za fotografiranje"' : attendanceValidationAttrs(`${prefix}.photoConsent`)}
          >
            <option value="" ${participant.photoConsent === null ? "selected" : ""}>—</option>
            <option value="yes" ${participant.photoConsent === true ? "selected" : ""}>✓</option>
            <option value="no" ${participant.photoConsent === false ? "selected" : ""}>✕</option>
          </select>
          <button class="attendance-remove-participant" type="button" data-remove-attendance-participant="${escapeHtml(participant.id)}" aria-label="Odstrani udeleženca ${displayIndex}">
            ${icon("trash-2")}
          </button>
        </div>
      </td>
    </tr>
  `;
}

function renderAttendancePage(sheet, participants, pageIndex, pageCount) {
  const offset = pageIndex * ATTENDANCE_ROWS_PER_PAGE;
  const visibleRowCount = attendanceVisibleRowCount(
    sheet.participants?.length,
    participants.length
  );
  const editableHeader = pageIndex === 0;
  const metadata = editableHeader
    ? `
      <div class="attendance-meta-grid">
        <label class="attendance-meta-field attendance-meta-program">
          <span>Naziv programa</span>
          <span class="smart-field">
            <input class="${attendanceValidationClass("attendance-meta-input", "programName")}" data-attendance-field="programName" data-attendance-smart-field="programName" value="${escapeHtml(sheet.programName)}" ${attendanceValidationAttrs("programName")} />
            ${renderAttendanceError("programName")}
          </span>
        </label>
        <label class="attendance-meta-field">
          <span>Kategorija</span>
          <select class="${attendanceValidationClass("attendance-meta-input", "categoryId")}" data-attendance-field="categoryId" ${attendanceValidationAttrs("categoryId")}>
            ${attendanceCategoryOptions(sheet.categoryId)}
          </select>
          ${renderAttendanceError("categoryId")}
        </label>
        <label class="attendance-meta-field">
          <span>Datum</span>
          <input class="${attendanceValidationClass("attendance-meta-input", "eventDate")}" data-attendance-field="eventDate" type="date" value="${escapeHtml(sheet.eventDate)}" ${attendanceValidationAttrs("eventDate")} />
          ${renderAttendanceError("eventDate")}
        </label>
        <label class="attendance-meta-field">
          <span>Ura</span>
          <input class="${attendanceValidationClass("attendance-meta-input", "eventTime")}" data-attendance-field="eventTime" type="time" value="${escapeHtml(sheet.eventTime)}" ${attendanceValidationAttrs("eventTime")} />
          ${renderAttendanceError("eventTime")}
        </label>
        <label class="attendance-meta-field">
          <span>Odgovorni mentor</span>
          <span class="smart-field">
            <input class="${attendanceValidationClass("attendance-meta-input", "mentorName")}" data-attendance-field="mentorName" data-attendance-smart-field="mentorName" value="${escapeHtml(sheet.mentorName)}" ${attendanceValidationAttrs("mentorName")} />
            ${renderAttendanceError("mentorName")}
          </span>
        </label>
        <label class="attendance-meta-field">
          <span>Lab</span>
          <span class="smart-field">
            <input class="${attendanceValidationClass("attendance-meta-input", "labName")}" data-attendance-field="labName" data-attendance-smart-field="labName" value="${escapeHtml(sheet.labName)}" ${attendanceValidationAttrs("labName")} />
            ${renderAttendanceError("labName")}
          </span>
        </label>
        <label class="attendance-meta-field attendance-meta-location">
          <span>Lokacija</span>
          <span class="smart-field">
            <input class="${attendanceValidationClass("attendance-meta-input", "location")}" data-attendance-field="location" data-attendance-smart-field="location" value="${escapeHtml(sheet.location)}" ${attendanceValidationAttrs("location")} />
            ${renderAttendanceError("location")}
          </span>
        </label>
      </div>
    `
    : `
      <div class="attendance-meta-grid attendance-meta-static">
        <span class="attendance-meta-field attendance-meta-program"><small>Naziv programa</small><strong>${escapeHtml(sheet.programName)}</strong></span>
        <span class="attendance-meta-field"><small>Kategorija</small><strong>${escapeHtml(attendanceCategoryLabel(sheet.categoryId))}</strong></span>
        <span class="attendance-meta-field"><small>Datum</small><strong>${escapeHtml(formatSlovenianDate(sheet.eventDate))}</strong></span>
        <span class="attendance-meta-field"><small>Ura</small><strong>${escapeHtml(sheet.eventTime)}</strong></span>
        <span class="attendance-meta-field"><small>Odgovorni mentor</small><strong>${escapeHtml(sheet.mentorName)}</strong></span>
        <span class="attendance-meta-field"><small>Lab</small><strong>${escapeHtml(sheet.labName)}</strong></span>
        <span class="attendance-meta-field attendance-meta-location"><small>Lokacija</small><strong>${escapeHtml(sheet.location)}</strong></span>
      </div>
    `;

  return `
    <article class="paper attendance-paper" aria-label="Podpisni list udeležencev, stran ${pageIndex + 1} od ${pageCount}">
      <header class="attendance-header">
        ${centerRogLogoMarkup()}
        <h1>PODPISNI LIST UDELEŽENCEV</h1>
        <span class="attendance-page-number">${pageIndex + 1}/${pageCount}</span>
      </header>
      ${
        editableHeader && state.attendanceValidation.message
          ? `<div class="form-error-banner attendance-error-banner" role="alert">${escapeHtml(state.attendanceValidation.message)}</div>`
          : ""
      }
      ${metadata}
      <div class="attendance-table-wrap">
        <table class="attendance-table">
          <colgroup>
            <col class="attendance-col-index" />
            <col class="attendance-col-first-name" />
            <col class="attendance-col-last-name" />
            <col class="attendance-col-email" />
            <col class="attendance-col-signature" />
            <col class="attendance-col-photo-consent" />
          </colgroup>
          <thead>
            <tr>
              <th>Št.</th>
              <th>Ime</th>
              <th>Priimek</th>
              <th>E-pošta</th>
              <th>Podpis</th>
              <th class="attendance-photo-consent-header" title="Soglasje za fotografiranje">Slikanje</th>
            </tr>
          </thead>
          <tbody>
            ${participants.map((participant, index) => attendanceParticipantMarkup(participant, offset + index + 1)).join("")}
            ${Array.from(
              { length: Math.max(0, visibleRowCount - participants.length) },
              (_, index) => `
                <tr class="attendance-placeholder-row" aria-hidden="true">
                  <td>${offset + participants.length + index + 1}</td>
                  <td></td><td></td><td></td><td></td><td>${photoConsentLabel(null)}</td>
                </tr>
              `
            ).join("")}
          </tbody>
        </table>
      </div>
      <footer class="attendance-footer">
        <span>S podpisom potrjujem udeležbo na programu in resničnost navedenih podatkov.</span>
        <span>Center Rog · Trubarjeva cesta 72 · 1000 Ljubljana</span>
      </footer>
    </article>
  `;
}

function renderAttendanceImportModal() {
  const attendanceImport = state.attendanceImport;
  if (!attendanceImport) return "";
  const defaults = attendanceImport.defaults || {};
  const fieldError = (index, field) =>
    attendanceImport.fieldErrors?.[`${index}.${field}`] || "";
  const fieldClass = (index, field) =>
    `input${fieldError(index, field) ? " is-invalid" : ""}`;
  const fieldErrorMarkup = (index, field) => {
    const message = fieldError(index, field);
    return message ? `<span class="field-error">${escapeHtml(message)}</span>` : "";
  };
  return `
    <div class="modal-backdrop attendance-import-backdrop" role="presentation">
      <section class="modal-window attendance-import-modal" role="dialog" aria-modal="true" aria-labelledby="attendance-import-title" data-modal-window>
        <header class="modal-header">
          <div>
            <h2 class="modal-title" id="attendance-import-title">Pregled uvoza CSV</h2>
            <p class="modal-subtitle">${escapeHtml(attendanceImport.fileName)} · ${attendanceImport.groups.length} ${attendanceImport.groups.length === 1 ? "podpisni list" : "podpisnih listov"}</p>
          </div>
          <button class="button button-icon-only button-ghost" type="button" data-attendance-import-action="cancel" aria-label="Prekliči uvoz">${icon("x")}</button>
        </header>
        <div class="modal-body attendance-import-body">
          ${attendanceImport.error ? `<div class="form-error-banner" role="alert">${escapeHtml(attendanceImport.error)}</div>` : ""}
          <div class="attendance-import-groups">
            ${attendanceImport.groups
              .map(
                (group, index) => `
                  <section class="attendance-import-group">
                    <header>
                      <span>List ${index + 1}</span>
                      <strong>${escapeHtml(group.programName || "Brez naziva")}</strong>
                      <small>${escapeHtml(group.eventDate)} · ${escapeHtml(group.eventTime)} · ${group.participants.length} udeležencev</small>
                    </header>
                    <div class="attendance-import-fields">
                      <label class="field-stack attendance-import-program">
                        <span>Naziv programa <small>obvezno</small></span>
                        <input class="${fieldClass(index, "programName")}" data-attendance-import-field="programName" data-attendance-import-index="${index}" value="${escapeHtml(group.programName)}" aria-invalid="${Boolean(fieldError(index, "programName"))}" />
                        ${fieldErrorMarkup(index, "programName")}
                      </label>
                      <label class="field-stack attendance-import-category">
                        <span>Kategorija <small>obvezno</small></span>
                        <select class="${fieldClass(index, "categoryId")}" data-attendance-import-field="categoryId" data-attendance-import-index="${index}" aria-invalid="${Boolean(fieldError(index, "categoryId"))}">
                          ${attendanceCategoryOptions(group.categoryId || defaults.categoryId)}
                        </select>
                        ${fieldErrorMarkup(index, "categoryId")}
                      </label>
                      <label class="field-stack attendance-import-mentor">
                        <span>Odgovorni mentor <small>obvezno</small></span>
                        <input class="${fieldClass(index, "mentorName")}" data-attendance-import-field="mentorName" data-attendance-import-index="${index}" value="${escapeHtml(group.mentorName || defaults.mentorName)}" aria-invalid="${Boolean(fieldError(index, "mentorName"))}" />
                        ${fieldErrorMarkup(index, "mentorName")}
                      </label>
                      <label class="field-stack attendance-import-lab">
                        <span>Lab <small>obvezno</small></span>
                        <input class="${fieldClass(index, "labName")}" data-attendance-import-field="labName" data-attendance-import-index="${index}" value="${escapeHtml(group.labName || defaults.labName)}" aria-invalid="${Boolean(fieldError(index, "labName"))}" />
                        ${fieldErrorMarkup(index, "labName")}
                      </label>
                      <label class="field-stack attendance-import-location">
                        <span>Lokacija <small>obvezno</small></span>
                        <input class="${fieldClass(index, "location")}" data-attendance-import-field="location" data-attendance-import-index="${index}" value="${escapeHtml(group.location || defaults.location)}" aria-invalid="${Boolean(fieldError(index, "location"))}" />
                        ${fieldErrorMarkup(index, "location")}
                      </label>
                      <label class="field-stack attendance-import-date">
                        <span>Datum <small>obvezno</small></span>
                        <input class="${fieldClass(index, "eventDate")}" type="date" data-attendance-import-field="eventDate" data-attendance-import-index="${index}" value="${escapeHtml(group.eventDate)}" aria-invalid="${Boolean(fieldError(index, "eventDate"))}" />
                        ${fieldErrorMarkup(index, "eventDate")}
                      </label>
                      <label class="field-stack attendance-import-time">
                        <span>Ura <small>obvezno</small></span>
                        <input class="${fieldClass(index, "eventTime")}" type="time" data-attendance-import-field="eventTime" data-attendance-import-index="${index}" value="${escapeHtml(group.eventTime)}" aria-invalid="${Boolean(fieldError(index, "eventTime"))}" />
                        ${fieldErrorMarkup(index, "eventTime")}
                      </label>
                    </div>
                  </section>
                `
              )
              .join("")}
          </div>
          <div class="modal-actions">
            <button class="button button-outline" type="button" data-attendance-import-action="cancel">Prekliči</button>
            <button class="button button-solid" type="button" data-attendance-import-action="confirm">Ustvari podpisne liste</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderAttendanceArchiveModal() {
  if (!state.attendanceArchiveOpen) return "";
  const results = searchAttendance(state.attendanceSheets, state.attendanceSearchQuery);
  const statistics = attendanceStatistics(state.attendanceSheets, state.attendanceCategories);
  const recentSheets = sortRecent(state.attendanceSheets);
  return `
    <div class="modal-backdrop attendance-archive-backdrop" data-action="close-attendance-archive" role="presentation">
      <section class="modal-window attendance-archive-modal" role="dialog" aria-modal="true" aria-labelledby="attendance-archive-title" data-modal-window>
        <header class="modal-header">
          <h2 class="modal-title" id="attendance-archive-title">Udeležbe in statistika</h2>
          <button class="button button-icon-only button-ghost" type="button" data-action="close-attendance-archive" aria-label="Zapri pregled">${icon("x")}</button>
        </header>
        <div class="attendance-archive-tabs" role="tablist" aria-label="Pregled udeležb">
          <button class="${state.attendanceArchiveTab === "search" ? "is-active" : ""}" type="button" role="tab" aria-selected="${state.attendanceArchiveTab === "search"}" data-attendance-archive-tab="search">Iskanje</button>
          <button class="${state.attendanceArchiveTab === "statistics" ? "is-active" : ""}" type="button" role="tab" aria-selected="${state.attendanceArchiveTab === "statistics"}" data-attendance-archive-tab="statistics">Statistika</button>
        </div>
        <div class="modal-body attendance-archive-body">
          ${
            state.attendanceArchiveTab === "statistics"
              ? `
                <div class="attendance-stat-total">
                  <span>Potrjene udeležbe</span>
                  <strong>${statistics.totalConfirmed}</strong>
                </div>
                <div class="attendance-stat-grid">
                  <section>
                    <h3>Po kategorijah</h3>
                    ${statistics.byCategory.length ? statistics.byCategory.map((item) => `<div class="attendance-stat-row"><span>${escapeHtml(item.label)}</span><strong>${item.count}</strong></div>`).join("") : `<p class="empty-text">Potrjenih udeležb še ni.</p>`}
                  </section>
                  <section>
                    <h3>Po programih</h3>
                    ${statistics.byProgram.length ? statistics.byProgram.map((item) => `<div class="attendance-stat-row"><span>${escapeHtml(item.label)}</span><strong>${item.count}</strong></div>`).join("") : `<p class="empty-text">Potrjenih udeležb še ni.</p>`}
                  </section>
                </div>
              `
              : `
                <label class="attendance-search-field">
                  ${icon("search")}
                  <input type="search" data-attendance-search value="${escapeHtml(state.attendanceSearchQuery)}" placeholder="Ime, priimek ali e-pošta" autofocus />
                </label>
                ${
                  state.attendanceSearchQuery
                    ? `<div class="attendance-search-results">
                        ${results.length ? results.map((result) => `
                          <button class="attendance-search-result" type="button" data-load-attendance-sheet-id="${escapeHtml(result.sheetId)}">
                            <span>
                              <strong>${escapeHtml(`${result.firstName} ${result.lastName}`)}</strong>
                              <small>${escapeHtml(result.email)}</small>
                            </span>
                            <span>
                              <strong>${escapeHtml(result.programName)}</strong>
                              <small>${escapeHtml(formatSlovenianDate(result.eventDate))} · ${result.attended ? "Udeležba potrjena" : "Udeležba ni potrjena"}</small>
                            </span>
                            ${icon("chevron-right")}
                          </button>
                        `).join("") : `<p class="empty-text">Za ta vnos ni rezultatov.</p>`}
                      </div>`
                    : `<div class="attendance-sheet-archive-list">
                        ${recentSheets.length ? recentSheets.map((sheet) => `
                          <div class="attendance-sheet-archive-row">
                            <button type="button" data-load-attendance-sheet-id="${escapeHtml(sheet.id)}">
                              <span><strong>${escapeHtml(sheet.programName)}</strong><small>${escapeHtml(formatSlovenianDate(sheet.eventDate))} · ${sheet.participants.length} udeležencev</small></span>
                              ${icon("chevron-right")}
                            </button>
                            <button class="button button-icon-only button-ghost" type="button" data-request-delete-attendance-id="${escapeHtml(sheet.id)}" aria-label="Izbriši podpisni list">${icon("trash-2")}</button>
                          </div>
                        `).join("") : `<p class="empty-text">Podpisni listi še niso shranjeni.</p>`}
                      </div>`
                }
              `
          }
        </div>
      </section>
    </div>
  `;
}

function renderAttendanceCategoryModal() {
  if (!state.attendanceCategoryModalOpen) return "";
  return `
    <div class="modal-backdrop attendance-category-backdrop" data-action="close-attendance-categories" role="presentation">
      <section class="modal-window attendance-category-modal" role="dialog" aria-modal="true" aria-labelledby="attendance-category-title" data-modal-window>
        <header class="modal-header">
          <div>
            <h2 class="modal-title" id="attendance-category-title">Kategorije programov</h2>
            <p class="modal-subtitle">Privzete kategorije lahko skriješ, lastne pa tudi preimenuješ ali izbrišeš.</p>
          </div>
          <button class="button button-icon-only button-ghost" type="button" data-action="close-attendance-categories" aria-label="Zapri kategorije">${icon("x")}</button>
        </header>
        <div class="modal-body">
          <div class="attendance-category-list">
            ${state.attendanceCategories.map((category) => `
              <div class="attendance-category-row">
                ${
                  category.builtIn
                    ? `<strong>${escapeHtml(category.label)}</strong>`
                    : `<input class="input" data-attendance-category-label="${escapeHtml(category.id)}" value="${escapeHtml(category.label)}" aria-label="Ime kategorije" />`
                }
                <label class="attendance-category-visible">
                  <input type="checkbox" data-attendance-category-visible="${escapeHtml(category.id)}" ${category.hidden ? "" : "checked"} />
                  <span>Vidna</span>
                </label>
                ${category.builtIn ? `<span class="attendance-category-locked">${icon("lock")} Privzeta</span>` : `<button class="button button-icon-only button-ghost" type="button" data-delete-attendance-category="${escapeHtml(category.id)}" aria-label="Izbriši kategorijo">${icon("trash-2")}</button>`}
              </div>
            `).join("")}
          </div>
          <form class="attendance-category-add" data-attendance-category-form>
            <input class="input" name="categoryLabel" placeholder="Nova kategorija, npr. Meetup" required />
            <button class="button button-solid" type="submit">${icon("plus")} Dodaj</button>
          </form>
        </div>
      </section>
    </div>
  `;
}

function renderAttendanceDeleteConfirm() {
  if (!state.attendanceDeleteConfirmId) return "";
  const sheet = state.attendanceSheets.find((item) => item.id === state.attendanceDeleteConfirmId);
  if (!sheet) return "";
  return `
    <div class="modal-backdrop attendance-delete-backdrop" data-action="cancel-delete-attendance" role="presentation">
      <section class="modal-window delete-modal" role="dialog" aria-modal="true" aria-labelledby="attendance-delete-title" data-modal-window>
        <header class="modal-header">
          <h2 class="modal-title" id="attendance-delete-title">Izbrišem podpisni list?</h2>
          <button class="button button-icon-only button-ghost" type="button" data-action="cancel-delete-attendance" aria-label="Prekliči brisanje">${icon("x")}</button>
        </header>
        <div class="modal-body delete-modal-body">
          <p>Podpisni list za <strong>${escapeHtml(sheet.programName)}</strong> (${escapeHtml(formatSlovenianDate(sheet.eventDate))}) bo trajno odstranjen iz lokalnega arhiva in statistike.</p>
          <div class="modal-actions">
            <button class="button button-outline" type="button" data-action="cancel-delete-attendance">Prekliči</button>
            <button class="button button-solid button-danger" type="button" data-action="confirm-delete-attendance">Izbriši podpisni list</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderAttendanceExportPrompt() {
  if (!state.attendanceExportPrompt) return "";
  const { mode, missingCount } = state.attendanceExportPrompt;
  const isPrint = mode === "print";

  return `
    <div class="modal-backdrop attendance-export-backdrop" data-action="cancel-attendance-export" role="presentation">
      <section class="modal-window attendance-export-modal" role="dialog" aria-modal="true" aria-labelledby="attendance-export-title" data-modal-window>
        <header class="modal-header">
          <h2 class="modal-title" id="attendance-export-title">Manjkajo podatki</h2>
          <button class="button button-icon-only button-ghost" type="button" data-action="cancel-attendance-export" aria-label="Nazaj na obrazec">${icon("x")}</button>
        </header>
        <div class="modal-body delete-modal-body">
          <p>Podpisni list ni v celoti izpolnjen. Število manjkajočih obveznih polj: <strong>${missingCount}</strong>.</p>
          <p class="attendance-export-note">Dokument lahko vseeno ${isPrint ? "natisnete" : "prenesete"} in manjkajoče podatke pozneje dopišete ročno.</p>
          <div class="modal-actions">
            <button class="button button-outline" type="button" data-action="cancel-attendance-export">Nazaj na obrazec</button>
            <button class="button button-solid" type="button" data-action="confirm-attendance-export">${isPrint ? "Vseeno natisni" : "Vseeno prenesi PDF"}</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderAttendanceSheet() {
  const sheet = state.currentAttendanceSheet;
  const saveState = attendanceSaveState();
  const disabledAttr = state.busy ? "disabled" : "";
  const participants = sheet.participants || [];
  const pageCount = Math.max(
    1,
    Math.ceil(participants.length / ATTENDANCE_ROWS_PER_PAGE)
  );
  const confirmedCount = participants.filter((participant) => participant.attended).length;
  const recentSheets = sortRecent(state.attendanceSheets).slice(0, 5);

  root.innerHTML = `
    <main class="app-shell evidence-shell attendance-shell evidence-attendance">
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
        ${renderEvidenceTabs("attendance", disabledAttr)}
      </div>

      <section class="workspace attendance-workspace" id="evidence-workspace">
        <div class="document-stage attendance-document-stage">
          <div class="attendance-pages">
            ${Array.from(
              { length: pageCount },
              (_, index) =>
                renderAttendancePage(
                  sheet,
                  participants.slice(
                    index * ATTENDANCE_ROWS_PER_PAGE,
                    index * ATTENDANCE_ROWS_PER_PAGE + ATTENDANCE_ROWS_PER_PAGE
                  ),
                  index,
                  pageCount
                )
            ).join("")}
            <button class="button button-outline attendance-add-participant" type="button" data-action="add-attendance-participant">${icon("user-plus")} Dodaj udeleženca</button>
          </div>
        </div>

        <aside class="side-panel${state.toolsPanelOpen ? " is-open" : ""}" id="toolsPanel" aria-label="Pregled podpisnega lista">
          <div class="panel-drawer-header">
            <span>${icon("panel-right")} Pregled podpisnega lista</span>
            <button class="button button-icon-only button-ghost" type="button" data-action="close-tools" aria-label="Zapri pregled">${icon("x")}</button>
          </div>
          ${renderDocumentCommands("attendance", saveState, disabledAttr)}

          <section class="panel">
            <div class="panel-header">
              <span class="panel-icon">${icon("file-up")}</span>
              <span class="panel-title">Uvoz udeležencev</span>
            </div>
            <div class="panel-body">
              <p class="empty-text">${sheet.sourceFileName ? `Uvoženo iz: ${escapeHtml(sheet.sourceFileName)}` : "Naloži Wagtail CSV. Če vsebuje več terminov, bo aplikacija pripravila več podpisnih listov."}</p>
              <button class="attendance-dropzone${state.busy ? " is-disabled" : ""}" type="button" data-action="import-attendance" data-attendance-dropzone data-busy-sensitive ${disabledAttr}>
                <span>${icon("upload")} Povleci CSV sem</span>
                <small>ali klikni za izbor datoteke</small>
              </button>
            </div>
          </section>

          <section class="panel">
            <div class="panel-header">
              <span class="panel-icon">${icon("user-check")}</span>
              <span class="panel-title">Udeležba</span>
            </div>
            <div class="panel-body">
              <div class="attendance-counts">
                <span><small>Uvoženi</small><strong>${participants.length}</strong></span>
                <span><small>Potrjeni</small><strong>${confirmedCount}</strong></span>
              </div>
              ${
                participants.length
                  ? `<label class="attendance-confirm-all">
                      <input
                        type="checkbox"
                        data-attendance-confirm-all
                        ${confirmedCount === participants.length ? "checked" : ""}
                        data-partially-checked="${confirmedCount > 0 && confirmedCount < participants.length ? "true" : "false"}"
                      />
                      <span>Označi vse</span>
                    </label>
                    <div class="attendance-confirm-list">
                      ${participants.map((participant) => `
                        <label>
                          <input type="checkbox" data-attendance-confirm="${escapeHtml(participant.id)}" ${participant.attended ? "checked" : ""} />
                          <span><strong>${escapeHtml(`${participant.firstName} ${participant.lastName}`.trim() || "Brez imena")}</strong><small>${escapeHtml(attendanceParticipantEmailDisplay(participant))}</small></span>
                        </label>
                      `).join("")}
                    </div>`
                  : `<p class="empty-text">Po uvozu ali ročnem vnosu lahko tu potrdiš dejansko udeležbo.</p>`
              }
            </div>
          </section>

          <section class="panel">
            <div class="panel-header">
              <span class="panel-icon">${icon("search")}</span>
              <span class="panel-title">Iskanje in statistika</span>
            </div>
            <div class="panel-body">
              <button class="attendance-search-launch" type="button" data-action="open-attendance-archive">
                ${icon("search")} Preveri osebo ali odpri statistiko
              </button>
              <div class="separator"></div>
              <div class="history-head"><span>Zadnji podpisni listi</span></div>
              ${
                recentSheets.length
                  ? `<div class="attendance-recent-list">
                      ${recentSheets.map((savedSheet) => `
                        <button type="button" data-load-attendance-sheet-id="${escapeHtml(savedSheet.id)}">
                          <span><strong>${escapeHtml(savedSheet.programName)}</strong><small>${escapeHtml(formatSlovenianDate(savedSheet.eventDate))} · ${savedSheet.participants.length} udeležencev</small></span>
                          ${icon("chevron-right")}
                        </button>
                      `).join("")}
                    </div>`
                  : `<p class="empty-text">Shranjeni podpisni listi se bodo pokazali tukaj.</p>`
              }
            </div>
          </section>

          <section class="panel">
            <div class="panel-header">
              <span class="panel-icon">${icon("tags")}</span>
              <span class="panel-title">Kategorije programov</span>
            </div>
            <div class="panel-body">
              <div class="settings-summary-row">
                <span>Trenutna kategorija</span>
                <strong>${escapeHtml(attendanceCategoryLabel(sheet.categoryId))}</strong>
              </div>
              <button class="button button-outline button-full" type="button" data-action="open-attendance-categories">${icon("settings-2")} Uredi kategorije</button>
            </div>
          </section>
        </aside>
      </section>

      <div class="tools-panel-backdrop${state.toolsPanelOpen ? " is-open" : ""}" data-action="close-tools" aria-hidden="true"></div>
      <button class="mobile-panel-toggle" type="button" data-action="toggle-tools" aria-controls="toolsPanel" aria-expanded="${state.toolsPanelOpen ? "true" : "false"}">${icon("panel-right")} Pregled</button>
      <input class="hidden-input" type="file" id="attendanceCsvInput" accept=".csv,text/csv,text/plain" />
      ${renderAttendanceImportModal()}
      ${renderAttendanceArchiveModal()}
      ${renderAttendanceCategoryModal()}
      ${renderAttendanceDeleteConfirm()}
      ${renderAttendanceExportPrompt()}
      ${renderUnsavedPrompt()}
    </main>
  `;

  renderGlobalOverlays();
  bindAttendanceEvents();
  refreshIcons();
  renderToast();
}

function selectedHourReport() {
  const reports = state.hourBatch?.reports || [];
  return (
    reports.find((report) => report.id === state.selectedHourReportId) ||
    reports[0] ||
    null
  );
}

function hourReportsUnlocked() {
  return state.hourSecurity.status === "unprotected" || (
    state.hourSecurity.status === "unlocked" &&
    Boolean(state.hourSecurity.activeKey)
  );
}

function ensureHourReportsUnlocked() {
  if (hourReportsUnlocked()) return true;
  if (state.hourSecurity.status === "reset-required") {
    state.hourSecurity.screen = "reset-confirm";
    render();
    showToast("Zaščito Poročil ur je treba varno ponastaviti.");
    return false;
  }
  state.hourSecurity.status = state.hourSecurity.config ? "locked" : "unconfigured";
  state.hourSecurity.screen = state.hourSecurity.config ? "unlock" : "setup";
  state.hourSecurity.error = "";
  render();
  showToast(
    state.hourSecurity.config
      ? "Za nadaljevanje najprej odkleni Poročila ur."
      : "Za Poročila ur najprej nastavi šestmestni PIN."
  );
  return false;
}

function hourSecurityViewState() {
  const remainingSeconds = Math.max(
    0,
    Math.ceil((state.hourSecurity.lockoutUntil - Date.now()) / 1000)
  );
  return {
    status: state.hourSecurity.status,
    screen: state.hourSecurity.screen,
    configured: Boolean(state.hourSecurity.config),
    unprotected: state.hourSecurity.status === "unprotected",
    error: state.hourSecurity.error,
    failedAttempts: state.hourSecurity.failedAttempts,
    remainingSeconds
  };
}

function scheduleHourSecurityCooldownRender() {
  window.clearInterval(hourSecurityCooldownTimer);
  if (state.hourSecurity.lockoutUntil <= Date.now()) return;
  hourSecurityCooldownTimer = window.setInterval(() => {
    if (state.hourSecurity.lockoutUntil <= Date.now()) {
      window.clearInterval(hourSecurityCooldownTimer);
      state.hourSecurity.lockoutUntil = 0;
    }
    if (state.documentType === "hourReports") render();
  }, 1000);
}

function renderHourReports() {
  const saveState = hourReportsSaveState();
  const disabledAttr = state.busy ? "disabled" : "";
  root.innerHTML = renderHourReportsWorkspace({
    batch: state.hourBatch,
    selectedReport: selectedHourReport(),
    security: hourSecurityViewState(),
    saveState,
    disabledAttr,
    toolsPanelOpen: state.toolsPanelOpen,
    renderEvidenceTabs,
    renderDocumentCommands,
    renderSignaturePanel,
    renderSignatureZone,
    renderHourRowDeleteConfirm,
    renderUnsavedPrompt,
    icon,
    escapeHtml,
    formatCurrency
  });
  renderGlobalOverlays();
  bindHourReportEvents();
  scheduleHourSecurityCooldownRender();
  refreshIcons();
  renderToast();
}

function render() {
  if (state.documentType === "hourReports") {
    renderHourReports();
    return;
  }
  if (state.documentType === "attendance") {
    renderAttendanceSheet();
    return;
  }
  if (state.documentType === "materialIssue") {
    renderMaterialIssue();
    return;
  }

  const currentYear = yearFromDate(state.current.issueDate);
  const allRecent = sortRecent(state.proposals);
  const recent = allRecent.slice(0, 5);
  const hasMoreHistory = allRecent.length > 5;
  const yearlySpending = spendingForYear(state.proposals, currentYear);
  const yearlySpendingBreakdown = spendingBreakdownForYear(state.proposals, currentYear);
  const attachment = state.attachment;
  const disabledAttr = state.busy ? "disabled" : "";
  const saveState = documentSaveState();
  const validation = state.validation || emptyValidationState();
  const attachmentDetail = attachment?.mimeType?.startsWith("image/")
    ? "Priložena slika se ob izvozu doda kot dodatna stran v dokumentu PDF."
    : "Priloženo k izvozu v PDF";
  const dropzoneTitle = attachment ? "Spusti datoteko za zamenjavo" : "Povleci datoteko sem";
  const dropzoneHint = "Datoteka PDF ali slika (PNG, JPG, WEBP ...), lahko pa klikneš za izbor.";

  root.innerHTML = `
    <main class="app-shell evidence-shell evidence-proposal">
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
        ${renderEvidenceTabs("proposal", disabledAttr)}
      </div>

      <section class="workspace" id="evidence-workspace">
        <div class="document-stage">
          <div class="paper-frame" style="${documentLayoutCssVariables()}">
            ${renderProposalPaper(state.current)}
          </div>
        </div>

        <aside class="side-panel${state.toolsPanelOpen ? " is-open" : ""}" id="toolsPanel" aria-label="Pregled dokumenta">
          <div class="panel-drawer-header">
            <span>${icon("panel-right")} Pregled dokumenta</span>
            <button class="button button-icon-only button-ghost" type="button" data-action="close-tools" aria-label="Zapri pregled dokumenta">
              ${icon("x")}
            </button>
          </div>
          ${renderDocumentCommands("proposal", saveState, disabledAttr)}
          <section class="panel">
            <div class="panel-header">
              <span class="panel-icon">${icon("paperclip")}</span>
              <span class="panel-title">Pripeta ponudba</span>
            </div>
            <div class="panel-body">
              ${
                attachment
                  ? `<div class="file-row">
                      <div class="file-meta">
                        <span class="file-name">${escapeHtml(attachment.fileName)}</span>
                        <span class="file-detail">${escapeHtml(attachmentDetail)}</span>
                      </div>
                      <button class="button button-icon-only button-ghost" type="button" data-action="remove-attachment" aria-label="Odstrani ponudbo">${icon("x")}</button>
                    </div>`
                  : `<p class="empty-text">Ponudba še ni pripeta. Povleci datoteko PDF ali sliko v spodnje polje.</p>`
              }
              <button class="offer-dropzone${state.busy ? " is-disabled" : ""}" type="button" data-action="attach" data-offer-dropzone aria-label="Povleci in spusti ponudbo ali klikni za izbor datoteke" data-busy-sensitive ${disabledAttr}>
                <span class="offer-drop-title">${icon("upload")} ${escapeHtml(dropzoneTitle)}</span>
                <span class="offer-drop-hint">${escapeHtml(dropzoneHint)}</span>
              </button>
            </div>
          </section>

          ${renderCompanyDirectoryPanel()}

          <section class="panel">
            <div class="panel-header">
              <span class="panel-icon">${icon("wallet")}</span>
              <span class="panel-title">Poraba ${currentYear}</span>
            </div>
            <div class="panel-body">
              <div class="metric">
                <span class="metric-copy">
                  <span class="metric-label">Vsota oddanih predlogov</span>
                  <span class="metric-note">Brez zavrnjenih predlogov</span>
                </span>
                <span class="metric-value-wrap">
                  <strong
                    class="metric-value metric-value-private"
                    tabindex="0"
                    aria-describedby="spendingBreakdown"
                    aria-label="Letna poraba brez zavrnjenih predlogov ${formatCurrency(yearlySpending)}"
                    title="Premakni miško čez znesek za prikaz razčlenitve"
                  >${formatCurrency(yearlySpending)}</strong>
                  <span class="spending-breakdown-popover" id="spendingBreakdown" role="tooltip">
                    ${renderSpendingBreakdown(yearlySpendingBreakdown, yearlySpending)}
                  </span>
                </span>
              </div>
              <div class="separator"></div>
              <div class="history-head">
                <span class="hint-label">Zadnji dokumenti</span>
                ${
                  hasMoreHistory
                    ? `<button class="history-open-button" type="button" data-action="open-history" aria-label="Prikaži vse dokumente">
                         ${icon("expand")}
                       </button>`
                    : ""
                }
              </div>
              ${
                recent.length
                  ? recent
                      .map((proposal) => renderDocumentRow(proposal))
                      .join("")
                  : `<p class="empty-text">Ko dokument prvič shraniš, se pokaže tukaj in se všteje v letno porabo.</p>`
              }
            </div>
          </section>

          ${renderSignaturePanel()}

          <section class="panel">
            <div class="panel-header">
              <span class="panel-icon">${icon("pencil")}</span>
              <span class="panel-title">Urejanje dokumenta</span>
            </div>
            <div class="panel-body">
              <div class="settings-summary">
                <div class="settings-summary-row">
                  <span>Interna evidenca</span>
                  ${
                    state.current.serial
                      ? `<strong>${escapeHtml(state.current.serial)}</strong>`
                      : `<span class="settings-summary-value">
                          <strong>Ni shranjeno</strong>
                          <small>Predvideno: ${escapeHtml(serialPreview())}</small>
                        </span>`
                  }
                </div>
                <div class="settings-summary-row">
                  <span>Računovodstvo</span>
                  <strong>Št.: ${escapeHtml(accountingNumberPreview())}</strong>
                </div>
                <div class="settings-summary-row">
                  <span>Logotip</span>
                  <strong>Center Rog</strong>
                </div>
                <div class="settings-summary-row settings-summary-editable">
                  <label for="labCode">Kratica laba</label>
                  <span class="settings-code-field-wrap">
                    <input class="${validationControlClass("settings-code-input", "labCode")}" id="labCode" data-field="labCode" value="${escapeHtml(state.current.labCode)}" aria-label="Kratica laba za interno številčenje" ${validationControlAttrs("labCode")} />
                    ${renderFieldError("labCode")}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </section>

      <div class="tools-panel-backdrop${state.toolsPanelOpen ? " is-open" : ""}" data-action="close-tools" aria-hidden="true"></div>

      <button
        class="mobile-panel-toggle"
        type="button"
        data-action="toggle-tools"
        aria-controls="toolsPanel"
        aria-expanded="${state.toolsPanelOpen ? "true" : "false"}"
      >
        ${icon("panel-right")} Pregled
      </button>

      <input class="hidden-input" type="file" id="offerInput" accept="application/pdf,image/*" />
      <input class="hidden-input" type="file" id="signatureInput" accept="image/png,image/jpeg,.png,.jpg,.jpeg" />

      ${
        state.historyModalOpen
          ? `<div class="modal-backdrop" data-action="close-history" role="presentation">
               <section class="modal-window history-modal" role="dialog" aria-modal="true" aria-labelledby="history-modal-title" data-modal-window>
                 <header class="modal-header">
                   <h2 class="modal-title" id="history-modal-title">Vsi izdani dokumenti</h2>
                   <button class="button button-icon-only button-ghost" type="button" data-action="close-history" aria-label="Zapri seznam dokumentov">
                     ${icon("x")}
                   </button>
                 </header>
                 <div class="modal-body">
                   ${
                     allRecent.length
                       ? `<div class="modal-list">
                            ${allRecent
                              .map((proposal) => renderDocumentRow(proposal, { modal: true }))
                              .join("")}
                          </div>`
                       : `<p class="empty-text">Dokumenti še niso shranjeni.</p>`
                   }
                 </div>
               </section>
             </div>`
          : ""
      }
      ${renderProposalPreviewModal()}
      ${renderStatusMenu()}
      ${renderMaterialStatusMenu()}
      ${renderDocumentPopover()}
      ${renderDeleteConfirm()}
      ${renderUnsavedPrompt()}
      <div class="delete-drag-hint" data-delete-drag-hint aria-hidden="true">Povleci iz kartice</div>
      ${renderOnboarding()}
    </main>
  `;

  renderGlobalOverlays();
  enhanceCollapsiblePanels();
  bindEvents();
  refreshIcons();
  renderToast();
  positionOnboardingTooltip({ reveal: true });
  syncOnboardingCalculatorDemo();
}

function refreshIcons() {
  if (window.lucide?.createIcons) {
    window.lucide.createIcons({
      icons: window.lucide.icons,
      attrs: {
        "stroke-width": 1.8
      }
    });
  }
}

function bindEvents() {
  document.querySelectorAll("[data-field]").forEach((field) => {
    field.addEventListener("input", (event) => {
      if (event.currentTarget.dataset.onboardingDemoActive === "true") {
        stopOnboardingCalculatorDemo({ restore: false });
      }

      const name = event.currentTarget.dataset.field;
      if (name === "estimatedValueCents") {
        state.current.estimatedValueCents = parseMoneyToCents(event.currentTarget.value);
      } else {
        state.current[name] = event.currentTarget.value;
      }

      if (name === "explanation") {
        const calculated = extractEuroTotalCents(state.current.explanation);
        if (calculated > 0) {
          state.current.estimatedValueCents = calculated;
        }
        syncCalculatedValueDisplay(calculated);
      }

      if (name === "issueDate") {
        state.current.year = yearFromDate(state.current.issueDate);
        if (!state.current.serial) render();
      }

      if (name === "labCode" && !state.current.serial) {
        state.current.labCode = normalizeLabCode(state.current.labCode);
        render();
      }

      markDirty();
      if (event.currentTarget.dataset.smartField) {
        showSuggestions(event.currentTarget);
      }
    });

    if (field.dataset.smartField) {
      field.addEventListener("focus", (event) => showSuggestions(event.currentTarget));
    }
  });

  document.querySelector("[data-company-directory-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveCompanyDirectoryEntry(event.currentTarget);
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", (event) => handleAction(button.dataset.action, event));
  });

  document.querySelectorAll("[data-load-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (consumeSuppressedRecentClick(button.dataset.loadId)) {
        event.preventDefault();
        return;
      }
      clearDocumentPopoverTimers();
      void openProposalPreview(button.dataset.loadId);
    });
    button.addEventListener("mouseenter", () => scheduleDocumentPopoverFromElement(button));
    button.addEventListener("mouseleave", closeDocumentPopover);
    button.addEventListener("focus", () => scheduleDocumentPopoverFromElement(button));
    button.addEventListener("blur", closeDocumentPopover);
    button.addEventListener("pointerdown", (event) => {
      startRecentDeleteDrag(event, button);
      if (event.pointerType === "mouse") return;
      window.clearTimeout(touchPopoverTimer);
      touchPopoverTimer = window.setTimeout(() => {
        openDocumentPopoverFromElement(button);
      }, 520);
    });
    button.addEventListener("pointermove", (event) => updateRecentDeleteDrag(event, button));
    button.addEventListener("pointerup", () => {
      window.clearTimeout(touchPopoverTimer);
      finishRecentDeleteDrag();
    });
    button.addEventListener("pointercancel", () => {
      window.clearTimeout(touchPopoverTimer);
      cancelRecentDeleteDrag();
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeDocumentPopover();
      openStatusMenu(button.dataset.loadId, event.clientX, event.clientY);
    });
  });

  document.querySelectorAll("[data-status-menu-id]").forEach((target) => {
    target.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = target.getBoundingClientRect();
      openStatusMenu(target.dataset.statusMenuId, rect.left, rect.bottom + 6);
    });
    target.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      const rect = target.getBoundingClientRect();
      openStatusMenu(target.dataset.statusMenuId, rect.left, rect.bottom + 6);
    });
  });

  document.querySelectorAll("[data-status-option-id]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await updateDocumentStatus(button.dataset.statusOptionId, button.dataset.statusValue || "");
    });
  });

  document.querySelectorAll("[data-delete-request-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDeleteConfirm(button.dataset.deleteRequestId);
    });
  });

  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (event) => {
      if (event.target !== event.currentTarget) return;
      if (backdrop.dataset.action === "cancel-delete") {
        closeDeleteConfirm();
      } else if (backdrop.dataset.action === "close-proposal-preview") {
        void closeProposalPreview();
      } else {
        closeHistoryModal();
      }
    });
  });
  document.querySelectorAll("[data-modal-window]").forEach((modal) => modal.addEventListener("click", (event) => {
    event.stopPropagation();
  }));

  document.getElementById("offerInput")?.addEventListener("change", handleOfferSelected);
  document.getElementById("signatureInput")?.addEventListener("change", handleSignatureSelected);
  bindSignatureEvents();
  bindOfferDropzone();
  bindEvidenceNavigationEvents();
  bindOnboardingEvents();

  if (!outsideClickBound) {
    document.addEventListener("click", closeSuggestionsOnOutsideClick);
    outsideClickBound = true;
  }

  if (!onboardingViewportBound) {
    window.addEventListener("resize", positionOnboardingTooltip, { passive: true });
    window.addEventListener("scroll", positionOnboardingTooltip, { passive: true, capture: true });
    document.addEventListener("scroll", positionOnboardingTooltip, { passive: true, capture: true });
    onboardingViewportBound = true;
  }
}

function clearMaterialValidation() {
  state.materialValidation = {
    message: "",
    fields: {},
    firstInvalidField: ""
  };
}

function clearMaterialValidationField(fieldName) {
  if (!state.materialValidation.fields?.[fieldName]) return;
  const fields = { ...state.materialValidation.fields };
  delete fields[fieldName];
  state.materialValidation = {
    ...state.materialValidation,
    fields,
    message: Object.keys(fields).length ? state.materialValidation.message : "",
    firstInvalidField:
      state.materialValidation.firstInvalidField === fieldName
        ? Object.keys(fields)[0] || ""
        : state.materialValidation.firstInvalidField
  };
}

function bindMaterialIssueEvents() {
  document.querySelectorAll("[data-material-field]").forEach((field) => {
    field.addEventListener("input", (event) => {
      const name = event.currentTarget.dataset.materialField;
      state.currentMaterialIssue[name] = event.currentTarget.value;
      clearMaterialValidationField(name);
      if (name === "issueDate") {
        state.currentMaterialIssue.year = yearFromDate(state.currentMaterialIssue.issueDate);
      }
      markDirty();
    });

    field.addEventListener("change", (event) => {
      const name = event.currentTarget.dataset.materialField;
      if (name !== "labCode") return;
      state.currentMaterialIssue.labCode = normalizeLabCode(event.currentTarget.value);
      event.currentTarget.value = state.currentMaterialIssue.labCode;
      markDirty();
    });
  });

  document.querySelectorAll("[data-material-item-field]").forEach((field) => {
    field.addEventListener("input", handleMaterialRowInput);
    field.addEventListener("change", handleMaterialRowInput);
  });

  document.querySelectorAll("[data-remove-material-row]").forEach((button) => {
    button.addEventListener("click", () => removeMaterialRow(button.dataset.removeMaterialRow));
  });

  document.querySelectorAll("[data-load-material-issue-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (event.target.closest("[data-material-status-menu-id]")) return;
      loadMaterialIssue(button.dataset.loadMaterialIssueId);
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMaterialStatusMenu(button.dataset.loadMaterialIssueId, event.clientX, event.clientY);
    });
  });

  document.querySelectorAll("[data-material-status-menu-id]").forEach((target) => {
    target.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = target.getBoundingClientRect();
      openMaterialStatusMenu(target.dataset.materialStatusMenuId, rect.left, rect.bottom + 6);
    });
    target.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      const rect = target.getBoundingClientRect();
      openMaterialStatusMenu(target.dataset.materialStatusMenuId, rect.left, rect.bottom + 6);
    });
  });

  document.querySelectorAll("[data-material-status-option-id]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await updateMaterialIssueStatusForIssue(
        button.dataset.materialStatusOptionId,
        button.dataset.materialStatusValue || "draft"
      );
    });
  });

  document.getElementById("signatureInput")?.addEventListener("change", handleSignatureSelected);
  bindSignatureEvents();

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action));
  });
  bindEvidenceNavigationEvents();
}

function clearAttendanceValidation() {
  state.attendanceValidation = {
    message: "",
    fields: {},
    firstInvalidField: ""
  };
}

function clearAttendanceValidationField(fieldName) {
  if (!state.attendanceValidation.fields?.[fieldName]) return;
  const fields = { ...state.attendanceValidation.fields };
  delete fields[fieldName];
  state.attendanceValidation = {
    ...state.attendanceValidation,
    fields,
    message: Object.keys(fields).length ? state.attendanceValidation.message : "",
    firstInvalidField:
      state.attendanceValidation.firstInvalidField === fieldName
        ? Object.keys(fields)[0] || ""
        : state.attendanceValidation.firstInvalidField
  };
}

function attendanceValidationSelector(fieldName) {
  if (fieldName === "participants") return "[data-action='add-attendance-participant']";
  if (fieldName.startsWith("participants.")) {
    const [, participantId, participantField] = fieldName.split(".");
    if (participantField === "email") {
      return [
        `[data-attendance-participant-id="${CSS.escape(participantId)}"][data-attendance-participant-field="email"]`,
        `[data-attendance-participant-id="${CSS.escape(participantId)}"][data-attendance-participant-field="contactEmail"]`
      ].join(", ");
    }
    return `[data-attendance-participant-id="${CSS.escape(participantId)}"][data-attendance-participant-field="${CSS.escape(participantField)}"]`;
  }
  return `[data-attendance-field="${CSS.escape(fieldName)}"]`;
}

function focusAttendanceValidationTarget(validation) {
  const selector = attendanceValidationSelector(validation?.firstInvalidField || "");
  if (!selector) return;
  window.setTimeout(() => {
    const target = document.querySelector(selector);
    if (!(target instanceof HTMLElement)) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "center", inline: "nearest" });
  }, 60);
}

function validateCurrentAttendanceSheet() {
  const validation = validateAttendanceSheet(state.currentAttendanceSheet);
  state.attendanceValidation = validation;
  if (!validation.valid) {
    render();
    focusAttendanceValidationTarget(validation);
  }
  return validation;
}

function currentAttendanceProfile() {
  const latestIssue = sortRecent(state.materialIssues)[0];
  const latestProposal = sortRecent(state.proposals)[0] || state.current;
  return {
    fullName: latestIssue?.issuerName || latestProposal?.fullName || "",
    labName:
      latestIssue?.labName ||
      String(latestProposal?.purpose || "").replace(/^za potrebe\s+/i, "").trim()
  };
}

function attendanceDefaultMetadata() {
  const latest = sortRecent(state.attendanceSheets)[0];
  const profile = currentAttendanceProfile();
  return {
    lastSheet: latest,
    profile,
    categoryId: latest?.categoryId || DEFAULT_ATTENDANCE_CATEGORIES[0].id,
    mentorName: latest?.mentorName || profile.fullName || "",
    labName: latest?.labName || profile.labName || "",
    location: latest?.location || DEFAULTS.city
  };
}

function updateAttendanceDuplicateFlags() {
  const counts = new Map();
  state.currentAttendanceSheet.participants.forEach((participant) => {
    const email = String(participant.email || "").trim().toLocaleLowerCase("sl-SI");
    if (email) counts.set(email, (counts.get(email) || 0) + 1);
  });
  state.currentAttendanceSheet.participants.forEach((participant) => {
    const email = String(participant.email || "").trim().toLocaleLowerCase("sl-SI");
    participant.duplicateEmail = Boolean(email && (counts.get(email) || 0) > 1);
  });
}

function showAttendanceSuggestions(input) {
  const field = input.dataset.attendanceSmartField;
  const wrapper = input.closest(".smart-field");
  if (!wrapper || !field) return;
  wrapper.querySelector(".suggestion-popover")?.remove();
  const suggestions = attendanceSuggestions(state.attendanceSheets, field, input.value);
  if (!suggestions.length) return;

  const popover = document.createElement("div");
  popover.className = "suggestion-popover";
  popover.setAttribute("role", "listbox");
  suggestions.forEach((suggestion) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-button";
    button.textContent = suggestion;
    button.addEventListener("click", () => {
      input.value = suggestion;
      state.currentAttendanceSheet[field] = suggestion;
      clearAttendanceValidationField(field);
      markDirty();
      popover.remove();
      input.focus();
    });
    popover.append(button);
  });
  wrapper.append(popover);
}

function bindAttendanceDropzone() {
  const dropzone = document.querySelector("[data-attendance-dropzone]");
  if (!dropzone) return;
  const markDragging = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!state.busy) dropzone.classList.add("is-dragging");
  };
  const clearDragging = (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropzone.classList.remove("is-dragging");
  };
  dropzone.addEventListener("dragenter", markDragging);
  dropzone.addEventListener("dragover", markDragging);
  dropzone.addEventListener("dragleave", clearDragging);
  dropzone.addEventListener("drop", async (event) => {
    clearDragging(event);
    const [file] = event.dataTransfer?.files || [];
    if (!file) return;
    await handleAttendanceCsvFile(file);
  });
}

function bindAttendanceEvents() {
  document.querySelectorAll("[data-attendance-field]").forEach((field) => {
    const update = (event) => {
      const name = event.currentTarget.dataset.attendanceField;
      state.currentAttendanceSheet[name] = event.currentTarget.value;
      clearAttendanceValidationField(name);
      markDirty();
      if (event.currentTarget.dataset.attendanceSmartField) {
        showAttendanceSuggestions(event.currentTarget);
      }
    };
    field.addEventListener("input", update);
    field.addEventListener("change", update);
    if (field.dataset.attendanceSmartField) {
      field.addEventListener("focus", (event) => showAttendanceSuggestions(event.currentTarget));
    }
  });

  document.querySelectorAll("[data-attendance-participant-field]").forEach((field) => {
    field.addEventListener("input", (event) => {
      const participant = state.currentAttendanceSheet.participants.find(
        (item) => item.id === event.currentTarget.dataset.attendanceParticipantId
      );
      if (!participant) return;
      const name = event.currentTarget.dataset.attendanceParticipantField;
      if (name === "contactEmail") {
        const parsed = parseAttendanceContactEmail(event.currentTarget.value);
        participant.contactName = parsed.contactName;
        participant.email = parsed.email;
        clearAttendanceValidationField(`participants.${participant.id}.email`);
      } else {
        participant[name] =
          name === "photoConsent"
            ? normalizePhotoConsent(event.currentTarget.value)
            : event.currentTarget.value;
        clearAttendanceValidationField(`participants.${participant.id}.${name}`);
      }
      markDirty();
    });
    if (["email", "contactEmail"].includes(field.dataset.attendanceParticipantField)) {
      field.addEventListener("blur", () => {
        updateAttendanceDuplicateFlags();
        render();
      });
    }
  });

  document.querySelectorAll("[data-remove-attendance-participant]").forEach((button) => {
    button.addEventListener("click", () => removeAttendanceParticipant(button.dataset.removeAttendanceParticipant));
  });
  document.querySelectorAll("[data-attendance-confirm]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const participant = state.currentAttendanceSheet.participants.find(
        (item) => item.id === checkbox.dataset.attendanceConfirm
      );
      if (!participant) return;
      participant.attended = checkbox.checked;
      markDirty();
      render();
    });
  });
  document.querySelectorAll("[data-attendance-confirm-all]").forEach((checkbox) => {
    checkbox.indeterminate = checkbox.dataset.partiallyChecked === "true";
    checkbox.addEventListener("change", () => {
      state.currentAttendanceSheet.participants.forEach((participant) => {
        participant.attended = checkbox.checked;
      });
      markDirty();
      render();
    });
  });
  document.querySelectorAll("[data-load-attendance-sheet-id]").forEach((button) => {
    button.addEventListener("click", () => loadAttendanceSheet(button.dataset.loadAttendanceSheetId));
  });
  document.querySelectorAll("[data-request-delete-attendance-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      requestDeleteAttendanceSheet(button.dataset.requestDeleteAttendanceId);
    });
  });

  document.getElementById("attendanceCsvInput")?.addEventListener("change", async (event) => {
    const [file] = event.currentTarget.files || [];
    event.currentTarget.value = "";
    if (file) await handleAttendanceCsvFile(file);
  });
  bindAttendanceDropzone();

  document.querySelectorAll("[data-attendance-import-field]").forEach((field) => {
    field.addEventListener("input", updateAttendanceImportField);
    field.addEventListener("change", updateAttendanceImportField);
  });
  document.querySelectorAll("[data-attendance-import-action]").forEach((button) => {
    button.addEventListener("click", () => handleAttendanceImportAction(button.dataset.attendanceImportAction));
  });

  document.querySelectorAll("[data-attendance-archive-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.attendanceArchiveTab = button.dataset.attendanceArchiveTab;
      render();
    });
  });
  document.querySelector("[data-attendance-search]")?.addEventListener("input", (event) => {
    state.attendanceSearchQuery = event.currentTarget.value;
    render();
    window.setTimeout(() => {
      const search = document.querySelector("[data-attendance-search]");
      search?.focus();
      search?.setSelectionRange?.(search.value.length, search.value.length);
    }, 0);
  });

  document.querySelector("[data-attendance-category-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const category = createCustomAttendanceCategory(new FormData(event.currentTarget).get("categoryLabel"));
    if (!category) return;
    state.attendanceCategories = normalizeAttendanceCategories([...state.attendanceCategories, category]);
    await persistAttendanceCategories();
    render();
  });
  document.querySelectorAll("[data-attendance-category-label]").forEach((input) => {
    input.addEventListener("change", async () => {
      const category = state.attendanceCategories.find((item) => item.id === input.dataset.attendanceCategoryLabel);
      const label = input.value.trim();
      if (!category || category.builtIn || !label) return;
      category.label = label;
      await persistAttendanceCategories();
      render();
    });
  });
  document.querySelectorAll("[data-attendance-category-visible]").forEach((checkbox) => {
    checkbox.addEventListener("change", async () => {
      const category = state.attendanceCategories.find((item) => item.id === checkbox.dataset.attendanceCategoryVisible);
      if (!category) return;
      if (
        !checkbox.checked &&
        state.attendanceCategories.filter((item) => !item.hidden && item.id !== category.id).length === 0
      ) {
        checkbox.checked = true;
        showToast("Vsaj ena kategorija mora ostati vidna.");
        return;
      }
      category.hidden = !checkbox.checked;
      await persistAttendanceCategories();
      render();
    });
  });
  document.querySelectorAll("[data-delete-attendance-category]").forEach((button) => {
    button.addEventListener("click", async () => {
      await deleteCustomAttendanceCategory(button.dataset.deleteAttendanceCategory);
    });
  });

  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (event) => {
      if (event.target !== event.currentTarget) return;
      if (backdrop.classList.contains("attendance-archive-backdrop")) closeAttendanceArchive();
      if (backdrop.classList.contains("attendance-category-backdrop")) closeAttendanceCategories();
    });
  });
  document.querySelectorAll("[data-modal-window]").forEach((modal) => {
    modal.addEventListener("click", (event) => event.stopPropagation());
  });
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action));
  });
  bindEvidenceNavigationEvents();
}

function hourProfileWithMetadata(profile) {
  const now = new Date().toISOString();
  return {
    ...createHourProfile(profile.name, profile),
    createdAt: profile.createdAt || now,
    updatedAt: now
  };
}

function hourSecurityFormValue(form, name) {
  return String(new FormData(form).get(name) || "").trim();
}

function setHourSecurityError(message) {
  state.hourSecurity.error = message;
  render();
}

async function setupHourSecurity(form) {
  const pin = hourSecurityFormValue(form, "pin");
  const pinConfirmation = hourSecurityFormValue(form, "pinConfirmation");

  if (!validateHourPin(pin)) {
    setHourSecurityError("PIN mora vsebovati natanko šest številk.");
    return;
  }
  if (pin !== pinConfirmation) {
    setHourSecurityError("Vnesena PIN-a se ne ujemata.");
    return;
  }

  setBusy(true);
  try {
    const { config, dataKey } = await createHourSecurity({ pin });
    const profiles = state.hourProfiles.map((profile) =>
      hourProfileWithMetadata(profile)
    );
    const records = await encryptHourProfiles(profiles, dataKey);
    await saveHourSecurityBundle(config, records);
    state.hourProfiles = profiles;
    state.hourSecurity = {
      ...state.hourSecurity,
      status: "unlocked",
      screen: "unlock",
      config,
      profileRecords: records,
      activeKey: dataKey,
      error: "",
      failedAttempts: 0,
      lockoutUntil: 0
    };
    clearDirty();
    render();
    showToast("Poročila ur so zaščitena in odklenjena.");
  } catch (error) {
    console.error(error);
    setHourSecurityError(error.message || "Zaščite ni bilo mogoče nastaviti.");
  } finally {
    setBusy(false);
  }
}

async function disableHourSecurity() {
  setBusy(true);
  try {
    const config = createUnprotectedHourSecurity();
    const profiles = state.hourProfiles.map((profile) =>
      hourProfileWithMetadata(profile)
    );
    await saveHourSecurityBundle(config, profiles);
    state.hourProfiles = profiles;
    state.hourSecurity = {
      ...state.hourSecurity,
      status: "unprotected",
      screen: "unprotected",
      config,
      profileRecords: profiles,
      activeKey: null,
      error: "",
      failedAttempts: 0,
      lockoutUntil: 0
    };
    clearDirty();
    render();
    showToast("Poročila ur so v tem brskalniku dostopna brez PIN-a.");
  } catch (error) {
    console.error(error);
    setHourSecurityError("Nastavitve dostopa ni bilo mogoče shraniti.");
  } finally {
    setBusy(false);
  }
}

function enableHourSecuritySetup() {
  state.hourSecurity = {
    ...state.hourSecurity,
    status: "unconfigured",
    screen: "setup",
    config: null,
    profileRecords: [],
    activeKey: null,
    error: "",
    failedAttempts: 0,
    lockoutUntil: 0
  };
  render();
}

async function unlockHourReports(form) {
  if (state.hourSecurity.lockoutUntil > Date.now()) {
    setHourSecurityError("Počakaj do izteka varnostnega premora.");
    return;
  }
  const pin = hourSecurityFormValue(form, "pin");
  if (!validateHourPin(pin)) {
    setHourSecurityError("Vnesi šestmestni PIN.");
    return;
  }

  setBusy(true);
  try {
    const dataKey = await unlockHourDataKey(
      state.hourSecurity.config,
      pin
    );
    const profiles = await decryptHourProfiles(
      state.hourSecurity.profileRecords,
      dataKey
    );
    const config =
      state.hourSecurity.config.recoveryWrap ||
      state.hourSecurity.config.recoveryQuestion
        ? await replaceHourPin(state.hourSecurity.config, dataKey, pin)
        : state.hourSecurity.config;
    if (config !== state.hourSecurity.config) {
      await saveHourSecurityBundle(config, state.hourSecurity.profileRecords);
    }
    state.hourProfiles = profiles.map((profile) =>
      createHourProfile(profile.name, profile)
    );
    state.hourSecurity = {
      ...state.hourSecurity,
      status: "unlocked",
      screen: "unlock",
      config,
      activeKey: dataKey,
      error: "",
      failedAttempts: 0,
      lockoutUntil: 0
    };
    render();
    showToast("Poročila ur so odklenjena.");
  } catch (error) {
    const failedAttempts = state.hourSecurity.failedAttempts + 1;
    if (failedAttempts >= 5) {
      state.hourSecurity.failedAttempts = 0;
      state.hourSecurity.lockoutUntil = Date.now() + 30_000;
      state.hourSecurity.error =
        "Preveč napačnih poskusov. Poskusi znova čez 30 sekund.";
    } else {
      state.hourSecurity.failedAttempts = failedAttempts;
      state.hourSecurity.error = `${error.message || "PIN ni pravilen."} Preostali poskusi: ${
        5 - failedAttempts
      }.`;
    }
    render();
  } finally {
    setBusy(false);
  }
}

async function changeHourPin(form) {
  const currentPin = hourSecurityFormValue(form, "currentPin");
  const pin = hourSecurityFormValue(form, "pin");
  const confirmation = hourSecurityFormValue(form, "pinConfirmation");
  if (!validateHourPin(currentPin)) {
    setHourSecurityError("Vnesi trenutni šestmestni PIN.");
    return;
  }
  if (!validateHourPin(pin)) {
    setHourSecurityError("PIN mora vsebovati natanko šest številk.");
    return;
  }
  if (pin !== confirmation) {
    setHourSecurityError("Vnesena PIN-a se ne ujemata.");
    return;
  }

  setBusy(true);
  try {
    const dataKey = await unlockHourDataKey(
      state.hourSecurity.config,
      currentPin
    );
    await decryptHourProfiles(state.hourSecurity.profileRecords, dataKey);
    const config = await replaceHourPin(
      state.hourSecurity.config,
      dataKey,
      pin
    );
    await saveHourSecurityBundle(config, state.hourSecurity.profileRecords);
    state.hourSecurity = {
      ...state.hourSecurity,
      status: "unlocked",
      screen: "unlock",
      config,
      activeKey: dataKey,
      error: "",
      failedAttempts: 0,
      lockoutUntil: 0
    };
    render();
    showToast("Novi PIN je nastavljen. Poročila ur so odklenjena.");
  } catch (error) {
    console.error(error);
    setHourSecurityError(error.message || "PIN-a ni bilo mogoče spremeniti.");
  } finally {
    setBusy(false);
  }
}

async function resetHourSecurity(form) {
  if (hourSecurityFormValue(form, "confirmation") !== "IZBRIŠI") {
    setHourSecurityError('Za potrditev napiši "IZBRIŠI".');
    return;
  }
  setBusy(true);
  try {
    await clearHourSecurityData(HOUR_SECURITY_ASSET_ID);
    state.hourProfiles = [];
    state.hourBatch = null;
    state.selectedHourReportId = "";
    state.hourSecurity = {
      status: "unconfigured",
      screen: "setup",
      config: null,
      profileRecords: [],
      activeKey: null,
      error: "",
      failedAttempts: 0,
      lockoutUntil: 0
    };
    clearDirty();
    render();
    showToast("Zaščita in profili Poročil ur so ponastavljeni.");
  } catch (error) {
    console.error(error);
    setHourSecurityError("Ponastavitve ni bilo mogoče dokončati.");
  } finally {
    setBusy(false);
  }
}

function setHourSecurityScreen(screen) {
  state.hourSecurity.screen = screen;
  state.hourSecurity.error = "";
  render();
}

async function saveHourProfiles({ silent = false } = {}) {
  if (!ensureHourReportsUnlocked()) return false;
  const reports = state.hourBatch?.reports || [];
  if (!reports.length) {
    if (!silent) showToast("Po uvozu XLSX lahko shraniš profile urnih postavk.");
    return false;
  }

  const profilesById = new Map(
    state.hourProfiles.map((profile) => [profile.id, profile])
  );
  reports.forEach((report) => {
    profilesById.set(report.profile.id, hourProfileWithMetadata(report.profile));
  });
  state.hourProfiles = [...profilesById.values()];
  const records = state.hourSecurity.status === "unprotected"
    ? state.hourProfiles
    : await encryptHourProfiles(state.hourProfiles, state.hourSecurity.activeKey);
  await saveHourSecurityBundle(state.hourSecurity.config, records);
  state.hourSecurity.profileRecords = records;
  reports.forEach((report) => {
    const saved = profilesById.get(report.profile.id);
    if (saved) report.profile = { ...saved };
  });
  clearDirty();
  render();
  if (!silent) showToast("Profili urnih postavk in bonusi so shranjeni.");
  return true;
}

async function resetHourReports({ skipUnsavedGuard = false } = {}) {
  if (!ensureHourReportsUnlocked()) return;
  if (state.dirty && !skipUnsavedGuard) {
    requestUnsavedChanges({ type: "new" });
    return;
  }
  state.hourBatch = null;
  state.selectedHourReportId = "";
  state.toolsPanelOpen = false;
  clearDirty();
  render();
}

async function handleHourReportFile(file) {
  if (!ensureHourReportsUnlocked()) return;
  if (state.dirty) {
    pendingHourReportFile = file;
    requestUnsavedChanges({ type: "import-hours-file" });
    return;
  }
  if (!/\.xlsx$/i.test(file.name)) {
    showToast("Izberi Connecteam datoteko v formatu XLSX.");
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    showToast("Datoteka XLSX je prevelika. Največja dovoljena velikost je 20 MB.");
    return;
  }

  setBusy(true);
  try {
    const batch = parseConnecteamWorkbook(
      await file.arrayBuffer(),
      file.name,
      state.hourProfiles
    );
    state.hourBatch = batch;
    state.selectedHourReportId = batch.reports[0]?.id || "";
    state.toolsPanelOpen = false;
    markDirty();
    render();
    const rejected = batch.rejectedRows.length
      ? ` ${batch.rejectedRows.length} neveljavnih vrstic je bilo izpuščenih.`
      : "";
    showToast(
      `Uvoženih je ${batch.reports.length} mesečnih poročil za ${new Set(
        batch.reports.map((report) => report.personName)
      ).size} osebe.${rejected}`
    );
  } catch (error) {
    console.error(error);
    showToast(error.message || "Excel datoteke ni bilo mogoče uvoziti.");
  } finally {
    setBusy(false);
  }
}

function updateHourProfileField(fieldName, value) {
  const selected = selectedHourReport();
  if (!selected) return;
  const profile = {
    ...selected.profile,
    [fieldName]:
      fieldName === "bonusHours"
        ? normalizeHours(value)
        : normalizeRateCents(value)
  };
  state.hourBatch.reports = state.hourBatch.reports.map((report) =>
    report.profile.id === selected.profile.id
      ? updateReportProfile(report, profile)
      : report
  );
  markDirty();
}

function updateHourRow(rowId, fieldName, value) {
  const report = selectedHourReport();
  const index = report?.rows.findIndex((item) => item.id === rowId) ?? -1;
  if (!report || index < 0) return;
  report.rows[index] = updateHourReportRow(report.rows[index], fieldName, value, report.profile);
  markDirty();
}

function resetSelectedHourRow(rowId) {
  const report = selectedHourReport();
  const index = report?.rows.findIndex((row) => row.id === rowId) ?? -1;
  if (!report || index < 0) return;
  report.rows[index] = resetHourRow(report.rows[index]);
  markDirty();
  render();
}

function requestHourRowDelete(rowId) {
  const report = selectedHourReport();
  const row = report?.rows.find((item) => item.id === rowId);
  if (!report || !row) return;
  state.hourRowDeleteConfirm = {
    reportId: report.id,
    rowId
  };
  render();
}

function cancelHourRowDelete() {
  if (!state.hourRowDeleteConfirm) return;
  state.hourRowDeleteConfirm = null;
  render();
}

function confirmHourRowDelete() {
  const pending = state.hourRowDeleteConfirm;
  if (!pending || !state.hourBatch) return;
  const report = state.hourBatch.reports.find((item) => item.id === pending.reportId);
  const rowExists = report?.rows.some((row) => row.id === pending.rowId);
  if (!report || !rowExists) {
    state.hourRowDeleteConfirm = null;
    render();
    return;
  }

  state.hourBatch.reports = state.hourBatch.reports.map((item) =>
    item.id === pending.reportId ? removeHourReportRow(item, pending.rowId) : item
  );
  state.hourRowDeleteConfirm = null;
  markDirty();
  render();
  showToast("Vrstica je odstranjena iz poročila.");
}

function includedHourReports() {
  return (state.hourBatch?.reports || []).filter((report) => report.included);
}

function validateHourReports(reports) {
  for (const report of reports) {
    const errors = validateHourReport(report);
    if (errors.length) {
      state.selectedHourReportId = report.id;
      render();
      showToast(errors[0]);
      return false;
    }
  }
  return true;
}

function hourBatchFileStem() {
  const reports = includedHourReports();
  if (!reports.length) return "porocila_ur";
  const months = [...new Set(reports.map((report) => report.monthKey))].sort();
  const period =
    months.length === 1 ? months[0] : `${months[0]}_${months[months.length - 1]}`;
  return safeFileName(`porocila_ur_${period}`);
}

async function downloadSelectedHourReport(mode = "download") {
  if (!ensureHourReportsUnlocked()) return;
  const report = selectedHourReport();
  if (!report) {
    showToast("Najprej uvozi Connecteam datoteko XLSX.");
    return;
  }
  if (!validateHourReports([report])) return;
  setBusy(true);
  try {
    const blob = await createHourReportPdfBlob(report, state.signatureAsset);
    const fileName = hourReportFileName(report);
    if (mode === "print") {
      const url = URL.createObjectURL(blob);
      const printWindow = window.open(url, "_blank");
      if (!printWindow) {
        downloadBlob(blob, fileName);
        showToast("Brskalnik je blokiral tiskanje, zato sem prenesel poročilo PDF.");
      } else {
        printWindow.addEventListener("load", () => printWindow.print(), { once: true });
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        showToast("Poročilo je pripravljeno za tiskanje.");
      }
    } else {
      downloadBlob(blob, fileName);
      showToast("Poročilo PDF je pripravljeno.");
    }
  } finally {
    setBusy(false);
  }
}

async function downloadAllHourReports() {
  if (!ensureHourReportsUnlocked()) return;
  const reports = includedHourReports();
  if (!reports.length) {
    showToast("Za skupni izvoz izberi vsaj eno osebo.");
    return;
  }
  if (!validateHourReports(reports)) return;
  setBusy(true);
  try {
    downloadBlob(
      await createHourReportsPdfBlob(reports, state.signatureAsset),
      `${hourBatchFileStem()}.pdf`
    );
    showToast(`Združeni PDF vsebuje ${reports.length} poročil.`);
  } finally {
    setBusy(false);
  }
}

async function downloadHourReportsZip() {
  if (!ensureHourReportsUnlocked()) return;
  const reports = includedHourReports();
  if (!reports.length) {
    showToast("Za ZIP izvoz izberi vsaj eno osebo.");
    return;
  }
  if (!window.JSZip) {
    showToast("Knjižnica za ZIP ni naložena.");
    return;
  }
  if (!validateHourReports(reports)) return;
  setBusy(true);
  try {
    const zip = new window.JSZip();
    for (const report of reports) {
      zip.file(hourReportFileName(report), await createHourReportPdfBlob(report, state.signatureAsset));
    }
    downloadBlob(
      await zip.generateAsync({ type: "blob" }),
      `${hourBatchFileStem()}.zip`
    );
    showToast(`ZIP vsebuje ${reports.length} ločenih poročil.`);
  } finally {
    setBusy(false);
  }
}

function bindHourReportDropzone() {
  const dropzone = document.querySelector("[data-hour-import-dropzone]");
  if (!dropzone) return;
  const setDragging = (event, dragging) => {
    event.preventDefault();
    event.stopPropagation();
    dropzone.classList.toggle("is-dragging", dragging);
  };
  dropzone.addEventListener("dragenter", (event) => setDragging(event, true));
  dropzone.addEventListener("dragover", (event) => setDragging(event, true));
  dropzone.addEventListener("dragleave", (event) => setDragging(event, false));
  dropzone.addEventListener("drop", async (event) => {
    setDragging(event, false);
    const [file] = event.dataTransfer?.files || [];
    if (file) await handleHourReportFile(file);
  });
}

function bindHourReportEvents() {
  document
    .querySelector("[data-hour-security-setup]")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      void setupHourSecurity(event.currentTarget);
    });
  document
    .querySelector("[data-hour-security-unlock]")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      void unlockHourReports(event.currentTarget);
    });
  document
    .querySelector("[data-hour-security-change-pin]")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      void changeHourPin(event.currentTarget);
    });
  document
    .querySelector("[data-hour-security-reset]")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      void resetHourSecurity(event.currentTarget);
    });
  document.querySelectorAll("[data-hour-security-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.hourSecurityAction;
      if (action === "disable-pin") {
        void disableHourSecurity();
        return;
      }
      if (action === "enable-pin") {
        enableHourSecuritySetup();
        return;
      }
      setHourSecurityScreen(action);
    });
  });
  document.querySelectorAll("[data-modal-window]").forEach((modal) => {
    modal.addEventListener("click", (event) => event.stopPropagation());
  });

  if (!hourReportsUnlocked()) {
    bindEvidenceNavigationEvents();
    window.setTimeout(() => {
      document.querySelector("[data-hour-security-autofocus]")?.focus();
    }, 0);
    return;
  }

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action));
  });
  document.getElementById("hourReportInput")?.addEventListener("change", async (event) => {
    const [file] = event.currentTarget.files || [];
    event.currentTarget.value = "";
    if (file) await handleHourReportFile(file);
  });
  document.getElementById("signatureInput")?.addEventListener("change", handleSignatureSelected);
  bindHourReportDropzone();

  document.querySelectorAll("[data-select-hour-report]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedHourReportId = button.dataset.selectHourReport;
      render();
    });
  });
  document.querySelectorAll("[data-hour-report-included]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const report = state.hourBatch?.reports.find(
        (item) => item.id === checkbox.dataset.hourReportIncluded
      );
      if (!report) return;
      report.included = checkbox.checked;
      markDirty();
      render();
    });
  });
  document.querySelectorAll("[data-hour-profile-field]").forEach((input) => {
    input.addEventListener("change", () => {
      updateHourProfileField(input.dataset.hourProfileField, input.value);
      render();
    });
  });
  document.querySelectorAll("[data-hour-row]").forEach((rowElement) => {
    rowElement.querySelectorAll("[data-hour-row-field]").forEach((input) => {
      input.addEventListener("change", () => {
        updateHourRow(
          rowElement.dataset.hourRow,
          input.dataset.hourRowField,
          input.value
        );
        render();
      });
    });
  });
  document.querySelectorAll("[data-reset-hour-row]").forEach((button) => {
    button.addEventListener("click", () => resetSelectedHourRow(button.dataset.resetHourRow));
  });
  document.querySelectorAll("[data-delete-hour-row]").forEach((button) => {
    button.addEventListener("click", () => requestHourRowDelete(button.dataset.deleteHourRow));
  });
  bindSignatureEvents();
  bindEvidenceNavigationEvents();
}

function bindEvidenceNavigationEvents() {
  document.querySelectorAll("[data-evidence-target]").forEach((button) => {
    button.addEventListener("click", () => {
      void selectEvidence(button.dataset.evidenceTarget);
    });
  });

  document.querySelectorAll("[data-evidence-tab]").forEach((tab) => {
    tab.addEventListener("keydown", handleEvidenceTabKeydown);
  });

  document.querySelector("[data-evidence-menu-toggle]")?.addEventListener("click", () => {
    state.evidenceMenuOpen = !state.evidenceMenuOpen;
    render();
    if (state.evidenceMenuOpen) {
      window.setTimeout(() => {
        document.querySelector(".evidence-menu-option.is-active")?.focus();
      }, 0);
    }
  });
}

function handleEvidenceTabKeydown(event) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = [...document.querySelectorAll(".evidence-tabs-desktop [data-evidence-tab]")];
  if (!tabs.length) return;

  event.preventDefault();
  const currentIndex = Math.max(0, tabs.indexOf(event.currentTarget));
  let nextIndex = currentIndex;
  if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = tabs.length - 1;
  tabs[nextIndex]?.focus();
}

async function selectEvidence(target) {
  if (!EVIDENCE_TABS.some((tab) => tab.type === target)) return;
  state.evidenceMenuOpen = false;
  if (target === state.documentType) {
    render();
    return;
  }
  await switchDocumentType({ target });
}

function bindSignatureEvents() {
  document.querySelector("[data-signature-size]")?.addEventListener("input", (event) => {
    const placement = currentSignaturePlacement();
    updateCurrentSignaturePlacement(
      { ...placement, width: Number(event.currentTarget.value) },
      { rerender: false }
    );
    const signatureObject = document.querySelector("[data-signature-object]");
    if (signatureObject) {
      const nextPlacement = currentSignaturePlacement();
      signatureObject.style.left = `${nextPlacement.x}%`;
      signatureObject.style.width = `${nextPlacement.width}%`;
    }
  });

  const zone = document.querySelector("[data-signature-zone]");
  const signatureObject = zone?.querySelector("[data-signature-object]");
  if (!(zone instanceof HTMLElement) || !(signatureObject instanceof HTMLElement)) return;

  signatureObject.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const resizing = event.target instanceof Element && event.target.closest("[data-signature-resize]");
    const zoneRect = zone.getBoundingClientRect();
    const objectRect = signatureObject.getBoundingClientRect();
    const startPlacement = currentSignaturePlacement();
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    signatureObject.setPointerCapture(pointerId);
    signatureObject.classList.add("is-adjusting");

    const handleMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      if (resizing) {
        const deltaPercent = ((moveEvent.clientX - startX) / zoneRect.width) * 100;
        const width = Math.min(100 - startPlacement.x, Math.max(25, startPlacement.width + deltaPercent));
        updateCurrentSignaturePlacement(
          { ...startPlacement, width },
          { rerender: false }
        );
        const placement = currentSignaturePlacement();
        signatureObject.style.left = `${placement.x}%`;
        signatureObject.style.width = `${placement.width}%`;
        return;
      }

      const maxLeft = Math.max(0, zoneRect.width - objectRect.width);
      const maxTop = Math.max(0, zoneRect.height - objectRect.height);
      const left = Math.min(maxLeft, Math.max(0, objectRect.left - zoneRect.left + moveEvent.clientX - startX));
      const top = Math.min(maxTop, Math.max(0, objectRect.top - zoneRect.top + moveEvent.clientY - startY));
      const x = zoneRect.width ? (left / zoneRect.width) * 100 : 0;
      const y = zoneRect.height ? (top / zoneRect.height) * 100 : 0;
      updateCurrentSignaturePlacement(
        { ...startPlacement, x, y },
        { rerender: false }
      );
      const placement = currentSignaturePlacement();
      signatureObject.style.left = `${placement.x}%`;
      signatureObject.style.top = `${placement.y}%`;
    };

    const handleEnd = (endEvent) => {
      if (endEvent.pointerId !== pointerId) return;
      signatureObject.classList.remove("is-adjusting");
      signatureObject.removeEventListener("pointermove", handleMove);
      signatureObject.removeEventListener("pointerup", handleEnd);
      signatureObject.removeEventListener("pointercancel", handleEnd);
    };

    signatureObject.addEventListener("pointermove", handleMove);
    signatureObject.addEventListener("pointerup", handleEnd);
    signatureObject.addEventListener("pointercancel", handleEnd);
  });
}

function handleMaterialRowInput(event) {
  const field = event.currentTarget;
  const row = state.currentMaterialIssue.items.find(
    (item) => item.id === field.dataset.materialItemId
  );
  if (!row) return;

  const name = field.dataset.materialItemField;
  row[name] = name === "tariffCents" ? normalizeMaterialTariff(field.value) : field.value;
  clearMaterialValidationField(`items.${row.id}.${name}`);
  markDirty();

  const amount = document.querySelector(`[data-material-row-amount="${CSS.escape(row.id)}"]`);
  if (amount) amount.textContent = formatCurrency(materialRowAmountCents(row));
  const total = document.querySelector("[data-material-total]");
  if (total) total.textContent = formatCurrency(materialIssueTotalCents(state.currentMaterialIssue));
}

function addMaterialRow() {
  if (state.currentMaterialIssue.items.length >= 8) {
    showToast("Na eno izdajnico lahko dodaš največ 8 vrstic.");
    return;
  }
  state.currentMaterialIssue.items.push(createBlankMaterialRow());
  markDirty();
  render();
  window.requestAnimationFrame(() => {
    document
      .querySelector("tr:last-child [data-material-item-field='name']")
      ?.focus();
  });
}

function removeMaterialRow(rowId) {
  if (state.currentMaterialIssue.items.length <= 1) return;
  state.currentMaterialIssue.items = state.currentMaterialIssue.items.filter(
    (row) => row.id !== rowId
  );
  Object.keys(state.materialValidation.fields || {})
    .filter((field) => field.startsWith(`items.${rowId}.`))
    .forEach(clearMaterialValidationField);
  markDirty();
  render();
}

function bindOfferDropzone() {
  const dropzone = document.querySelector("[data-offer-dropzone]");
  if (!dropzone) return;

  const markDragging = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (state.busy) return;
    dropzone.classList.add("is-dragging");
  };

  const clearDragging = (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropzone.classList.remove("is-dragging");
  };

  dropzone.addEventListener("dragenter", markDragging);
  dropzone.addEventListener("dragover", markDragging);
  dropzone.addEventListener("dragleave", (event) => {
    if (event.relatedTarget && dropzone.contains(event.relatedTarget)) return;
    clearDragging(event);
  });
  dropzone.addEventListener("drop", async (event) => {
    clearDragging(event);
    if (state.busy) return;

    const files = event.dataTransfer?.files;
    const file = files?.[0];
    if (!file) return;
    if (files.length > 1) {
      showToast("Pripni eno datoteko naenkrat.");
    }

    try {
      await attachOfferFile(file);
    } catch (error) {
      console.error(error);
      showToast(error.message || "Pri pripenjanju datoteke je prišlo do napake.");
    }
  });
}

function bindOnboardingEvents() {
  const form = document.querySelector("[data-onboarding-welcome-form]");
  const labInput = document.querySelector("[data-onboarding-lab-name]");

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    startOnboardingTour();
  });

  labInput?.addEventListener("input", (event) => {
    const labName = event.currentTarget.value;
    const labCode = deriveLabCodeFromName(labName);
    state.onboarding.labName = labName;
    state.onboarding.labCodePreview = labCode;
    document.querySelector("[data-onboarding-code-preview]")?.replaceChildren(document.createTextNode(labCode));
  });

  if (state.onboarding.active && state.onboarding.stage === "welcome") {
    window.setTimeout(() => labInput?.focus(), 0);
  }

  document.querySelectorAll("[data-onboarding-action]").forEach((button) => {
    button.addEventListener("click", () => handleOnboardingAction(button.dataset.onboardingAction));
  });
}

function handleOnboardingAction(action) {
  stopOnboardingCalculatorDemo({ restore: true });

  if (action === "confirm-storage") {
    showInstallShortcutStep();
    return;
  }

  if (action === "finish-onboarding") {
    finishOnboarding();
    return;
  }

  if (action === "skip") {
    if (state.onboarding.stage === "welcome") assignRandomLabCode();
    showStorageWarningStep();
    return;
  }

  if (action === "finish") {
    showStorageWarningStep();
    return;
  }

  if (action === "back") {
    state.onboarding.step = Math.max(0, state.onboarding.step - 1);
    render();
    return;
  }

  if (action === "next") {
    state.onboarding.step += 1;
    if (state.onboarding.step >= ONBOARDING_STEPS.length) {
      showStorageWarningStep();
    } else {
      render();
    }
  }
}

function handleKeyboardShortcut(event) {
  if (event.defaultPrevented || event.repeat || event.isComposing) return;
  if (event.key === "Escape" && state.dataSafety.open) {
    event.preventDefault();
    state.dataSafety.open = false;
    state.dataSafety.pendingRestoreFile = null;
    state.dataSafety.error = "";
    render();
    return;
  }
  if (
    event.key === "Escape" &&
    state.documentType === "hourReports" &&
    state.hourSecurity.status !== "reset-required" &&
    ["change-pin", "reset-confirm", "reset-final"].includes(state.hourSecurity.screen)
  ) {
    event.preventDefault();
    state.hourSecurity.screen = state.hourSecurity.config ? "unlock" : "setup";
    state.hourSecurity.error = "";
    render();
    return;
  }
  if (event.key === "Escape" && state.evidenceMenuOpen) {
    event.preventDefault();
    state.evidenceMenuOpen = false;
    render();
    window.setTimeout(() => document.querySelector("[data-evidence-menu-toggle]")?.focus(), 0);
    return;
  }
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;

  const action = KEYBOARD_SHORTCUTS[event.key.toLowerCase()];
  if (!action) return;

  event.preventDefault();
  event.stopPropagation();

  if (state.busy || state.onboarding.active || state.historyModalOpen || state.deleteConfirmId) return;
  void handleAction(action);
}

function handleToolbarTooltipFirstShow(event) {
  if (toolbarTooltipDelayArmed) return;
  if (!event.target.closest?.(".toolbar-button[data-tooltip]")) return;

  toolbarTooltipDelayArmed = true;
  window.setTimeout(() => {
    document.documentElement.classList.add("toolbar-tooltip-delay-enabled");
  }, 180);
}

function randomLabCode() {
  const alphabet = "ABCDEFGHJKLMNPRSTUVZ";
  const values = crypto.getRandomValues(new Uint8Array(3));
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

function assignRandomLabCode() {
  const labCode = normalizeLabCode(randomLabCode());
  state.current.labCode = labCode;
  state.onboarding.labCodePreview = labCode;
  markDirty();
}

function showStorageWarningStep() {
  stopOnboardingCalculatorDemo({ restore: true });
  state.onboarding = {
    ...state.onboarding,
    active: true,
    stage: "storage-warning"
  };
  render();
}

function showInstallShortcutStep() {
  state.onboarding = {
    ...state.onboarding,
    active: true,
    stage: "install-shortcut"
  };
  render();
}

function startOnboardingTour() {
  stopOnboardingCalculatorDemo({ restore: true });
  const labName = String(document.querySelector("[data-onboarding-lab-name]")?.value || state.onboarding.labName).trim();
  const labCode = deriveLabCodeFromName(labName);
  state.current.labCode = labCode;
  state.onboarding = {
    active: true,
    stage: "tour",
    step: 0,
    labName,
    labCodePreview: labCode
  };
  markDirty();
  render();
}

function onboardingCompleted() {
  try {
    return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "done";
  } catch {
    return false;
  }
}

function markOnboardingCompleted() {
  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "done");
  } catch {
    // Local storage can be unavailable in strict/private browser modes.
  }
}

function finishOnboarding() {
  stopOnboardingCalculatorDemo({ restore: true });
  markOnboardingCompleted();
  document.querySelectorAll(".onboarding-target").forEach((element) => element.classList.remove("onboarding-target"));
  state.onboarding = {
    active: false,
    stage: "",
    step: 0,
    labName: "",
    labCodePreview: DEFAULTS.labCode
  };
  maybeOpenReleaseNotes();
  render();
}

function openOnboardingIfNeeded() {
  if (onboardingCompleted()) return;
  state.onboarding = {
    active: true,
    stage: "welcome",
    step: 0,
    labName: "",
    labCodePreview: deriveLabCodeFromName("")
  };
}

function isOnboardingCalculatorDemoStep() {
  if (!state.onboarding.active || state.onboarding.stage !== "tour") return false;
  return ONBOARDING_STEPS[state.onboarding.step]?.demo === "calculator";
}

function applyOnboardingCalculatorDemoText(text) {
  state.current.explanation = text;
  const calculated = extractEuroTotalCents(text);
  state.current.estimatedValueCents = calculated;

  const textarea = document.querySelector(".explanation-notes");
  if (textarea) {
    textarea.dataset.onboardingDemoActive = "true";
    textarea.value = text;
  }

  const valueInput = document.getElementById("estimatedValue");
  if (valueInput) valueInput.value = centsToInputValue(calculated);
}

function startOnboardingCalculatorDemo() {
  if (onboardingCalculatorSnapshot || onboardingDemoTimer) return;

  onboardingCalculatorSnapshot = {
    explanation: state.current.explanation,
    estimatedValueCents: state.current.estimatedValueCents
  };

  let index = 0;
  const typeNext = () => {
    if (!isOnboardingCalculatorDemoStep()) {
      stopOnboardingCalculatorDemo({ restore: true });
      return;
    }

    applyOnboardingCalculatorDemoText(ONBOARDING_CALCULATOR_DEMO_TEXT.slice(0, index));
    index += 1;

    if (index <= ONBOARDING_CALCULATOR_DEMO_TEXT.length) {
      const delay = ONBOARDING_CALCULATOR_DEMO_TEXT[index - 1] === "\n" ? 260 : 34;
      onboardingDemoTimer = window.setTimeout(typeNext, delay);
      return;
    }

    onboardingDemoTimer = 0;
  };

  typeNext();
}

function stopOnboardingCalculatorDemo({ restore = true } = {}) {
  window.clearTimeout(onboardingDemoTimer);
  onboardingDemoTimer = 0;

  const textarea = document.querySelector(".explanation-notes");
  if (textarea) delete textarea.dataset.onboardingDemoActive;

  if (restore && onboardingCalculatorSnapshot) {
    state.current.explanation = onboardingCalculatorSnapshot.explanation;
    state.current.estimatedValueCents = onboardingCalculatorSnapshot.estimatedValueCents;

    if (textarea) textarea.value = state.current.explanation;
    const valueInput = document.getElementById("estimatedValue");
    if (valueInput) valueInput.value = centsToInputValue(state.current.estimatedValueCents);
  }

  onboardingCalculatorSnapshot = null;
}

function syncOnboardingCalculatorDemo() {
  if (isOnboardingCalculatorDemoStep()) {
    startOnboardingCalculatorDemo();
    return;
  }

  stopOnboardingCalculatorDemo({ restore: true });
}

function positionOnboardingTooltip(options = {}) {
  const reveal = options?.reveal === true;
  if (onboardingPositionFrame) window.cancelAnimationFrame(onboardingPositionFrame);

  onboardingPositionFrame = window.requestAnimationFrame(() => {
    onboardingPositionFrame = 0;
    document.querySelectorAll(".onboarding-target").forEach((element) => element.classList.remove("onboarding-target"));
    if (!state.onboarding.active || state.onboarding.stage !== "tour") return;

    const step = ONBOARDING_STEPS[state.onboarding.step];
    if (!step) return;
    const target = document.querySelector(step.target);
    const tooltip = document.querySelector("[data-onboarding-tooltip]");
    const spotlight = document.querySelector("[data-onboarding-spotlight]");
    if (!target || !tooltip || !spotlight) return;

    if (reveal) target.scrollIntoView({ block: "center", inline: "nearest" });
    const rect = target.getBoundingClientRect();
    target.classList.add("onboarding-target");

    const padding = 8;
    spotlight.style.left = `${Math.max(8, rect.left - padding)}px`;
    spotlight.style.top = `${Math.max(8, rect.top - padding)}px`;
    spotlight.style.width = `${Math.min(window.innerWidth - 16, rect.width + padding * 2)}px`;
    spotlight.style.height = `${Math.min(window.innerHeight - 16, rect.height + padding * 2)}px`;

    const tooltipWidth = Math.min(340, window.innerWidth - 24);
    tooltip.style.width = `${tooltipWidth}px`;
    const tooltipHeight = tooltip.offsetHeight || 220;
    const gap = 14;
    const rightSide = rect.right + gap;
    const leftSide = rect.left - tooltipWidth - gap;
    let left = rightSide;

    if (rightSide + tooltipWidth > window.innerWidth - 12 && leftSide >= 12) {
      left = leftSide;
    } else if (rightSide + tooltipWidth > window.innerWidth - 12) {
      left = Math.max(12, Math.min(window.innerWidth - tooltipWidth - 12, rect.left));
    }

    let top = rect.top + rect.height / 2 - tooltipHeight / 2;
    if (window.innerWidth < 760 || rect.height > window.innerHeight * 0.42) {
      top = rect.bottom + gap;
      if (top + tooltipHeight > window.innerHeight - 12) top = rect.top - tooltipHeight - gap;
    }

    tooltip.style.left = `${Math.round(Math.max(12, Math.min(window.innerWidth - tooltipWidth - 12, left)))}px`;
    tooltip.style.top = `${Math.round(Math.max(12, Math.min(window.innerHeight - tooltipHeight - 12, top)))}px`;
  });
}

function closeSuggestionsOnOutsideClick(event) {
  if (state.evidenceMenuOpen && !event.target.closest(".evidence-tabs-compact")) {
    state.evidenceMenuOpen = false;
    render();
  }
  if (!event.target.closest(".document-popover") && !event.target.closest("[data-load-id]")) {
    closeDocumentPopover();
  }
  if (!event.target.closest(".status-menu") && !event.target.closest("[data-status-menu-id]")) {
    closeStatusMenu();
  }
  if (!event.target.closest(".status-menu") && !event.target.closest("[data-material-status-menu-id]")) {
    closeMaterialStatusMenu();
  }
  if (event.target.closest(".smart-field")) return;
  document.querySelectorAll(".suggestion-popover").forEach((popover) => popover.remove());
}

function showSuggestions(input) {
  const field = input.dataset.smartField;
  const wrapper = input.closest(".smart-field");
  if (!wrapper || !field) return;

  wrapper.querySelector(".suggestion-popover")?.remove();
  const suggestions =
    field === "company"
      ? companyDirectorySuggestions(input.value)
      : uniqueSuggestions(state.proposals, field, input.value);
  if (!suggestions.length) return;

  const popover = document.createElement("div");
  popover.className = "suggestion-popover";
  popover.setAttribute("role", "listbox");
  suggestions.forEach((suggestion) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-button";
    button.textContent = suggestion;
    button.addEventListener("click", () => {
      input.value = suggestion;
      state.current[field] = suggestion;
      markDirty();
      popover.remove();
      input.focus();
    });
    popover.append(button);
  });
  wrapper.append(popover);
}

async function handleSignatureSelected(event) {
  const [file] = event.currentTarget.files || [];
  event.currentTarget.value = "";
  if (!file) return;

  try {
    const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const hasPngHeader =
      header.length === 8 &&
      header[0] === 0x89 &&
      header[1] === 0x50 &&
      header[2] === 0x4e &&
      header[3] === 0x47 &&
      header[4] === 0x0d &&
      header[5] === 0x0a &&
      header[6] === 0x1a &&
      header[7] === 0x0a;
    const hasJpegHeader =
      header.length >= 3 &&
      header[0] === 0xff &&
      header[1] === 0xd8 &&
      header[2] === 0xff;

    if (!hasPngHeader && !hasJpegHeader) {
      showToast("Podpis mora biti fotografija PNG ali JPG.");
      return;
    }

    if (file.size > MAX_SIGNATURE_FILE_SIZE) {
      showToast("Slika podpisa je prevelika. Največja dovoljena velikost je 2 MB.");
      return;
    }

    const normalizedBlob = await prepareSignatureImage(file);
    const asset = {
      id: SIGNATURE_ASSET_ID,
      fileName: `${file.name.replace(/\.[^.]+$/, "") || "podpis"}.png`,
      mimeType: "image/png",
      size: normalizedBlob.size,
      blob: normalizedBlob,
      updatedAt: new Date().toISOString()
    };

    await saveAsset(asset);
    setSignatureAsset(asset);
    render();
    showToast("Podpis je shranjen. Zdaj ga lahko vstaviš v izbrani dokument.");
  } catch (error) {
    console.error(error);
    showToast("Podpisa ni bilo mogoče shraniti.");
  }
}

async function prepareSignatureImage(file) {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Slike podpisa ni bilo mogoče prebrati."));
      element.src = sourceUrl;
    });

    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);

    const pixels = context.getImageData(0, 0, width, height);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const red = pixels.data[index];
        const green = pixels.data[index + 1];
        const blue = pixels.data[index + 2];
        const alpha = pixels.data[index + 3];
        const isInk = alpha > 18 && Math.min(red, green, blue) < 238;
        if (isInk) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
        if (red > 242 && green > 242 && blue > 242) {
          pixels.data[index + 3] = 0;
        }
      }
    }

    if (maxX < minX || maxY < minY) {
      throw new Error("Na sliki podpisa ni bilo mogoče zaznati.");
    }

    context.putImageData(pixels, 0, 0);
    const padding = Math.max(4, Math.round(Math.min(width, height) * 0.02));
    const sourceX = Math.max(0, minX - padding);
    const sourceY = Math.max(0, minY - padding);
    const sourceWidth = Math.min(width - sourceX, maxX - minX + 1 + padding * 2);
    const sourceHeight = Math.min(height - sourceY, maxY - minY + 1 + padding * 2);
    const output = document.createElement("canvas");
    output.width = sourceWidth;
    output.height = sourceHeight;
    output
      .getContext("2d")
      .drawImage(canvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);

    const blob = await new Promise((resolve) => output.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Podpisa ni bilo mogoče pripraviti.");
    return blob;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function removeSignature() {
  if (!state.signatureAsset) return;
  await deleteAsset(SIGNATURE_ASSET_ID);
  setSignatureAsset(null);
  currentSignatureDocument().signaturePlacement = normalizeSignaturePlacement();
  markDirty();
  render();
  showToast("Shranjeni podpis je odstranjen.");
}

function addAttendanceParticipant() {
  state.currentAttendanceSheet.participants.push(createAttendanceParticipant());
  clearAttendanceValidationField("participants");
  markDirty();
  render();
  window.setTimeout(() => {
    const participant = state.currentAttendanceSheet.participants.at(-1);
    document
      .querySelector(`[data-attendance-participant-id="${CSS.escape(participant.id)}"][data-attendance-participant-field="firstName"]`)
      ?.focus();
  }, 0);
}

function removeAttendanceParticipant(participantId) {
  state.currentAttendanceSheet.participants = state.currentAttendanceSheet.participants.filter(
    (participant) => participant.id !== participantId
  );
  Object.keys(state.attendanceValidation.fields || {})
    .filter((field) => field.startsWith(`participants.${participantId}.`))
    .forEach(clearAttendanceValidationField);
  updateAttendanceDuplicateFlags();
  markDirty();
  render();
}

async function handleAttendanceCsvFile(file) {
  if (state.dirty) {
    pendingAttendanceFile = file;
    requestUnsavedChanges({ type: "import-attendance-file" });
    return;
  }
  if (!/\.csv$/i.test(file.name) && !["text/csv", "text/plain", "application/vnd.ms-excel"].includes(file.type)) {
    showToast("Izberi datoteko CSV, izvoženo iz Wagtaila.");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast("CSV datoteka je prevelika. Največja dovoljena velikost je 5 MB.");
    return;
  }

  try {
    const groups = parseWagtailAttendanceCsv(await file.text(), file.name);
    const defaults = attendanceDefaultMetadata();
    state.attendanceImport = {
      fileName: file.name,
      groups: groups.map((group) => ({
        ...group,
        categoryId: defaults.categoryId,
        mentorName: defaults.mentorName,
        labName: defaults.labName,
        location: defaults.location
      })),
      defaults,
      error: "",
      fieldErrors: {}
    };
    render();
  } catch (error) {
    console.error(error);
    showToast(error.message || "CSV datoteke ni bilo mogoče uvoziti.");
  }
}

function updateAttendanceImportField(event) {
  if (!state.attendanceImport) return;
  const index = Number(event.currentTarget.dataset.attendanceImportIndex);
  const group = state.attendanceImport.groups[index];
  if (!group) return;
  group[event.currentTarget.dataset.attendanceImportField] = event.currentTarget.value;
  state.attendanceImport.error = "";
  delete state.attendanceImport.fieldErrors?.[
    `${index}.${event.currentTarget.dataset.attendanceImportField}`
  ];
}

async function handleAttendanceImportAction(action) {
  if (action === "cancel") {
    state.attendanceImport = null;
    render();
    return;
  }
  if (action !== "confirm" || !state.attendanceImport) return;

  const sheets = state.attendanceImport.groups.map((group) =>
    attendanceSheetFromImportGroup(group, state.attendanceImport.defaults)
  );
  const invalidIndex = sheets.findIndex((sheet) => !validateAttendanceSheet(sheet).valid);
  if (invalidIndex >= 0) {
    const validation = validateAttendanceSheet(sheets[invalidIndex]);
    state.attendanceImport.fieldErrors = Object.fromEntries(
      Object.entries(validation.fields)
        .filter(([field]) => !field.startsWith("participants."))
        .map(([field, message]) => [`${invalidIndex}.${field}`, message])
    );
    const hasParticipantErrors = Object.keys(validation.fields).some((field) =>
      field.startsWith("participants.")
    );
    state.attendanceImport.error = hasParticipantErrors
      ? `List ${invalidIndex + 1}: preverite podatke udeležencev v datoteki CSV.`
      : `List ${invalidIndex + 1}: dopolnite označena obvezna polja.`;
    render();
    const field = validation.firstInvalidField.split(".")[0];
    window.setTimeout(() => {
      document
        .querySelector(`[data-attendance-import-index="${invalidIndex}"][data-attendance-import-field="${CSS.escape(field)}"]`)
        ?.focus();
    }, 0);
    return;
  }

  const savedSheets = sheets.map(attendanceSheetWithSaveMetadata);
  await persistAttendanceSheets(savedSheets);
  state.attendanceSheets = sortRecent(await getAllAttendanceSheets());
  state.currentAttendanceSheet = {
    ...savedSheets[0],
    participants: savedSheets[0].participants.map((participant) => ({ ...participant }))
  };
  state.attendanceImport = null;
  clearAttendanceValidation();
  clearDirty();
  render();
  showToast(
    savedSheets.length === 1
      ? `Uvožen je podpisni list z ${savedSheets[0].participants.length} udeleženci.`
      : `Ustvarjenih je ${savedSheets.length} podpisnih listov.`
  );
}

async function persistAttendanceCategories() {
  state.attendanceCategories = normalizeAttendanceCategories(state.attendanceCategories);
  await saveAsset({
    id: ATTENDANCE_CATEGORY_ASSET_ID,
    categories: state.attendanceCategories,
    updatedAt: new Date().toISOString()
  });
}

async function deleteCustomAttendanceCategory(categoryId) {
  const category = state.attendanceCategories.find((item) => item.id === categoryId);
  if (!category || category.builtIn) return;
  state.attendanceCategories = state.attendanceCategories.filter((item) => item.id !== categoryId);
  if (state.currentAttendanceSheet.categoryId === categoryId) {
    state.currentAttendanceSheet.categoryId =
      state.attendanceCategories.find((item) => !item.hidden)?.id || DEFAULT_ATTENDANCE_CATEGORIES[0].id;
    markDirty();
  }
  await persistAttendanceCategories();
  render();
}

function openAttendanceArchive() {
  state.attendanceArchiveOpen = true;
  state.attendanceArchiveTab = "search";
  render();
}

function closeAttendanceArchive() {
  state.attendanceArchiveOpen = false;
  state.attendanceSearchQuery = "";
  render();
}

function openAttendanceCategories() {
  state.attendanceCategoryModalOpen = true;
  render();
}

function closeAttendanceCategories() {
  state.attendanceCategoryModalOpen = false;
  render();
}

function requestDeleteAttendanceSheet(id) {
  if (!id) return;
  if (state.dirty && state.currentAttendanceSheet.id === id) {
    requestUnsavedChanges({ type: "delete-attendance", sheetId: id });
    return;
  }
  state.attendanceDeleteConfirmId = id;
  render();
}

async function confirmDeleteAttendanceSheet() {
  const id = state.attendanceDeleteConfirmId;
  if (!id) return;
  await deleteAttendanceSheet(id);
  state.attendanceSheets = sortRecent(await getAllAttendanceSheets());
  if (state.currentAttendanceSheet.id === id) {
    state.currentAttendanceSheet = createBlankAttendanceSheet(
      state.attendanceSheets[0],
      currentAttendanceProfile()
    );
    clearDirty();
  }
  state.attendanceDeleteConfirmId = "";
  state.attendanceArchiveOpen = false;
  render();
  showToast("Podpisni list je izbrisan.");
}

async function newAttendanceSheet({ skipUnsavedGuard = false } = {}) {
  if (state.dirty && !skipUnsavedGuard) {
    requestUnsavedChanges({ type: "new" });
    return;
  }
  state.currentAttendanceSheet = createBlankAttendanceSheet(
    sortRecent(state.attendanceSheets)[0],
    currentAttendanceProfile()
  );
  state.toolsPanelOpen = false;
  clearAttendanceValidation();
  clearDirty();
  render();
}

async function saveCurrentAttendanceSheet({ silent = false } = {}) {
  const validation = validateCurrentAttendanceSheet();
  if (!validation.valid) return null;
  const saved = attendanceSheetWithSaveMetadata(state.currentAttendanceSheet);
  await persistAttendanceSheet(saved);
  state.currentAttendanceSheet = saved;
  state.attendanceSheets = sortRecent(await getAllAttendanceSheets());
  clearAttendanceValidation();
  clearDirty();
  render();
  if (!silent) showToast("Podpisni list je shranjen.");
  return saved;
}

async function loadAttendanceSheet(id, { skipUnsavedGuard = false } = {}) {
  if (state.dirty && !skipUnsavedGuard) {
    requestUnsavedChanges({ type: "load-attendance", sheetId: id });
    return;
  }
  const sheet = state.attendanceSheets.find((item) => item.id === id);
  if (!sheet) return;
  state.currentAttendanceSheet = {
    ...sheet,
    participants: (sheet.participants || []).map((participant) => ({ ...participant }))
  };
  state.attendanceArchiveOpen = false;
  state.attendanceSearchQuery = "";
  state.toolsPanelOpen = false;
  clearAttendanceValidation();
  clearDirty();
  render();
}

async function exportAttendanceSheetPdf(mode, { allowIncomplete = false } = {}) {
  const validation = validateAttendanceSheet(state.currentAttendanceSheet);
  state.attendanceValidation = validation;
  if (!validation.valid && !allowIncomplete) {
    state.attendanceExportPrompt = {
      mode,
      missingCount: Object.keys(validation.fields || {}).length
    };
    render();
    return;
  }

  setBusy(true);
  try {
    let documentForExport;
    if (validation.valid) {
      documentForExport = await saveCurrentAttendanceSheet({ silent: true });
      if (!documentForExport) return;
    } else {
      documentForExport = attendanceSheetWithSaveMetadata(state.currentAttendanceSheet);
    }

    const pdfBlob = await createAttendanceSheetPdfBlob(documentForExport, state.attendanceCategories);
    const fileName = `${safeFileName(
      `podpisni-list-${documentForExport.programName || "brez-naziva"}-${documentForExport.eventDate || "brez-datuma"}`
    )}.pdf`;
    if (mode === "print") {
      const url = URL.createObjectURL(pdfBlob);
      const printWindow = window.open(url, "_blank");
      if (!printWindow) {
        downloadBlob(pdfBlob, fileName);
        showToast("Brskalnik je blokiral tiskanje, zato sem prenesel podpisni list PDF.");
      } else {
        printWindow.addEventListener("load", () => printWindow.print(), { once: true });
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        showToast("Podpisni list je pripravljen za tiskanje.");
      }
    } else {
      downloadBlob(pdfBlob, fileName);
      showToast("Podpisni list PDF je pripravljen za prenos.");
    }
  } finally {
    setBusy(false);
  }
}

function cancelAttendanceExport() {
  if (!state.attendanceExportPrompt) return;
  state.attendanceExportPrompt = null;
  render();
  focusAttendanceValidationTarget(state.attendanceValidation);
}

async function confirmAttendanceExport() {
  const mode = state.attendanceExportPrompt?.mode;
  if (!mode) return;
  state.attendanceExportPrompt = null;
  render();
  await exportAttendanceSheetPdf(mode, { allowIncomplete: true });
}

async function handleAction(action, event) {
  try {
    if (isOnboardingCalculatorDemoStep()) {
      stopOnboardingCalculatorDemo({ restore: true });
    }

    if (
      state.documentType === "hourReports" &&
      [
        "new",
        "save",
        "import-hours",
        "download",
        "print",
        "download-all-hours",
        "download-hours-zip"
      ].includes(action) &&
      !ensureHourReportsUnlocked()
    ) {
      return;
    }

    if (action === "open-data-safety") {
      state.dataSafety.open = true;
      state.dataSafety.screen = "overview";
      state.dataSafety.error = "";
      render();
    } else if (action === "close-data-safety") {
      state.dataSafety.open = false;
      state.dataSafety.pendingRestoreFile = null;
      state.dataSafety.error = "";
      render();
    } else if (action === "show-backup-setup") {
      state.dataSafety.screen = "setup";
      state.dataSafety.error = "";
      render();
    } else if (action === "show-backup-overview") {
      state.dataSafety.screen = "overview";
      state.dataSafety.pendingRestoreFile = null;
      state.dataSafety.error = "";
      render();
    } else if (action === "create-backup-now") {
      await performBackup();
    } else if (action === "choose-backup-restore") {
      document.querySelector("[data-backup-restore-input]")?.click();
    } else if (action === "dismiss-update") {
      state.update.dismissed = true;
      render();
    } else if (action === "install-update") {
      await installAppUpdate();
    } else if (action === "close-release-notes") {
      closeReleaseNotes();
    } else if (action === "toggle-panel") {
      event?.preventDefault();
      event?.stopPropagation();
      toggleSidebarPanel(event?.currentTarget?.dataset.panelToggleId);
    } else if (action === "new") {
      if (state.documentType === "materialIssue") {
        await newMaterialIssue();
      } else if (state.documentType === "attendance") {
        await newAttendanceSheet();
      } else if (state.documentType === "hourReports") {
        await resetHourReports();
      } else {
        await newDocument();
      }
    } else if (action === "save") {
      if (state.documentType === "materialIssue") {
        await saveCurrentMaterialIssue();
      } else if (state.documentType === "attendance") {
        await saveCurrentAttendanceSheet();
      } else if (state.documentType === "hourReports") {
        await saveHourProfiles();
      } else {
        await saveCurrentDocument();
      }
    } else if (action === "attach") {
      document.getElementById("offerInput")?.click();
    } else if (action === "import-attendance") {
      if (state.dirty) {
        requestUnsavedChanges({ type: "import-attendance" });
      } else {
        document.getElementById("attendanceCsvInput")?.click();
      }
    } else if (action === "import-hours") {
      if (state.dirty) {
        requestUnsavedChanges({ type: "import-hours" });
      } else {
        document.getElementById("hourReportInput")?.click();
      }
    } else if (action === "upload-signature") {
      document.getElementById("signatureInput")?.click();
    } else if (action === "insert-signature") {
      if (!state.signatureAsset) {
        document.getElementById("signatureInput")?.click();
      } else {
        updateCurrentSignaturePlacement({
          inserted: true,
          x: 5,
          y: 4,
          width: 90
        });
        showToast("Podpis je vstavljen v trenutni dokument.");
      }
    } else if (action === "remove-inserted-signature") {
      updateCurrentSignaturePlacement({
        ...currentSignaturePlacement(),
        inserted: false
      });
      showToast("Podpis je odstranjen iz trenutnega dokumenta.");
    } else if (action === "remove-signature") {
      await removeSignature();
    } else if (action === "remove-attachment") {
      await removeAttachment();
    } else if (action === "edit-company") {
      state.companyDirectory.editingId = event?.currentTarget?.dataset.companyId || "";
      state.companyDirectory.error = "";
      render();
    } else if (action === "cancel-company-edit") {
      state.companyDirectory.editingId = "";
      state.companyDirectory.error = "";
      render();
    } else if (action === "delete-company") {
      await deleteCompanyDirectoryEntry(event?.currentTarget?.dataset.companyId);
    } else if (action === "download") {
      if (state.documentType === "materialIssue") {
        await exportMaterialIssuePdf("download");
      } else if (state.documentType === "attendance") {
        await exportAttendanceSheetPdf("download");
      } else if (state.documentType === "hourReports") {
        await downloadSelectedHourReport("download");
      } else {
        await exportPdf("download");
      }
    } else if (action === "print") {
      if (state.documentType === "materialIssue") {
        await exportMaterialIssuePdf("print");
      } else if (state.documentType === "attendance") {
        await exportAttendanceSheetPdf("print");
      } else if (state.documentType === "hourReports") {
        await downloadSelectedHourReport("print");
      } else {
        await exportPdf("print");
      }
    } else if (action === "download-all-hours") {
      await downloadAllHourReports();
    } else if (action === "download-hours-zip") {
      await downloadHourReportsZip();
    } else if (action === "add-material-row") {
      addMaterialRow();
    } else if (action === "add-attendance-participant") {
      addAttendanceParticipant();
    } else if (action === "open-history") {
      openHistoryModal();
    } else if (action === "close-history") {
      closeHistoryModal();
    } else if (action === "close-proposal-preview") {
      await closeProposalPreview();
    } else if (action === "edit-proposal-preview") {
      await editProposalPreview();
    } else if (action === "save-proposal-preview") {
      await saveProposalPreview();
    } else if (action === "finish-proposal-preview-edit") {
      await finishProposalPreviewEdit();
    } else if (action === "download-preview-proposal") {
      await downloadProposalPreviewPdf();
    } else if (action === "print-preview-proposal") {
      await printProposalPreviewPdf();
    } else if (action === "duplicate-proposal-preview") {
      await duplicateProposalPreview();
    } else if (action === "delete-proposal-preview") {
      deleteProposalPreview();
    } else if (action === "zoom-proposal-preview-in") {
      updateProposalPreviewZoom(0.08);
    } else if (action === "zoom-proposal-preview-out") {
      updateProposalPreviewZoom(-0.08);
    } else if (action === "fit-proposal-preview") {
      state.proposalPreviewZoom = 0.82;
      render();
    } else if (action === "choose-preview-attachment") {
      document.getElementById("offerInput")?.click();
    } else if (action === "remove-preview-attachment") {
      await removeAttachment();
    } else if (action === "toggle-tools") {
      toggleToolsPanel();
    } else if (action === "close-tools") {
      closeToolsPanel();
    } else if (action === "open-attendance-archive") {
      openAttendanceArchive();
    } else if (action === "close-attendance-archive") {
      closeAttendanceArchive();
    } else if (action === "open-attendance-categories") {
      openAttendanceCategories();
    } else if (action === "close-attendance-categories") {
      closeAttendanceCategories();
    } else if (action === "cancel-delete-attendance") {
      state.attendanceDeleteConfirmId = "";
      render();
    } else if (action === "confirm-delete-attendance") {
      await confirmDeleteAttendanceSheet();
    } else if (action === "cancel-attendance-export") {
      cancelAttendanceExport();
    } else if (action === "confirm-attendance-export") {
      await confirmAttendanceExport();
    } else if (action === "cancel-delete") {
      closeDeleteConfirm();
    } else if (action === "confirm-delete") {
      await confirmDeleteProposal();
    } else if (action === "cancel-hour-row-delete") {
      cancelHourRowDelete();
    } else if (action === "confirm-hour-row-delete") {
      confirmHourRowDelete();
    } else if (action === "cancel-unsaved") {
      closeUnsavedPrompt();
    } else if (action === "confirm-unsaved") {
      await continueUnsavedAction();
    }
  } catch (error) {
    console.error(error);
    showToast(error.message || "Prišlo je do napake.");
  }
}

async function saveCompanyDirectoryEntry(form) {
  const formData = new FormData(form);
  const name = String(formData.get("name") || "").trim();
  const address = String(formData.get("address") || "").trim();
  const taxNumber = String(formData.get("taxNumber") || "").trim();

  if (!name || !address) {
    state.companyDirectory.error = "Ime podjetja in naslov sta obvezna.";
    render();
    window.requestAnimationFrame(() => document.querySelector("[data-company-directory-form] input[name='name']")?.focus());
    return;
  }

  const editingId = state.companyDirectory.editingId;
  const duplicate = state.companies.find(
    (company) =>
      company.id !== editingId &&
      company.name.toLocaleLowerCase("sl-SI") === name.toLocaleLowerCase("sl-SI")
  );
  if (duplicate) {
    state.companyDirectory.error = "Podjetje s tem imenom je že v imeniku.";
    render();
    return;
  }

  const now = new Date().toISOString();
  const existing = state.companies.find((company) => company.id === editingId);
  const nextCompany = {
    id: existing?.id || generateId(),
    name,
    address,
    taxNumber,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  const nextCompanies = normalizeCompanyDirectory([
    ...state.companies.filter((company) => company.id !== nextCompany.id),
    nextCompany
  ]);

  await saveAsset({
    id: COMPANY_DIRECTORY_ASSET_ID,
    type: "company-directory",
    version: 1,
    companies: nextCompanies,
    updatedAt: now
  });
  state.companies = nextCompanies;
  state.companyDirectory = { editingId: "", error: "" };
  render();
  showToast(existing ? "Podatki podjetja so posodobljeni." : "Podjetje je dodano v imenik.");
}

async function deleteCompanyDirectoryEntry(companyId) {
  const company = state.companies.find((item) => item.id === companyId);
  if (!company) return;
  if (!window.confirm(`Ali želiš odstraniti podjetje \"${company.name}\" iz imenika?`)) return;

  const companies = state.companies.filter((item) => item.id !== companyId);
  await saveAsset({
    id: COMPANY_DIRECTORY_ASSET_ID,
    type: "company-directory",
    version: 1,
    companies,
    updatedAt: new Date().toISOString()
  });
  state.companies = companies;
  state.companyDirectory = { editingId: "", error: "" };
  render();
  showToast("Podjetje je odstranjeno iz imenika.");
}

function toggleToolsPanel() {
  state.toolsPanelOpen = !state.toolsPanelOpen;
  render();
}

function closeToolsPanel() {
  if (!state.toolsPanelOpen) return;
  state.toolsPanelOpen = false;
  render();
}

function openHistoryModal() {
  if (state.historyModalOpen) return;
  state.historyModalOpen = true;
  render();
}

function closeHistoryModal() {
  if (!state.historyModalOpen) return;
  state.historyModalOpen = false;
  render();
}

async function openProposalPreview(proposalId) {
  if (!proposalId) return;
  const proposal = state.proposals.find((item) => item.id === proposalId);
  if (!proposal) return;
  clearDocumentPopoverTimers();
  state.documentPopover = null;
  state.statusMenu = null;
  state.materialStatusMenu = null;
  state.historyModalOpen = false;
  state.proposalPreviewId = proposalId;
  state.proposalPreviewMode = "view";
  setProposalPreviewAttachment(await getAttachment(proposal.offerAttachmentId));
  render();
}

async function closeProposalPreview({ skipUnsavedGuard = false } = {}) {
  if (!state.proposalPreviewId) return;
  if (state.proposalPreviewMode === "edit" && state.dirty && !skipUnsavedGuard) {
    requestUnsavedChanges({ type: "close-proposal-preview" });
    return;
  }
  const proposalId = state.proposalPreviewId;
  const proposal = state.proposals.find((item) => item.id === proposalId);
  if (state.proposalPreviewMode === "edit" && proposal && state.current.id === proposalId) {
    state.current = { ...proposal };
    state.attachment = await getAttachment(proposal.offerAttachmentId);
    state.persistedAttachmentId = proposal.offerAttachmentId || "";
    clearDirty();
    clearValidation();
  }
  state.proposalPreviewId = "";
  state.proposalPreviewMode = "view";
  setProposalPreviewAttachment(null);
  render();
}

async function editProposalPreview({ skipUnsavedGuard = false, proposalId = state.proposalPreviewId } = {}) {
  if (!proposalId) return;
  if (state.dirty && !skipUnsavedGuard && state.current.id !== proposalId) {
    requestUnsavedChanges({ type: "edit-proposal-preview", proposalId });
    return;
  }
  const proposal = state.proposals.find((item) => item.id === proposalId);
  if (!proposal) return;
  state.current = { ...proposal };
  state.attachment = await getAttachment(proposal.offerAttachmentId);
  state.persistedAttachmentId = proposal.offerAttachmentId || "";
  state.proposalPreviewId = proposalId;
  state.proposalPreviewMode = "edit";
  setProposalPreviewAttachment(state.attachment);
  clearDirty();
  clearValidation();
  render();
}

async function finishProposalPreviewEdit({ skipUnsavedGuard = false } = {}) {
  const proposalId = state.proposalPreviewId;
  if (!proposalId) return;
  if (state.proposalPreviewMode === "edit" && state.dirty && !skipUnsavedGuard) {
    requestUnsavedChanges({ type: "finish-proposal-preview-edit" });
    return;
  }

  const proposal = state.proposals.find((item) => item.id === proposalId);
  if (!proposal) return;
  if (state.current.id === proposalId) {
    state.current = { ...proposal };
    state.attachment = await getAttachment(proposal.offerAttachmentId);
    state.persistedAttachmentId = proposal.offerAttachmentId || "";
    clearDirty();
    clearValidation();
  }
  state.proposalPreviewMode = "view";
  setProposalPreviewAttachment(await getAttachment(proposal.offerAttachmentId));
  render();
}

async function saveProposalPreview() {
  const saved = await saveCurrentDocument({ silent: true });
  if (!saved) return;
  state.proposalPreviewId = saved.id;
  state.proposalPreviewMode = "view";
  setProposalPreviewAttachment(await getAttachment(saved.offerAttachmentId));
  render();
  showToast(`Dokument ${saved.serial} je shranjen.`);
}

function updateProposalPreviewZoom(delta) {
  state.proposalPreviewZoom = clamp(Number(state.proposalPreviewZoom || 0.82) + delta, 0.58, 1.16);
  render();
}

function isMatchingAttachment(attachment, proposal) {
  return Boolean(
    attachment?.blob &&
    proposal?.offerAttachmentId &&
    attachment.id === proposal.offerAttachmentId
  );
}

async function getProposalAttachmentForPdf(proposal) {
  if (!proposal?.offerAttachmentId) return null;

  const inMemoryAttachment = [state.attachment, state.proposalPreviewAttachment].find((attachment) =>
    isMatchingAttachment(attachment, proposal)
  );
  if (inMemoryAttachment) return inMemoryAttachment;

  const storedAttachment = await getAttachment(proposal.offerAttachmentId);
  if (storedAttachment?.blob) return storedAttachment;

  throw new Error("Pripete ponudbe ni mogoče prebrati. Poskusi dokument najprej shraniti in nato ponovno natisniti.");
}

async function createProposalExportBlob(proposal) {
  const attachment = await getProposalAttachmentForPdf(proposal);
  return createCombinedPdfBlob(proposal, attachment, state.signatureAsset);
}

async function downloadProposalPreviewPdf() {
  const proposal = state.proposals.find((item) => item.id === state.proposalPreviewId);
  if (!proposal) return;

  setBusy(true);
  try {
    const pdfBlob = await createProposalExportBlob(proposal);
    downloadBlob(pdfBlob, `${safeFileName(`predlog-${proposal.serial || proposal.id}`)}.pdf`);
    showToast("Dokument PDF je pripravljen za prenos.");
  } finally {
    setBusy(false);
  }
}

async function printProposalPreviewPdf() {
  const proposal = state.proposals.find((item) => item.id === state.proposalPreviewId);
  if (!proposal) return;

  setBusy(true);
  try {
    const pdfBlob = await createProposalExportBlob(proposal);
    const fileName = `${safeFileName(`predlog-${proposal.serial || proposal.id}`)}.pdf`;
    const url = URL.createObjectURL(pdfBlob);
    const printWindow = window.open(url, "_blank");
    if (!printWindow) {
      downloadBlob(pdfBlob, fileName);
      showToast("Brskalnik je blokiral tiskanje, zato sem prenesel dokument PDF.");
    } else {
      printWindow.addEventListener("load", () => printWindow.print(), { once: true });
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      showToast("Dokument PDF je pripravljen za tiskanje.");
    }
  } finally {
    setBusy(false);
  }
}

async function duplicateProposalPreview() {
  const proposal = state.proposals.find((item) => item.id === state.proposalPreviewId);
  if (!proposal) return;

  const proposals = await getAllProposals();
  const duplicate = proposalWithChangeLog(
    proposalWithSaveMetadata(
      {
        ...proposal,
        id: "",
        serial: "",
        createdAt: "",
        updatedAt: "",
        offerAttachmentId: "",
        documentStatus: "",
        changeLog: []
      },
      proposals
    ),
    null
  );

  await saveProposal(duplicate);
  state.proposals = sortRecent(await getAllProposals());
  state.current = { ...duplicate };
  state.attachment = null;
  state.persistedAttachmentId = "";
  state.proposalPreviewId = duplicate.id;
  state.proposalPreviewMode = "edit";
  setProposalPreviewAttachment(null);
  clearDirty();
  clearValidation();
  render();
  showToast(`Ustvarjena je kopija ${duplicate.serial}.`);
}

function deleteProposalPreview() {
  const proposalId = state.proposalPreviewId;
  if (!proposalId) return;
  state.proposalPreviewId = "";
  state.proposalPreviewMode = "view";
  setProposalPreviewAttachment(null);
  openDeleteConfirm(proposalId, { skipUnsavedGuard: true });
}

function openDeleteConfirm(proposalId, { skipUnsavedGuard = false } = {}) {
  if (!proposalId) return;
  if (state.dirty && !skipUnsavedGuard && proposalId === state.current.id) {
    requestUnsavedChanges({ type: "delete", proposalId });
    return;
  }
  clearDocumentPopoverTimers();
  closeDocumentPopover();
  state.statusMenu = null;
  state.materialStatusMenu = null;
  state.deleteConfirmId = proposalId;
  render();
}

function closeDeleteConfirm() {
  if (!state.deleteConfirmId) return;
  state.deleteConfirmId = "";
  render();
}

function requestUnsavedChanges(action) {
  state.unsavedPrompt = action;
  render();
}

function closeUnsavedPrompt() {
  if (!state.unsavedPrompt) return;
  state.unsavedPrompt = null;
  render();
}

async function continueUnsavedAction() {
  const action = state.unsavedPrompt;
  if (!action) return;
  state.unsavedPrompt = null;
  render();

  if (action.type === "new") {
    if (state.documentType === "materialIssue") {
      await newMaterialIssue({ skipUnsavedGuard: true });
    } else if (state.documentType === "attendance") {
      await newAttendanceSheet({ skipUnsavedGuard: true });
    } else if (state.documentType === "hourReports") {
      await resetHourReports({ skipUnsavedGuard: true });
    } else {
      await newDocument({ skipUnsavedGuard: true });
    }
  } else if (action.type === "load") {
    await loadExistingDocument(action.proposalId, { skipUnsavedGuard: true });
  } else if (action.type === "edit-proposal-preview") {
    await editProposalPreview({ skipUnsavedGuard: true, proposalId: action.proposalId });
  } else if (action.type === "finish-proposal-preview-edit") {
    await finishProposalPreviewEdit({ skipUnsavedGuard: true });
  } else if (action.type === "close-proposal-preview") {
    await closeProposalPreview({ skipUnsavedGuard: true });
  } else if (action.type === "load-material-issue") {
    await loadMaterialIssue(action.issueId, { skipUnsavedGuard: true });
  } else if (action.type === "load-attendance") {
    await loadAttendanceSheet(action.sheetId, { skipUnsavedGuard: true });
  } else if (action.type === "delete-attendance") {
    state.attendanceDeleteConfirmId = action.sheetId;
    render();
  } else if (action.type === "import-attendance") {
    document.getElementById("attendanceCsvInput")?.click();
  } else if (action.type === "import-attendance-file") {
    const file = pendingAttendanceFile;
    pendingAttendanceFile = null;
    if (file) await handleAttendanceCsvFile(file);
  } else if (action.type === "import-hours") {
    clearDirty();
    render();
    document.getElementById("hourReportInput")?.click();
  } else if (action.type === "import-hours-file") {
    const file = pendingHourReportFile;
    pendingHourReportFile = null;
    clearDirty();
    if (file) await handleHourReportFile(file);
  } else if (action.type === "delete") {
    openDeleteConfirm(action.proposalId, { skipUnsavedGuard: true });
  } else if (action.type === "switch-document") {
    await switchDocumentType({ skipUnsavedGuard: true, target: action.target });
  }
}

async function confirmDeleteProposal() {
  const proposalId = state.deleteConfirmId;
  const proposal = state.proposals.find((item) => item.id === proposalId);
  if (!proposal) {
    closeDeleteConfirm();
    return;
  }

  await deleteProposalBundle(proposal);

  state.proposals = sortRecent(await getAllProposals());
  if (state.current.id === proposal.id) {
    state.current = createBlankProposal(state.proposals[0] || proposal);
    state.attachment = null;
    state.persistedAttachmentId = "";
    clearDirty();
  }
  state.deleteConfirmId = "";
  state.statusMenu = null;
  state.materialStatusMenu = null;
  closeDocumentPopover();
  render();
  showToast(`Predlog ${proposal.serial || ""} je izbrisan.`);
}

function openStatusMenu(proposalId, x, y) {
  if (!proposalId) return;
  state.materialStatusMenu = null;
  state.statusMenu = { proposalId, x, y };
  render();
}

function closeStatusMenu() {
  if (!state.statusMenu) return;
  state.statusMenu = null;
  render();
}

function openMaterialStatusMenu(issueId, x, y) {
  if (!issueId) return;
  state.statusMenu = null;
  state.materialStatusMenu = { issueId, x, y };
  render();
}

function closeMaterialStatusMenu() {
  if (!state.materialStatusMenu) return;
  state.materialStatusMenu = null;
  render();
}

function consumeSuppressedRecentClick(proposalId) {
  if (!proposalId || proposalId !== suppressedRecentClickId) return false;
  suppressedRecentClickId = "";
  return true;
}

function suppressRecentClick(proposalId) {
  suppressedRecentClickId = proposalId;
  window.setTimeout(() => {
    if (suppressedRecentClickId === proposalId) suppressedRecentClickId = "";
  }, 0);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pointerOutsideRect(x, y, rect, margin = 0) {
  return x < rect.left - margin || x > rect.right + margin || y < rect.top - margin || y > rect.bottom + margin;
}

function dragDeleteContainerFor(element) {
  return element.closest(".panel") || element.closest(".modal-window") || element.parentElement;
}

function deleteDragHint() {
  return document.querySelector("[data-delete-drag-hint]");
}

function updateDeleteDragHint(event, ready) {
  const hint = deleteDragHint();
  if (!hint) return;

  hint.textContent = ready ? "Spusti za brisanje" : "Povleci iz kartice";
  hint.classList.add("is-visible");
  hint.classList.toggle("is-ready", ready);
  hint.style.left = `${Math.round(clamp(event.clientX - 88, 12, window.innerWidth - 188))}px`;
  hint.style.top = `${Math.round(clamp(event.clientY + 14, 12, window.innerHeight - 48))}px`;
}

function hideDeleteDragHint() {
  const hint = deleteDragHint();
  if (!hint) return;
  hint.classList.remove("is-visible", "is-ready");
  hint.removeAttribute("style");
}

function startRecentDeleteDrag(event, element) {
  if (!event.isPrimary || event.button !== 0 || state.busy) return;
  if (event.target.closest("[data-status-menu-id]")) return;

  const container = dragDeleteContainerFor(element);
  if (!container) return;

  recentDeleteDrag = {
    element,
    proposalId: element.dataset.loadId,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    containerRect: container.getBoundingClientRect(),
    dragging: false,
    ready: false
  };
  element.setPointerCapture?.(event.pointerId);
}

function updateRecentDeleteDrag(event, element) {
  if (!recentDeleteDrag || recentDeleteDrag.pointerId !== event.pointerId || recentDeleteDrag.element !== element) return;

  const dx = event.clientX - recentDeleteDrag.startX;
  const dy = event.clientY - recentDeleteDrag.startY;
  const distance = Math.hypot(dx, dy);
  if (!recentDeleteDrag.dragging && distance < 10) return;
  if (!recentDeleteDrag.dragging && Math.abs(dx) < Math.abs(dy) * 1.2) {
    cancelRecentDeleteDrag();
    return;
  }

  if (!recentDeleteDrag.dragging) {
    recentDeleteDrag.dragging = true;
    clearDocumentPopoverTimers();
    state.documentPopover = null;
    state.statusMenu = null;
    document.querySelector(".document-popover")?.remove();
    document.querySelector(".status-menu")?.remove();
    element.classList.add("is-delete-dragging");
  }

  event.preventDefault();
  const limitedX = clamp(dx, -260, 260);
  const limitedY = clamp(dy, -90, 90);
  const ready =
    distance >= RECENT_DELETE_DRAG_DISTANCE &&
    pointerOutsideRect(event.clientX, event.clientY, recentDeleteDrag.containerRect, 14);

  recentDeleteDrag.ready = ready;
  element.classList.toggle("is-delete-ready", ready);
  element.style.transform = `translate(${Math.round(limitedX)}px, ${Math.round(limitedY)}px) rotate(${limitedX / 42}deg)`;
  element.style.opacity = ready ? "0.72" : "0.88";
  updateDeleteDragHint(event, ready);
}

function resetRecentDeleteDragElement() {
  if (!recentDeleteDrag?.element) return;
  recentDeleteDrag.element.classList.remove("is-delete-dragging", "is-delete-ready");
  recentDeleteDrag.element.style.removeProperty("transform");
  recentDeleteDrag.element.style.removeProperty("opacity");
}

function finishRecentDeleteDrag() {
  if (!recentDeleteDrag) return;

  const { proposalId, ready, dragging } = recentDeleteDrag;
  if (dragging && ready) suppressRecentClick(proposalId);
  resetRecentDeleteDragElement();
  hideDeleteDragHint();
  recentDeleteDrag = null;

  if (ready) openDeleteConfirm(proposalId);
}

function cancelRecentDeleteDrag() {
  if (!recentDeleteDrag) return;
  if (recentDeleteDrag.dragging) suppressRecentClick(recentDeleteDrag.proposalId);
  resetRecentDeleteDragElement();
  hideDeleteDragHint();
  recentDeleteDrag = null;
}

function clearDocumentPopoverTimers() {
  window.clearTimeout(touchPopoverTimer);
  window.clearTimeout(hoverPopoverTimer);
  touchPopoverTimer = 0;
  hoverPopoverTimer = 0;
}

function scheduleDocumentPopoverFromElement(element) {
  clearDocumentPopoverTimers();
  hoverPopoverTimer = window.setTimeout(() => {
    hoverPopoverTimer = 0;
    openDocumentPopoverFromElement(element);
  }, DOCUMENT_POPOVER_HOVER_DELAY_MS);
}

function openDocumentPopoverFromElement(element) {
  const proposalId = element?.dataset?.loadId;
  if (!proposalId) return;

  const rect = element.getBoundingClientRect();
  const popoverWidth = 236;
  const x = Math.min(window.innerWidth - popoverWidth - 12, Math.max(12, rect.left));
  const y = Math.min(window.innerHeight - 110, rect.bottom + 8);
  state.documentPopover = { proposalId, x, y };
  render();
}

function closeDocumentPopover() {
  clearDocumentPopoverTimers();
  if (!state.documentPopover) return;
  state.documentPopover = null;
  render();
}

async function updateDocumentStatus(proposalId, documentStatus) {
  const proposal = state.proposals.find((item) => item.id === proposalId);
  if (!proposal) return;

  const updated = proposalWithChangeLog(
    {
      ...proposal,
      documentStatus,
      updatedAt: new Date().toISOString()
    },
    proposal
  );

  await saveProposal(updated);
  state.proposals = sortRecent(await getAllProposals());
  if (state.current.id === proposalId) {
    state.current = { ...state.current, documentStatus };
  }
  state.statusMenu = null;
  state.materialStatusMenu = null;
  closeDocumentPopover();
  render();
}

async function switchDocumentType({ skipUnsavedGuard = false, target = "" } = {}) {
  const nextType = target || (state.documentType === "proposal" ? "materialIssue" : "proposal");
  if (nextType === state.documentType) return;

  if (state.dirty && !skipUnsavedGuard) {
    requestUnsavedChanges({ type: "switch-document", target: nextType });
    return;
  }

  if (
    state.documentType === "hourReports" &&
    state.dirty &&
    skipUnsavedGuard
  ) {
    state.hourBatch = null;
    state.selectedHourReportId = "";
  }

  if (nextType === "proposal") {
    const latestProposal = sortRecent(state.proposals)[0];
    if (latestProposal) {
      state.current = { ...latestProposal };
      state.attachment = await getAttachment(latestProposal.offerAttachmentId);
      state.persistedAttachmentId = latestProposal.offerAttachmentId || "";
    } else {
      state.current = createBlankProposal();
      state.attachment = null;
      state.persistedAttachmentId = "";
    }
  } else if (nextType === "materialIssue") {
    const latestIssue = sortRecent(state.materialIssues)[0];
    const latestProposal = sortRecent(state.proposals)[0];
    state.currentMaterialIssue = latestIssue
      ? {
          ...latestIssue,
          items: (latestIssue.items || []).map((row) => ({ ...row }))
        }
      : createBlankMaterialIssue(null, latestProposal);
  } else if (nextType === "attendance") {
    const latestSheet = sortRecent(state.attendanceSheets)[0];
    state.currentAttendanceSheet = latestSheet
      ? {
          ...latestSheet,
          participants: (latestSheet.participants || []).map((participant) => ({ ...participant }))
        }
      : createBlankAttendanceSheet(null, currentAttendanceProfile());
  }

  state.documentType = nextType;
  state.evidenceMenuOpen = false;
  state.toolsPanelOpen = false;
  state.historyModalOpen = false;
  state.proposalPreviewId = "";
  state.proposalPreviewMode = "view";
  setProposalPreviewAttachment(null);
  state.statusMenu = null;
  state.materialStatusMenu = null;
  state.documentPopover = null;
  clearDirty();
  clearValidation();
  clearMaterialValidation();
  clearAttendanceValidation();
  document.title = "Center Rog evidence";
  render();
}

function focusMaterialValidationTarget(validation) {
  const field = validation?.firstInvalidField;
  if (!field) return;

  let selector = `[data-material-field="${CSS.escape(field)}"]`;
  if (field.startsWith("items.")) {
    const [, rowId, itemField] = field.split(".");
    selector = `[data-material-item-id="${CSS.escape(rowId)}"][data-material-item-field="${CSS.escape(itemField)}"]`;
  }

  window.setTimeout(() => {
    const target = document.querySelector(selector);
    if (!(target instanceof HTMLElement)) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "center", inline: "nearest" });
  }, 60);
}

async function validateCurrentMaterialIssue() {
  const validation = validateMaterialIssue(state.currentMaterialIssue);
  state.materialValidation = validation;
  if (!validation.valid) {
    render();
    focusMaterialValidationTarget(validation);
  }
  return validation;
}

async function newMaterialIssue({ skipUnsavedGuard = false } = {}) {
  if (state.dirty && !skipUnsavedGuard) {
    requestUnsavedChanges({ type: "new" });
    return;
  }

  const lastIssue = sortRecent(state.materialIssues)[0];
  const lastProposal = sortRecent(state.proposals)[0] || state.current;
  state.currentMaterialIssue = createBlankMaterialIssue(lastIssue, lastProposal);
  state.materialStatusMenu = null;
  state.toolsPanelOpen = false;
  clearDirty();
  clearMaterialValidation();
  render();
}

async function saveCurrentMaterialIssue({
  silent = false,
  requireValid = false,
  status = ""
} = {}) {
  if (requireValid) {
    const validation = await validateCurrentMaterialIssue();
    if (!validation.valid) return null;
  } else {
    clearMaterialValidation();
  }

  const candidate = status
    ? { ...state.currentMaterialIssue, status }
    : state.currentMaterialIssue;
  const saved = materialIssueWithSaveMetadata(candidate, state.materialIssues);
  await persistMaterialIssue(saved);
  state.currentMaterialIssue = saved;
  state.materialIssues = sortRecent(await getAllMaterialIssues());
  clearDirty();
  render();
  if (!silent) {
    showToast(
      saved.status === "draft"
        ? `Osnutek ${saved.serial} je shranjen.`
        : `Izdajnica ${saved.serial} je shranjena.`
    );
  }
  return saved;
}

async function loadMaterialIssue(id, { skipUnsavedGuard = false } = {}) {
  if (state.dirty && !skipUnsavedGuard) {
    requestUnsavedChanges({ type: "load-material-issue", issueId: id });
    return;
  }

  const issue = state.materialIssues.find((item) => item.id === id);
  if (!issue) return;
  state.currentMaterialIssue = {
    ...issue,
    items: (issue.items || []).map((row) => ({ ...row }))
  };
  state.materialStatusMenu = null;
  state.toolsPanelOpen = false;
  clearDirty();
  clearMaterialValidation();
  render();
}

async function updateMaterialIssueStatus(nextStatus) {
  const issue = state.currentMaterialIssue;
  const currentStatus = issue.status || "draft";

  if (nextStatus === "paid" && !["printed", "paid", "collected"].includes(currentStatus)) {
    showToast("Izdajnico najprej natisnite.");
    render();
    return;
  }

  if (nextStatus === "collected" && !["paid", "collected"].includes(currentStatus)) {
    showToast("Material lahko označite kot prevzet šele po plačilu.");
    render();
    return;
  }

  const requiresValidation = nextStatus !== "draft";
  const saved = await saveCurrentMaterialIssue({
    silent: true,
    requireValid: requiresValidation,
    status: nextStatus
  });
  if (!saved) return;
  showToast(`Status: ${materialStatusLabel(nextStatus)}.`);
}

async function updateMaterialIssueStatusForIssue(issueId, nextStatus) {
  const issue = state.materialIssues.find((item) => item.id === issueId);
  if (!issue) return;

  const updated = materialIssueWithSaveMetadata(
    {
      ...issue,
      status: nextStatus || "draft"
    },
    state.materialIssues
  );

  await persistMaterialIssue(updated);
  state.materialIssues = sortRecent(await getAllMaterialIssues());
  if (state.currentMaterialIssue.id === issueId) {
    state.currentMaterialIssue = {
      ...updated,
      items: (updated.items || []).map((row) => ({ ...row }))
    };
  }
  state.materialStatusMenu = null;
  render();
  showToast(`Status izdajnice: ${materialStatusLabel(updated.status)}.`);
}

async function exportMaterialIssuePdf(mode) {
  setBusy(true);
  try {
    const status =
      mode === "print" && state.currentMaterialIssue.status === "draft"
        ? "printed"
        : state.currentMaterialIssue.status;
    const saved = await saveCurrentMaterialIssue({
      silent: true,
      requireValid: true,
      status
    });
    if (!saved) return;

    const pdfBlob = await createMaterialIssuePdfBlob(saved, state.signatureAsset);
    const fileName = `${safeFileName(`izdajnica-${saved.serial}`)}.pdf`;

    if (mode === "print") {
      const url = URL.createObjectURL(pdfBlob);
      const printWindow = window.open(url, "_blank");
      if (!printWindow) {
        downloadBlob(pdfBlob, fileName);
        showToast("Brskalnik je blokiral tiskanje, zato sem prenesel izdajnico PDF.");
      } else {
        printWindow.addEventListener("load", () => printWindow.print(), { once: true });
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        showToast("Izdajnica je pripravljena za tiskanje.");
      }
    } else {
      downloadBlob(pdfBlob, fileName);
      showToast("Izdajnica PDF je pripravljena za prenos.");
    }
  } finally {
    setBusy(false);
  }
}

async function newDocument({ skipUnsavedGuard = false } = {}) {
  if (state.dirty && !skipUnsavedGuard) {
    requestUnsavedChanges({ type: "new" });
    return;
  }
  const recent = sortRecent(state.proposals)[0] || state.current;
  state.current = createBlankProposal(recent);
  state.attachment = null;
  state.persistedAttachmentId = "";
  state.statusMenu = null;
  state.materialStatusMenu = null;
  state.documentPopover = null;
  state.proposalPreviewId = "";
  state.proposalPreviewMode = "view";
  setProposalPreviewAttachment(null);
  state.toolsPanelOpen = false;
  clearDirty();
  clearValidation();
  render();
}

async function saveCurrentDocument({ silent = false } = {}) {
  const validation = await validateCurrentDocument();
  if (!validation.valid) {
    setValidation(validation);
    prepareValidationFocus(validation);
    render();
    focusValidationTarget(validation);
    return null;
  }

  clearValidation();
  const proposals = await getAllProposals();
  const previousProposal = proposals.find((proposal) => proposal.id === state.current.id);
  const saved = proposalWithChangeLog(proposalWithSaveMetadata(state.current, proposals), previousProposal);
  const attachmentToSave =
    state.attachment && state.attachment.id !== state.persistedAttachmentId ? state.attachment : null;
  const deleteAttachmentIds =
    state.persistedAttachmentId && state.persistedAttachmentId !== saved.offerAttachmentId
      ? [state.persistedAttachmentId]
      : [];
  await saveProposalBundle(saved, {
    attachment: attachmentToSave,
    deleteAttachmentIds
  });
  state.current = saved;
  state.persistedAttachmentId = saved.offerAttachmentId || "";
  state.proposals = sortRecent(await getAllProposals());
  clearDirty();
  render();
  if (!silent) showToast(`Dokument ${saved.serial} je shranjen.`);
  return saved;
}

async function loadExistingDocument(id, { skipUnsavedGuard = false } = {}) {
  if (state.dirty && !skipUnsavedGuard) {
    requestUnsavedChanges({ type: "load", proposalId: id });
    return;
  }
  const proposal = state.proposals.find((item) => item.id === id);
  if (!proposal) return;
  state.current = { ...proposal };
  state.attachment = await getAttachment(proposal.offerAttachmentId);
  state.persistedAttachmentId = proposal.offerAttachmentId || "";
  state.historyModalOpen = false;
  state.proposalPreviewId = "";
  state.proposalPreviewMode = "view";
  setProposalPreviewAttachment(null);
  state.statusMenu = null;
  state.materialStatusMenu = null;
  state.toolsPanelOpen = false;
  clearDirty();
  clearValidation();
  render();
}

async function handleOfferSelected(event) {
  try {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await attachOfferFile(file);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Pri pripenjanju datoteke je prišlo do napake.");
  }
}

function getOfferKind(file) {
  const mimeType = String(file?.type || "").toLowerCase();
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";

  const name = String(file?.name || "").toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpe?g|webp|gif|bmp|tiff?|avif)$/i.test(name)) return "image";
  return "";
}

async function attachOfferFile(file) {
  const offerKind = getOfferKind(file);
  if (!offerKind) {
    throw new Error("Pripni datoteko PDF ali slikovno datoteko.");
  }

  if (!state.current.id) {
    state.current.id = generateId("proposal");
  }

  const attachment = {
    id: generateId("offer"),
    documentId: state.current.id,
    fileName: file.name,
    mimeType: file.type || (offerKind === "pdf" ? "application/pdf" : "image/unknown"),
    size: file.size,
    blob: file,
    createdAt: new Date().toISOString()
  };
  state.current.offerAttachmentId = attachment.id;
  state.attachment = attachment;
  if (state.proposalPreviewId && state.proposalPreviewMode === "edit") {
    setProposalPreviewAttachment(attachment);
  }
  markDirty();
  render();
  showToast(`Datoteka ${file.name} je pripeta.`);
}

async function removeAttachment() {
  if (!state.current.offerAttachmentId) return;
  state.current.offerAttachmentId = "";
  state.attachment = null;
  if (state.proposalPreviewId && state.proposalPreviewMode === "edit") {
    setProposalPreviewAttachment(null);
  }
  markDirty();
  render();
  showToast("Ponudba je odstranjena iz dokumenta.");
}

async function exportPdf(mode) {
  setBusy(true);
  try {
    const saved = await saveCurrentDocument({ silent: true });
    if (!saved) return;
    const pdfBlob = await createProposalExportBlob(saved);
    const fileName = `${safeFileName(`predlog-${saved.serial}`)}.pdf`;

    if (mode === "print") {
      const url = URL.createObjectURL(pdfBlob);
      const printWindow = window.open(url, "_blank");
      if (!printWindow) {
        downloadBlob(pdfBlob, fileName);
        showToast("Brskalnik je blokiral tiskanje, zato sem prenesel dokument PDF.");
      } else {
        printWindow.addEventListener("load", () => printWindow.print(), { once: true });
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        showToast("Dokument PDF je pripravljen za tiskanje.");
      }
    } else {
      downloadBlob(pdfBlob, fileName);
      showToast("Dokument PDF je pripravljen za prenos.");
    }
  } finally {
    setBusy(false);
  }
}

function isLocalPreview() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

async function clearLocalPreviewServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("predlog-nakupa-")).map((key) => caches.delete(key)));
    }
  } catch (error) {
    console.warn("Local preview service worker cleanup failed", error);
  }
}

async function init() {
  await deleteOrphanAttachments();
  const [
    proposals,
    materialIssues,
    attendanceSheets,
    hourProfiles,
    signatureAsset,
    attendanceCategoryAsset,
    hourSecurityAsset,
    backupConfig,
    companyDirectoryAsset
  ] = await Promise.all([
    getAllProposals(),
    getAllMaterialIssues(),
    getAllAttendanceSheets(),
    getAllHourProfiles(),
    getAsset(SIGNATURE_ASSET_ID),
    getAsset(ATTENDANCE_CATEGORY_ASSET_ID),
    getAsset(HOUR_SECURITY_ASSET_ID),
    getAsset(BACKUP_CONFIG_ASSET_ID),
    getAsset(COMPANY_DIRECTORY_ASSET_ID)
  ]);
  state.proposals = sortRecent(proposals);
  state.materialIssues = sortRecent(materialIssues);
  state.attendanceSheets = sortRecent(attendanceSheets);
  const encryptedHourProfiles = hourProfiles.filter(isEncryptedHourProfileRecord);
  if (isUnprotectedHourSecurity(hourSecurityAsset)) {
    state.hourProfiles = hourProfiles.map((profile) =>
      createHourProfile(profile.name, profile)
    );
    state.hourSecurity = {
      ...state.hourSecurity,
      status: "unprotected",
      screen: "unprotected",
      config: hourSecurityAsset,
      profileRecords: hourProfiles,
      activeKey: null,
      error: ""
    };
  } else if (hourSecurityAsset && encryptedHourProfiles.length === hourProfiles.length) {
    state.hourProfiles = [];
    state.hourSecurity = {
      ...state.hourSecurity,
      status: "locked",
      screen: "unlock",
      config: hourSecurityAsset,
      profileRecords: encryptedHourProfiles,
      activeKey: null,
      error: ""
    };
  } else if (
    encryptedHourProfiles.length ||
    (hourSecurityAsset && encryptedHourProfiles.length !== hourProfiles.length)
  ) {
    state.hourProfiles = [];
    state.hourSecurity = {
      ...state.hourSecurity,
      status: "reset-required",
      screen: "reset-confirm",
      config: null,
      profileRecords: encryptedHourProfiles,
      activeKey: null,
      error:
        "Varnostni podatki niso popolni. Profile Poročil ur je mogoče samo varno ponastaviti."
    };
  } else {
    state.hourProfiles = hourProfiles.map((profile) =>
      createHourProfile(profile.name, profile)
    );
    state.hourSecurity = {
      ...state.hourSecurity,
      status: "unconfigured",
      screen: "setup",
      config: null,
      profileRecords: [],
      activeKey: null,
      error: ""
    };
  }
  state.attendanceCategories = normalizeAttendanceCategories(attendanceCategoryAsset?.categories || []);
  state.dataSafety.config = backupConfig || null;
  state.companies = normalizeCompanyDirectory(companyDirectoryAsset?.companies);
  setSignatureAsset(signatureAsset);
  const last = state.proposals[0];
  state.current = last ? createBlankProposal(last) : createBlankProposal();
  state.currentMaterialIssue = createBlankMaterialIssue(state.materialIssues[0], last);
  state.currentAttendanceSheet = createBlankAttendanceSheet(
    state.attendanceSheets[0],
    currentAttendanceProfile()
  );
  state.attachment = null;
  state.persistedAttachmentId = "";
  document.title = "Center Rog evidence";
  openOnboardingIfNeeded();
  maybeOpenReleaseNotes();
  document.addEventListener("keydown", handleKeyboardShortcut);
  document.addEventListener("pointerover", handleToolbarTooltipFirstShow);
  document.addEventListener("focusin", handleToolbarTooltipFirstShow);
  render();
  scheduleAutomaticBackup();
  scheduleUpdateChecks();
  void checkForAppUpdate();

  if (isLocalPreview()) {
    await clearLocalPreviewServiceWorker();
  } else if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => registration.update())
      .catch((error) => {
        console.warn("Service worker registration failed", error);
      });
  }
}

init().catch((error) => {
  console.error(error);
  root.innerHTML = `
    <main class="app-shell">
      <div class="workspace">
        <section class="panel">
          <div class="panel-header">
            <span class="panel-title">Aplikacije ni bilo mogoče zagnati</span>
          </div>
          <div class="panel-body">
            <p class="empty-text">${escapeHtml(error.message || "Neznana napaka.")}</p>
          </div>
        </section>
      </div>
    </main>
  `;
});
