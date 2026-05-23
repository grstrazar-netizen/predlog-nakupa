import {
  DEFAULTS,
  centsToInputValue,
  createBlankProposal,
  deriveLabCodeFromName,
  downloadBlob,
  extractEuroTotalCents,
  formatCurrency,
  generateId,
  normalizeLabCode,
  parseMoneyToCents,
  proposalWithSaveMetadata,
  safeFileName,
  sortRecent,
  spendingBreakdownForYear,
  spendingForYear,
  uniqueSuggestions,
  yearFromDate
} from "./utils.js";
import {
  deleteAttachment,
  deleteProposal,
  getAllProposals,
  getAttachment,
  saveAttachment,
  saveProposal
} from "./db.js";
import { createCombinedPdfBlob } from "./pdf.js";

const root = document.getElementById("app");

const state = {
  proposals: [],
  current: createBlankProposal(),
  attachment: null,
  historyModalOpen: false,
  toolsPanelOpen: false,
  statusMenu: null,
  documentPopover: null,
  deleteConfirmId: "",
  onboarding: {
    active: false,
    stage: "",
    step: 0,
    labName: "",
    labCodePreview: DEFAULTS.labCode
  },
  dirty: false,
  busy: false,
  toast: ""
};

let outsideClickBound = false;
let onboardingViewportBound = false;
let onboardingPositionFrame = 0;
let onboardingDemoTimer = 0;
let onboardingCalculatorSnapshot = null;
let touchPopoverTimer = 0;
let hoverPopoverTimer = 0;
let recentDeleteDrag = null;
let suppressedRecentClickId = "";
const ONBOARDING_STORAGE_KEY = "predlog-nakupa:onboarding-complete:v1";
const DOCUMENT_POPOVER_HOVER_DELAY_MS = 1000;
const RECENT_DELETE_DRAG_DISTANCE = 92;
const ONBOARDING_CALCULATOR_DEMO_TEXT = "- slušalke 2*230 EUR\n- čelada 60 EUR\n- popust 100 - 10% EUR";
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

function documentStatusOption(value) {
  return DOCUMENT_STATUS_OPTIONS.find((option) => option.value === value) || DOCUMENT_STATUS_OPTIONS[0];
}

