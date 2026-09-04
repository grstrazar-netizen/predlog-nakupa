import { test, expect } from "playwright/test";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ONBOARDING_KEY = "predlog-nakupa:onboarding-complete:v1";
const VERSION_KEY = "center-rog-evidence:last-seen-version";
const APP_VERSION = "1.3.0";
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z6V8AAAAASUVORK5CYII=",
  "base64"
);
const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".webmanifest": "application/manifest+json"
};

test.beforeEach(async ({ page }) => {
  await page.route("https://app.local/**", async (route) => {
    const url = new URL(route.request().url());
    const relativePath = decodeURIComponent(url.pathname === "/" ? "index.html" : url.pathname.slice(1));
    try {
      await route.fulfill({
        status: 200,
        contentType: CONTENT_TYPES[extname(relativePath)] || "application/octet-stream",
        body: await readFile(join(PROJECT_ROOT, relativePath))
      });
    } catch {
      await route.fulfill({ status: 404, body: "Not found" });
    }
  });
  await page.addInitScript(
    ({ onboardingKey, versionKey, appVersion }) => {
      localStorage.setItem(onboardingKey, "done");
      if (localStorage.getItem(versionKey) !== "__show_release_notes__") {
        localStorage.setItem(versionKey, appVersion);
      }
      Object.defineProperty(window, "showDirectoryPicker", {
        configurable: true,
        value: undefined
      });
    },
    { onboardingKey: ONBOARDING_KEY, versionKey: VERSION_KEY, appVersion: APP_VERSION }
  );
  await page.goto("/");
  await expect(page).toHaveTitle(/Center Rog/);
});

test("loads all evidences and opens backup settings", async ({ page }) => {
  await expect(page.getByRole("tab")).toHaveCount(5);
  await page.getByRole("button", { name: "Odpri varnostne kopije" }).click();
  await expect(page.getByRole("heading", { name: "Varnostne kopije" })).toBeVisible();
  await expect(page.getByText(`Različica aplikacije ${APP_VERSION}`)).toBeVisible();
});

