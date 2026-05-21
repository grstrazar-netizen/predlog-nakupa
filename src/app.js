import {
  DEFAULTS,
  centsToInputValue,
  createBlankProposal,
  downloadBlob,
  extractEuroTotalCents,
  formatCurrency,
  generateId,
  normalizeLabCode,
  parseMoneyToCents,
  proposalWithSaveMetadata,
  safeFileName,
  sortRecent,
  spendingForYear,
  uniqueSuggestions,
  yearFromDate
} from "./utils.js";
import {
  deleteAttachment,
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
  statusMenu: null,
  documentPopover: null,
  dirty: false,
  busy: false,
  toast: ""
};

let outsideClickBound = false;
let touchPopoverTimer = 0;
let hoverPopoverTimer = 0;
const DOCUMENT_POPOVER_HOVER_DELAY_MS = 1000;
const DOCUMENT_STATUS_OPTIONS = [
  { value: "", label: "Brez statusa", className: "none" },
  { value: "submitted", label: "Oddano", className: "submitted" },
  { value: "approved", label: "Potrjeno", className: "approved" },
  { value: "rejected", label: "Zavrnjeno", className: "rejected" }
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

function serialPreview() {
  if (state.current.serial) return state.current.serial;
  return `${normalizeLabCode(state.current.labCode)}-${yearFromDate(state.current.issueDate)}-___`;
}

function accountingNumberPreview() {
  return `${yearFromDate(state.current.issueDate)}- ____`;
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
  const attachment = state.attachment;
  const disabledAttr = state.busy ? "disabled" : "";
  const attachmentDetail = attachment?.mimeType?.startsWith("image/")
    ? "Priložena slika se ob izvozu doda kot dodatna stran v PDF."
    : "Priloženo k PDF izvozu";
  const dropzoneTitle = attachment ? "Spusti datoteko za zamenjavo" : "Povleci datoteko sem";
  const dropzoneHint = "PDF ali slika (PNG, JPG, WEBP ...), ali klikni za izbor.";

  root.innerHTML = `
    <main class="app-shell">
      <header class="toolbar">
        <div class="brand">
          <div class="brand-mark">${icon("file-text")}</div>
          <div class="brand-copy">
            <div class="brand-title">Predlog nakupa drobnega materiala</div>
            <div class="brand-subtitle">Interna evidenca: ${escapeHtml(serialPreview())}</div>
          </div>
        </div>

        <div class="toolbar-actions">
          <button class="button button-outline" type="button" data-action="new" data-busy-sensitive ${disabledAttr}>
            ${icon("file-plus-2")} Nov dokument
          </button>
          <button class="button button-outline" type="button" data-action="save" data-busy-sensitive ${disabledAttr}>
            ${icon("save")} Shrani
          </button>
          <button class="button button-outline" type="button" data-action="attach" data-busy-sensitive ${disabledAttr}>
            ${icon("paperclip")} Pripni ponudbo
          </button>
          <button class="button button-solid" type="button" data-action="download" data-busy-sensitive ${disabledAttr}>
            ${icon("download")} Prenesi PDF
          </button>
          <button class="button button-outline" type="button" data-action="print" data-busy-sensitive ${disabledAttr}>
            ${icon("printer")} Natisni
          </button>
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
                <textarea class="doc-textarea explanation-notes" data-field="explanation" data-smart-field="explanation" rows="6" aria-label="Opis oziroma obrazložitev potrebe" placeholder="- slušalke 2*230 eur&#10;- čelada 60 eur&#10;- popust 100 - 10% eur">${escapeHtml(state.current.explanation)}</textarea>
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

        <aside class="side-panel" aria-label="Pametne funkcije dokumenta">
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
                  : `<p class="empty-text">Ponudba še ni pripeta. Povleci PDF ali sliko v spodnje polje.</p>`
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
                <strong
                  class="metric-value metric-value-private"
                  tabindex="0"
                  aria-label="Letna poraba brez zavrnjenih predlogov ${formatCurrency(yearlySpending)}"
                  title="Premakni miško čez znesek za prikaz"
                >${formatCurrency(yearlySpending)}</strong>
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
                  <strong>${escapeHtml(serialPreview())}</strong>
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
    </main>
  `;

  bindEvents();
  refreshIcons();
  renderToast();
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
    button.addEventListener("click", () => {
      clearDocumentPopoverTimers();
      loadExistingDocument(button.dataset.loadId);
    });
    button.addEventListener("mouseenter", () => scheduleDocumentPopoverFromElement(button));
    button.addEventListener("mouseleave", closeDocumentPopover);
    button.addEventListener("focus", () => openDocumentPopoverFromElement(button));
    button.addEventListener("blur", closeDocumentPopover);
    button.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") return;
      window.clearTimeout(touchPopoverTimer);
      touchPopoverTimer = window.setTimeout(() => {
        openDocumentPopoverFromElement(button);
      }, 520);
    });
    button.addEventListener("pointerup", () => {
      window.clearTimeout(touchPopoverTimer);
    });
    button.addEventListener("pointercancel", () => {
      window.clearTimeout(touchPopoverTimer);
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

  document.querySelector(".modal-backdrop")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeHistoryModal();
  });
  document.querySelector("[data-modal-window]")?.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  document.getElementById("offerInput")?.addEventListener("change", handleOfferSelected);
  bindOfferDropzone();

  if (!outsideClickBound) {
    document.addEventListener("click", closeSuggestionsOnOutsideClick);
    outsideClickBound = true;
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
    }
  } catch (error) {
    console.error(error);
    showToast(error.message || "Prišlo je do napake.");
  }
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
    throw new Error("Pripni PDF ali slikovno datoteko.");
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
        showToast("Brskalnik je blokiral tiskanje, zato sem PDF prenesel.");
      } else {
        printWindow.addEventListener("load", () => printWindow.print(), { once: true });
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        showToast("PDF je pripravljen za tiskanje.");
      }
    } else {
      downloadBlob(pdfBlob, fileName);
      showToast("PDF je pripravljen za prenos.");
    }
  } finally {
    setBusy(false);
  }
}

async function init() {
  state.proposals = sortRecent(await getAllProposals());
  const last = state.proposals[0];
  state.current = last ? createBlankProposal(last) : createBlankProposal();
  state.attachment = null;
  render();

  if ("serviceWorker" in navigator) {
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