function renderDocumentRow(proposal, { modal = false } = {}) {
  const status = documentStatusOption(proposal.documentStatus || "");
  const serial = proposal.serial || "Brez številke";
  const company = proposal.company || "Brez podjetja";
  const rowLabel = `Odpri dokument ${serial}; ${company}; ${formatCurrency(proposal.estimatedValueCents || 0)}`;
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
          <li>To ni skupna baza in nima samodejne varnostne kopije. Za uradni arhiv vedno prenesi dokument PDF in ga shrani na dogovorjeno mesto.</li>
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

function centerRogLogoMarkup() {
  return `
    <img class="center-rog-logo" src="/assets/center-rog-logo.svg" alt="Center Rog" />
  `;
}

function markDirty() {
  state.dirty = true;
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

function render() {
  const currentYear = yearFromDate(state.current.issueDate);
  const allRecent = sortRecent(state.proposals);
  const recent = allRecent.slice(0, 5);
  const hasMoreHistory = allRecent.length > 5;
  const yearlySpending = spendingForYear(state.proposals, currentYear);
  const yearlySpendingBreakdown = spendingBreakdownForYear(state.proposals, currentYear);
  const attachment = state.attachment;
  const disabledAttr = state.busy ? "disabled" : "";
  const saveState = documentSaveState();
  const attachmentDetail = attachment?.mimeType?.startsWith("image/")
    ? "Priložena slika se ob izvozu doda kot dodatna stran v dokumentu PDF."
    : "Priloženo k izvozu v PDF";
  const dropzoneTitle = attachment ? "Spusti datoteko za zamenjavo" : "Povleci datoteko sem";
  const dropzoneHint = "Datoteka PDF ali slika (PNG, JPG, WEBP ...), lahko pa klikneš za izbor.";

  root.innerHTML = `
    <main class="app-shell">
      <header class="toolbar">
        <div class="brand">
          <div class="brand-mark">${icon("file-text")}</div>
          <div class="brand-copy">
            <div class="brand-title">Predlog nakupa drobnega materiala</div>
            <div class="brand-subtitle">
              <span class="save-state-pill save-state-${escapeHtml(saveState.kind)}">${escapeHtml(saveState.label)}</span>
              <span>${escapeHtml(saveState.detail)}</span>
            </div>
          </div>
        </div>

        <div class="toolbar-actions">
          <div class="button-group" role="group" aria-label="Delo z dokumentom">
            <button class="button button-outline toolbar-button" type="button" data-action="new" data-tooltip="Nov dokument: odpre svež predlog in ohrani zadnje uporabljene pametne podatke." aria-label="Nov dokument" data-busy-sensitive ${disabledAttr}>
              ${icon("file-plus-2")} <span class="toolbar-button-label">Nov dokument</span>
            </button>
            <button class="button button-outline toolbar-button" type="button" data-action="save" data-tooltip="${escapeHtml(saveState.saveLabel)}: shrani predlog in mu po potrebi dodeli interno številko." aria-label="${escapeHtml(saveState.saveLabel)}" data-busy-sensitive ${disabledAttr}>
              ${icon("save")} <span class="toolbar-button-label">${escapeHtml(saveState.saveLabel)}</span>
            </button>
          </div>
          <div class="button-group" role="group" aria-label="Priloga, izvoz in tisk">
            <button class="button button-outline toolbar-button" type="button" data-action="attach" data-tooltip="Pripni ponudbo: dodaj datoteko PDF ali sliko k predlogu." aria-label="Pripni ponudbo" data-busy-sensitive ${disabledAttr}>
              ${icon("paperclip")} <span class="toolbar-button-label">Pripni ponudbo</span>
            </button>
            <button class="button button-solid toolbar-button" type="button" data-action="download" data-tooltip="Prenesi PDF: shrani predlog in prenese končni dokument." aria-label="Prenesi PDF" data-busy-sensitive ${disabledAttr}>
              ${icon("download")} <span class="toolbar-button-label">Prenesi PDF</span>
            </button>
            <button class="button button-outline toolbar-button" type="button" data-action="print" data-tooltip="Natisni: pripravi dokument PDF in odpre tiskanje." aria-label="Natisni" data-busy-sensitive ${disabledAttr}>
              ${icon("printer")} <span class="toolbar-button-label">Natisni</span>
            </button>
          </div>
        </div>
      </header>

      <section class="workspace">
        <div class="document-stage">
          <article class="paper" aria-label="Predlog nakupa drobnega materiala">
            <div class="paper-header">
              ${centerRogLogoMarkup()}
            </div>

            <h1 class="document-title">PREDLOG NAKUPA DROBNEGA MATERIALA</h1>

            <div class="doc-line">
              <label for="fullName">Ime in priimek:</label>
              <span class="smart-field">
                <input class="doc-field person-name-field" id="fullName" data-field="fullName" value="${escapeHtml(state.current.fullName)}" autocomplete="name" />
              </span>
            </div>

            <div class="doc-line">
              <label for="jobTitle">Zaposlen/a na delovnem mestu:</label>
              <span class="smart-field">
                <input class="doc-field person-job-field" id="jobTitle" data-field="jobTitle" value="${escapeHtml(state.current.jobTitle)}" />
              </span>
            </div>

            <div class="doc-block purpose-block">
              <p class="doc-block-label">Predlagam nakup naslednjega drobnega materiala za potrebe:</p>
              <span class="smart-field">
                <input class="doc-field doc-purpose" data-field="purpose" data-smart-field="purpose" value="${escapeHtml(state.current.purpose)}" />
              </span>
            </div>

            <div class="doc-block">
              <p class="doc-block-label explanation-label">Opis / obrazložitev potrebe:</p>
              <span class="smart-field">
                <textarea class="doc-textarea explanation-notes" data-field="explanation" data-smart-field="explanation" rows="6" aria-label="Opis oziroma obrazložitev potrebe" placeholder="- slušalke 2*230 EUR&#10;- čelada 60 EUR&#10;- popust 100 - 10% EUR">${escapeHtml(state.current.explanation)}</textarea>
              </span>
            </div>

            <div class="doc-line">
              <label for="company">Podjetje:</label>
              <span class="smart-field">
                <input class="doc-field" id="company" data-field="company" data-smart-field="company" value="${escapeHtml(state.current.company)}" />
              </span>
            </div>

            <div class="doc-line value-line">
              <label for="estimatedValue">V okvirni skupni vrednosti: cca</label>
              <input class="doc-field amount-field" id="estimatedValue" data-field="estimatedValueCents" inputmode="decimal" value="${escapeHtml(centsToInputValue(state.current.estimatedValueCents))}" />
              <span>brez DDV</span>
            </div>

            <footer class="doc-footer">
              <div class="issue-signature-row">
                <div class="issue-line">
                  <span class="fixed-place" aria-label="Kraj izdaje">${escapeHtml(DEFAULTS.city)}</span>
                  <input class="doc-field date-field" data-field="issueDate" type="date" value="${escapeHtml(state.current.issueDate)}" aria-label="Datum izdaje" />
                </div>
                <div class="signature-box">
                  <span class="signature-label">Podpis vodje laba</span>
                  <span class="signature-rule" aria-hidden="true"></span>
                </div>
              </div>

              <div class="accounting-number-line">
                <span>Št.:</span>
                <strong>${escapeHtml(accountingNumberPreview())}</strong>
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
        </div>

        <aside class="side-panel${state.toolsPanelOpen ? " is-open" : ""}" id="toolsPanel" aria-label="Orodja dokumenta">
          <div class="panel-drawer-header">
            <span>${icon("panel-right")} Orodja dokumenta</span>
            <button class="button button-icon-only button-ghost" type="button" data-action="close-tools" aria-label="Zapri orodja dokumenta">
              ${icon("x")}
            </button>
          </div>
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
                  <input class="settings-code-input" id="labCode" data-field="labCode" value="${escapeHtml(state.current.labCode)}" aria-label="Kratica laba za interno številčenje" />
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
        ${icon("panel-right")} Orodja
      </button>

      <input class="hidden-input" type="file" id="offerInput" accept="application/pdf,image/*" />

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
      ${renderStatusMenu()}
      ${renderDocumentPopover()}
      ${renderDeleteConfirm()}
      <div class="delete-drag-hint" data-delete-drag-hint aria-hidden="true">Povleci iz kartice</div>
      ${renderOnboarding()}
    </main>
  `;

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

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action));
  });

  document.querySelectorAll("[data-load-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (consumeSuppressedRecentClick(button.dataset.loadId)) {
        event.preventDefault();
        return;
      }
      clearDocumentPopoverTimers();
      loadExistingDocument(button.dataset.loadId);
    });
    button.addEventListener("mouseenter", () => scheduleDocumentPopoverFromElement(button));
    button.addEventListener("mouseleave", closeDocumentPopover);
    button.addEventListener("focus", () => openDocumentPopoverFromElement(button));
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
      } else {
        closeHistoryModal();
      }
    });
  });
  document.querySelectorAll("[data-modal-window]").forEach((modal) => modal.addEventListener("click", (event) => {
    event.stopPropagation();
  }));

  document.getElementById("offerInput")?.addEventListener("change", handleOfferSelected);
  bindOfferDropzone();
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
  if (!event.target.closest(".document-popover") && !event.target.closest("[data-load-id]")) {
    closeDocumentPopover();
  }
  if (!event.target.closest(".status-menu") && !event.target.closest("[data-status-menu-id]")) {
    closeStatusMenu();
  }
  if (event.target.closest(".smart-field")) return;
  document.querySelectorAll(".suggestion-popover").forEach((popover) => popover.remove());
}