test("shows the yearly planning heatmap and explains each day", async ({ page }) => {
  await page.getByRole("tab", { name: "Koledar" }).click();

  await expect(page.getByRole("heading", { name: "Koledar programov" })).toBeVisible();
  await expect(page.locator(".calendar-month")).toHaveCount(12);
  await expect(page.locator(".calendar-summary")).toHaveCount(0);
  await expect(page.locator(".calendar-tool-button")).toHaveCount(4);
  await expect(page.locator(".calendar-tool-button").filter({ hasText: /\S/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Vključi ali izključi heatmap" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Izvozi koledar za Asano" })).toBeVisible();
  await page.locator('[data-calendar-date="2026-06-25"]').first().click();
  await expect(page.getByText("Dan državnosti")).toBeVisible();
  await expect(page.locator(".calendar-score")).toContainText("/ 100");
  await expect(page.locator(".calendar-level-label")).toHaveText("Odsvetovano");

  await page.getByRole("combobox", { name: "Leto" }).selectOption("2035");
  await page.locator('[data-calendar-date="2035-06-25"]').first().click();
  await expect(page.getByText("Dan državnosti")).toBeVisible();
  await expect(page.locator(".calendar-title-block")).toContainText("dolgoročna ocena");

  await page.getByRole("combobox", { name: "Leto" }).selectOption("2026");

  await page.locator("[data-calendar-filter-menu] > summary").click();
  await page.getByRole("checkbox", { name: "Šolske počitnice" }).uncheck();
  await page.locator('[data-calendar-date="2026-02-18"]').first().click();
  await expect(page.getByText(/Zimske počitnice \(Ljubljana/)).toHaveCount(0);
});

test("plans, persists, edits and deletes a repeating calendar event", async ({ page }) => {
  await page.getByRole("tab", { name: "Koledar" }).click();
  await page.locator("[data-calendar-selection-mode]").click();
  await page.locator('.calendar-day[data-calendar-date="2026-01-05"]').click();
  await page.locator('.calendar-day[data-calendar-date="2026-01-07"]').click();

  await expect(page.locator(".calendar-selection-bar")).toContainText("2 izbranih dni");
  await page.locator('[data-calendar-open-editor="program"]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  const modalBox = await page.locator(".calendar-event-modal").boundingBox();
  expect(modalBox.x).toBeGreaterThanOrEqual(0);
  expect(modalBox.x + modalBox.width).toBeLessThanOrEqual(390);
  await page.locator('input[name="title"]').fill("Večerna keramična delavnica");
  await page.locator('.calendar-choice-option:has(input[name="categoryPreset"][value="Delavnica"])').click();
  await page.locator('.calendar-choice-option:has(input[name="locationPreset"][value="custom"])').click();
  await page.locator('input[name="locationCustom"]').fill("Keramičarski lab");
  await page.locator('input[name="capacity"]').fill("12");
  await page.locator('input[name="ticketPrice"]').fill("25,50");
  await page.locator('.calendar-recurrence-option:has(input[value="weekly"])').click();
  await page.locator('input[name="recurrenceEnd"]').fill("2026-01-19");
  await page.locator('[data-calendar-event-form] button[type="submit"]').click();

  await expect(page.locator(".calendar-planned-events")).toContainText("Večerna keramična delavnica");
  await expect(page.locator(".calendar-day.has-planned-events")).toHaveCount(5);
  await expect(page.locator(".calendar-year-plan")).toContainText("15");
  await expect(page.locator(".calendar-year-plan")).toContainText("5 terminov");
  await expect(page.locator(".calendar-year-plan")).toContainText("12");
  await expect(page.locator(".calendar-category-breakdown")).toContainText("Delavnica");

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.reload();
  await page.getByRole("tab", { name: "Koledar" }).click();
  await page.locator('.calendar-day[data-calendar-date="2026-01-05"]').click();
  await expect(page.locator(".calendar-planned-events")).toContainText("Keramičarski lab");
  await expect(page.locator(".calendar-planned-events")).toContainText("25,50");

  await page.locator("[data-calendar-edit-event]").click();
  await expect(page.locator('input[name="title"]')).toHaveValue("Večerna keramična delavnica");
  await expect(page.locator('input[name="ticketPrice"]')).toHaveValue("25,50");
  await page.locator('button[data-calendar-close-editor]').last().click();
  await page.locator("[data-calendar-delete-event]").click();
  await expect(page.locator(".delete-modal")).toContainText("5 načrtovanih datumov");
  await page.locator("[data-calendar-confirm-delete]").click();
  await expect(page.locator(".calendar-planned-events")).not.toContainText("Večerna keramična delavnica");
});

test("adds an important date and remembers the hidden heatmap", async ({ page }) => {
  await page.getByRole("tab", { name: "Koledar" }).click();
  const targetDay = page.locator('.calendar-day[data-calendar-date="2026-09-08"]');
  await targetDay.click({ modifiers: ["Shift"] });
  const originalLevel = (await targetDay.getAttribute("class"))?.match(/level-\w+/)?.[0];

  await page.locator('[data-calendar-open-editor="important"]').click();
  await page.locator('[data-calendar-title-suggestion="Rog Forum"]').click();
  await expect(page.locator('input[name="title"]')).toHaveValue("Rog Forum");
  await page.locator('.calendar-impact-option:has(input[value="avoid"])').click();
  await page.locator('[data-calendar-event-form] button[type="submit"]').click();

  await expect(page.locator(".calendar-planned-events")).toContainText("Rog Forum");
  await expect(page.locator(".calendar-planned-events")).toContainText("Ni primeren");
  await expect(targetDay).not.toHaveClass(new RegExp(originalLevel || "$^"));
  await expect(page.getByRole("checkbox", { name: "Interni datumi" })).toBeChecked();

  await page.locator("[data-calendar-heatmap-toggle]").click();
  await expect(page.locator(".calendar-surface")).toHaveClass(/is-heatmap-hidden/);
  await expect(page.locator("[data-calendar-heatmap-toggle]")).toHaveAttribute("aria-pressed", "false");

  await page.reload();
  await page.getByRole("tab", { name: "Koledar" }).click();
  await expect(page.locator(".calendar-surface")).toHaveClass(/is-heatmap-hidden/);
  await page.locator('.calendar-day[data-calendar-date="2026-09-08"]').click();
  await expect(page.locator(".calendar-planned-events")).toContainText("Rog Forum");
});

test("opens the event type picker on double click and clears selected days from the background", async ({ page }) => {
  await page.getByRole("tab", { name: "Koledar" }).click();
  await page.locator('.calendar-day[data-calendar-date="2026-03-10"]').dblclick();

  await expect(page.getByRole("heading", { name: "Kaj želiš dodati?" })).toBeVisible();
  await expect(page.locator('[data-calendar-pick-kind="program"]')).toBeVisible();
  await expect(page.locator('[data-calendar-pick-kind="important"]')).toBeVisible();
  await page.locator('[data-calendar-pick-kind="important"]').click();
  await expect(page.getByRole("heading", { name: "Dodaj pomemben datum" })).toBeVisible();
  await page.locator('button[data-calendar-close-editor]').last().click();

  await expect(page.locator(".calendar-selection-bar")).toContainText("1 izbran dan");
  await page.locator(".calendar-quarter").first().click({ position: { x: 12, y: 80 } });
  await expect(page.locator(".calendar-selection-bar")).toHaveCount(0);
});

test("exports the yearly calendar as a one-page portrait A4 PDF", async ({ page }) => {
  await page.getByRole("tab", { name: "Koledar" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Izvozi koledar kot PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("koledar-programov-2026.pdf");

  const pdfPath = await download.path();
  expect(pdfPath).toBeTruthy();
  const bytes = await readFile(pdfPath);
  expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  const details = await page.evaluate(async (base64) => {
    const data = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const document = await window.PDFLib.PDFDocument.load(data);
    const [pdfPage] = document.getPages();
    return {
      pages: document.getPageCount(),
      width: pdfPage.getWidth(),
      height: pdfPage.getHeight()
    };
  }, bytes.toString("base64"));
  expect(details.pages).toBe(1);
  expect(details.height).toBeGreaterThan(details.width);
  expect(details.width).toBeCloseTo(595.28, 1);
  expect(details.height).toBeCloseTo(841.89, 1);
  await expect(page.locator(".toast")).toContainText("Koledar PDF je pripravljen za prenos.");
});

test("exports planned programs as an Asana-compatible CSV", async ({ page }) => {
  await page.getByRole("tab", { name: "Koledar" }).click();
  await page.locator('.calendar-day[data-calendar-date="2026-01-05"]').click({ modifiers: ["Shift"] });
  await page.locator('.calendar-day[data-calendar-date="2026-01-12"]').click({ modifiers: ["Shift"] });
  await page.locator('[data-calendar-open-editor="program"]').click();
  await page.locator('input[name="title"]').fill("Tečaj za Asano");
  await page.locator('.calendar-choice-option:has(input[name="categoryPreset"][value="Tečaj"])').click();
  await page.locator('.calendar-choice-option:has(input[name="locationPreset"][value="Prizidek"])').click();
  await page.locator('input[name="startTime"]').fill("09:30");
  await page.locator('input[name="endTime"]').fill("12:00");
  await page.locator('input[name="capacity"]').fill("10");
  await page.locator('input[name="ticketPrice"]').fill("18,50");
  await page.locator('[data-calendar-event-form] button[type="submit"]').click();
  await expect(page.locator(".calendar-event-modal")).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Izvozi koledar za Asano" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("asana-koledar-programov-2026.csv");

  const csvPath = await download.path();
  expect(csvPath).toBeTruthy();
  const csv = await readFile(csvPath, "utf8");
  expect(csv.startsWith("\uFEFF")).toBeTruthy();
  expect(csv).toContain('"Name","Section/Column","Start Date","Due Date"');
  expect(csv).toContain('"Tečaj za Asano"');
  expect(csv).toContain('"2026-01-05","2026-01-12"');
  expect(csv).toContain('"PROGRAM LABI","TEČAJ"');
  expect(csv).toContain('"TEČAJ","10","09:30","12:00","Prizidek"');
  expect(csv).toContain("PREDVIDENA CENA VSTOPNICE: 18,5 EUR");
  expect(csv).toContain("TERMINI:");
  await expect(page.locator(".toast")).toContainText("Asana CSV za leto 2026 je pripravljen za prenos.");
});

test("creates an encrypted manual backup when folder access is unavailable", async ({ page }) => {
  await page.getByRole("button", { name: "Odpri varnostne kopije" }).click();
  await page.getByRole("button", { name: "Nastavi backup" }).click();
  await page.locator("[data-backup-password]").fill("testno-geslo");
  await page.locator("[data-backup-password-confirm]").fill("testno-geslo");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Nastavi zaščito" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^center-rog-evidence-\d{4}-\d{2}-\d{2}\.backup$/);
  await expect(page.getByText("Ročni šifrirani backup")).toBeVisible();
});

test("transfers saved history through an encrypted handoff package", async ({ page }) => {
  await page.locator('[data-field="fullName"]').fill("Predajni uporabnik");
  await page.locator('[data-field="jobTitle"]').fill("Vodja predajnega laba");
  await page.locator('[data-field="purpose"]').fill("Predajni lab");
  await page.locator('[data-field="explanation"]').fill("Preverjanje prenosa 42 EUR");
  await page.locator('[data-field="company"]').fill("Prenos zgodovine d.o.o.");
  await page.locator('[data-field="estimatedValueCents"]').fill("42,00");
  await page.locator("#offerInput").setInputFiles({
    name: "predajna-ponudba.png",
    mimeType: "image/png",
    buffer: TINY_PNG
  });
  await page.locator("#signatureInput").setInputFiles({
    name: "predajni-podpis.png",
    mimeType: "image/png",
    buffer: await readFile(join(PROJECT_ROOT, "icon-192.png"))
  });
  await expect(page.locator(".toast")).toContainText("Podpis je shranjen.");
  await page.getByRole("button", { name: "Shrani dokument" }).click();

  await page.getByRole("button", { name: "Odpri varnostne kopije" }).click();
  await page.getByRole("button", { name: "Začni prenos" }).click();
  await expect(page.getByRole("heading", { name: "Prenos na nov računalnik" })).toBeVisible();
  await expect(page.getByText("predlogov nakupa")).toBeVisible();
  await page.locator("[data-transfer-password]").fill("predajno-geslo");
  await page.locator("[data-transfer-password-confirm]").fill("predajno-geslo");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Prenesi predajni paket" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^center-rog-predaja-\d{4}-\d{2}-\d{2}\.backup$/);
  const transferPath = await download.path();
  expect(transferPath).toBeTruthy();

  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("predlog-nakupa-db", 4);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const stores = [
      "proposals",
      "materialIssues",
      "attendanceSheets",
      "hourProfiles",
      "attachments",
      "assets"
    ];
    const transaction = db.transaction(stores, "readwrite");
    stores.forEach((storeName) => transaction.objectStore(storeName).clear());
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  });
  await page.reload();
  await expect(page.getByText("Prenos zgodovine d.o.o.")).toHaveCount(0);

  await page.getByRole("button", { name: "Odpri varnostne kopije" }).click();
  await page.locator("[data-backup-restore-input]").setInputFiles({
    name: download.suggestedFilename(),
    mimeType: "application/x-center-rog-backup",
    buffer: await readFile(transferPath)
  });
  await expect(page.getByText(download.suggestedFilename())).toBeVisible();
  await page.locator("[data-backup-restore-password]").fill("predajno-geslo");
  await page.getByRole("button", { name: "Obnovi podatke" }).click();

  await expect(page.locator(".toast")).toContainText("Prenos je končan: 1 dokument in 1 priponka.");
  const restoredProposal = page.getByRole("button", { name: /Prenos zgodovine d\.o\.o\./ });
  await expect(restoredProposal).toBeVisible();
  await restoredProposal.click();
  await expect(page.getByText("predajna-ponudba.png")).toBeVisible();
  await page.getByRole("button", { name: "Zapri predogled" }).click();
  await page.locator('[data-panel-id^="proposal-moj-podpis"] .panel-collapse-button').click();
  await expect(page.getByRole("button", { name: "Vstavi v dokument" })).toBeVisible();
});

test("shows release notes once for a newly installed version", async ({ page }) => {
  await page.evaluate(
    (versionKey) => localStorage.setItem(versionKey, "__show_release_notes__"),
    VERSION_KEY
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Kaj je novega" })).toBeVisible();
  await page.getByRole("button", { name: "Razumem" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Kaj je novega" })).toHaveCount(0);
});

test("protects dirty proposal, saves it and exports attachment in PDF", async ({ page }) => {
  await page.locator('[data-field="fullName"]').fill("Testni Mentor");
  await page.getByRole("tab", { name: "Izdajnice materiala" }).click();
  await expect(page.getByRole("heading", { name: "Neshranjene spremembe" })).toBeVisible();
  await page.getByRole("button", { name: "Ostani na obrazcu" }).last().click();

  await page.locator('[data-field="jobTitle"]').fill("Vodja testnega laba");
  await page.locator('[data-field="purpose"]').fill("Testni lab");
  await page.locator('[data-field="explanation"]').fill("Testni material 25 EUR");
  await page.locator('[data-field="company"]').fill("Testno podjetje");
  await page.locator('[data-field="estimatedValueCents"]').fill("25,00");

  await page.locator("#offerInput").setInputFiles({
    name: "ponudba.png",
    mimeType: "image/png",
    buffer: TINY_PNG
  });
  await page.getByRole("button", { name: "Shrani dokument" }).click();
  await expect(page.getByText("SHRANJENO").first()).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Prenesi PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);

  await page.reload();
  await expect(page.getByRole("button", { name: /Testno podjetje/ })).toBeVisible();
});

test("exports all saved proposals in one accounting Excel register", async ({ page }) => {
  await page.locator('[data-field="fullName"]').fill("Računovodski preizkus");
  await page.locator('[data-field="jobTitle"]').fill("Vodja testnega laba");
  await page.locator('[data-field="purpose"]').fill("Testni lab");
  await page.locator('[data-field="explanation"]').fill("Potrošni material 48,50 EUR");
  await page.locator('[data-field="company"]').fill("Excel podjetje d.o.o.");
  await page.locator('[data-field="estimatedValueCents"]').fill("48,50");
  await page.getByRole("button", { name: "Shrani dokument" }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Izvozi vse predloge v Excel" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^register-predlogov-center-rog-\d{4}-\d{2}-\d{2}\.xlsx$/);
  await expect(page.locator(".toast")).toContainText("Excelov register vsebuje 1 predlog.");
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  expect((await readFile(downloadPath)).byteLength).toBeGreaterThan(1000);
});

test("routes print through the active proposal PDF flow", async ({ page }) => {
  await page.locator('[data-field="fullName"]').fill("Testni Mentor");
  await page.locator('[data-field="jobTitle"]').fill("Vodja testnega laba");
  await page.locator('[data-field="purpose"]').fill("Testni lab");
  await page.locator('[data-field="explanation"]').fill("Testni material 25 EUR");
  await page.locator('[data-field="company"]').fill("Testno podjetje");
  await page.locator('[data-field="estimatedValueCents"]').fill("25,00");
  await page.getByRole("button", { name: "Shrani dokument" }).click();

  await page.addInitScript(() => {
    window.__openedPrintWindows = 0;
  });
  await page.evaluate(() => {
    window.__openedPrintWindows = 0;
    window.open = () => {
      window.__openedPrintWindows += 1;
      return {
        addEventListener: (_name, callback) => callback(),
        print: () => {},
        close: () => {}
      };
    };
  });
  await page.getByRole("button", { name: "Natisni" }).click();
  await expect.poll(() => page.evaluate(() => window.__openedPrintWindows)).toBe(1);
});

test("imports a Wagtail CSV and prepares an attendance sheet", async ({ page }) => {
  await page.getByRole("tab", { name: "Podpisni listi" }).click();
  const csv = [
    "event,start_day,start_time,name,surname,email,allow_photos",
    '"Testna delavnica","2026-07-11","17:00","Ana","Novak","ana@example.com","yes"'
  ].join("\n");
  await page.locator("#attendanceCsvInput").setInputFiles({
    name: "udelezenci.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv)
  });
  await expect(page.getByRole("heading", { name: "Pregled uvoza CSV" })).toBeVisible();
  const requiredInputs = page.locator(".attendance-import-fields input");
  for (let index = 0; index < (await requiredInputs.count()); index += 1) {
    const input = requiredInputs.nth(index);
    if (!(await input.inputValue())) await input.fill("Test");
  }
  await page.getByRole("button", { name: "Ustvari podpisne liste" }).click();
  await expect(page.locator('input[value="Ana"]')).toBeVisible();
  await expect(page.locator('input[value="Novak"]')).toBeVisible();
});

test("imports Connecteam XLSX after PIN setup", async ({ page }) => {
  await page.getByRole("tab", { name: "Poročila ur" }).click();
  await page.getByLabel("Šestmestni PIN").fill("123456");
  await page.getByLabel("Ponovi PIN").fill("123456");
  await page.getByRole("button", { name: "Nastavi PIN in odkleni" }).click();
  await expect(page.locator(".toast")).toContainText("Poročila ur so zaščitena in odklenjena.");
  await expect(page.locator("#hourReportInput")).toHaveCount(1);

  const workbookBytes = await page.evaluate(() => {
    const rows = [
      ["Users", "Shift title", "Job", "Date", "Set times", "shift total hrs"],
      ["Ana Novak", "Dopoldne", "Odprti termini", "11. 07. 2026", "09:00 - 15:00", "06:00"]
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "List view");
    return Array.from(
      new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }))
    );
  });
  await page.locator("#hourReportInput").setInputFiles({
    name: "connecteam.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(workbookBytes)
  });
  await expect(
    page.getByRole("button", { name: /Ana Novak julij 2026 · 6 h/ })
  ).toBeVisible();
});