function showSuggestions(input) {
  const field = input.dataset.smartField;
  const wrapper = input.closest(".smart-field");
  if (!wrapper || !field) return;

  wrapper.querySelector(".suggestion-popover")?.remove();
  const suggestions = uniqueSuggestions(state.proposals, field, input.value);
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

async function handleAction(action) {
  try {
    if (isOnboardingCalculatorDemoStep()) {
      stopOnboardingCalculatorDemo({ restore: true });
    }

    if (action === "new") {
      await newDocument();
    } else if (action === "save") {
      await saveCurrentDocument();
    } else if (action === "attach") {
      document.getElementById("offerInput")?.click();
    } else if (action === "remove-attachment") {
      await removeAttachment();
    } else if (action === "download") {
      await exportPdf("download");
    } else if (action === "print") {
      await exportPdf("print");
    } else if (action === "open-history") {
      openHistoryModal();
    } else if (action === "close-history") {
      closeHistoryModal();
    } else if (action === "toggle-tools") {
      toggleToolsPanel();
    } else if (action === "close-tools") {
      closeToolsPanel();
    } else if (action === "cancel-delete") {
      closeDeleteConfirm();
    } else if (action === "confirm-delete") {
      await confirmDeleteProposal();
    }
  } catch (error) {
    console.error(error);
    showToast(error.message || "Prišlo je do napake.");
  }
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

function openDeleteConfirm(proposalId) {
  if (!proposalId) return;
  clearDocumentPopoverTimers();
  closeDocumentPopover();
  state.statusMenu = null;
  state.deleteConfirmId = proposalId;
  render();
}

function closeDeleteConfirm() {
  if (!state.deleteConfirmId) return;
  state.deleteConfirmId = "";
  render();
}

async function confirmDeleteProposal() {
  const proposalId = state.deleteConfirmId;
  const proposal = state.proposals.find((item) => item.id === proposalId);
  if (!proposal) {
    closeDeleteConfirm();
    return;
  }

  if (proposal.offerAttachmentId) {
    await deleteAttachment(proposal.offerAttachmentId);
  }
  await deleteProposal(proposal.id);

  state.proposals = sortRecent(await getAllProposals());
  if (state.current.id === proposal.id) {
    state.current = createBlankProposal(state.proposals[0] || proposal);
    state.attachment = null;
    state.dirty = false;
  }
  state.deleteConfirmId = "";
  state.statusMenu = null;
  closeDocumentPopover();
  render();
  showToast(`Predlog ${proposal.serial || ""} je izbrisan.`);
}

function openStatusMenu(proposalId, x, y) {
  if (!proposalId) return;
  state.statusMenu = { proposalId, x, y };
  render();
}

function closeStatusMenu() {
  if (!state.statusMenu) return;
  state.statusMenu = null;
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
  if (dragging) suppressRecentClick(proposalId);
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

  const updated = {
    ...proposal,
    documentStatus
  };

  await saveProposal(updated);
  state.proposals = sortRecent(await getAllProposals());
  if (state.current.id === proposalId) {
    state.current = { ...state.current, documentStatus };
  }
  state.statusMenu = null;
  closeDocumentPopover();
  render();
}

async function newDocument() {
  if (state.dirty && !window.confirm("Trenutni dokument ima neshranjene spremembe. Ustvarim nov dokument?")) {
    return;
  }
  const recent = sortRecent(state.proposals)[0] || state.current;
  state.current = createBlankProposal(recent);
  state.attachment = null;
  state.statusMenu = null;
  state.documentPopover = null;
  state.toolsPanelOpen = false;
  state.dirty = false;
  render();
}

async function saveCurrentDocument({ silent = false } = {}) {
  const proposals = await getAllProposals();
  const saved = proposalWithSaveMetadata(state.current, proposals);
  await saveProposal(saved);
  state.current = saved;
  state.proposals = sortRecent(await getAllProposals());
  state.dirty = false;
  render();
  if (!silent) showToast(`Dokument ${saved.serial} je shranjen.`);
  return saved;
}

async function loadExistingDocument(id) {
  if (state.dirty && !window.confirm("Trenutni dokument ima neshranjene spremembe. Odprem drug dokument?")) {
    return;
  }
  const proposal = state.proposals.find((item) => item.id === id);
  if (!proposal) return;
  state.current = { ...proposal };
  state.attachment = await getAttachment(proposal.offerAttachmentId);
  state.historyModalOpen = false;
  state.statusMenu = null;
  state.toolsPanelOpen = false;
  state.dirty = false;
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

  if (state.current.offerAttachmentId) {
    await deleteAttachment(state.current.offerAttachmentId);
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
  await saveAttachment(attachment);
  state.current.offerAttachmentId = attachment.id;
  state.attachment = attachment;
  markDirty();
  render();
  showToast(`Datoteka ${file.name} je pripeta.`);
}

async function removeAttachment() {
  if (!state.current.offerAttachmentId) return;
  await deleteAttachment(state.current.offerAttachmentId);
  state.current.offerAttachmentId = "";
  state.attachment = null;
  markDirty();
  render();
  showToast("Ponudba je odstranjena iz dokumenta.");
}

async function exportPdf(mode) {
  setBusy(true);
  try {
    const saved = await saveCurrentDocument({ silent: true });
    const attachment = saved.offerAttachmentId ? await getAttachment(saved.offerAttachmentId) : null;
    const pdfBlob = await createCombinedPdfBlob(saved, attachment);
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
  state.proposals = sortRecent(await getAllProposals());
  const last = state.proposals[0];
  state.current = last ? createBlankProposal(last) : createBlankProposal();
  state.attachment = null;
  openOnboardingIfNeeded();
  render();

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
