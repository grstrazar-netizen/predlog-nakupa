import { test, expect } from "playwright/test";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ONBOARDING_KEY = "predlog-nakupa:onboarding-complete:v1";
const VERSION_KEY = "center-rog-evidence:last-seen-version";
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
  await page.route("http://app.local/**", async (route) => {
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
    ({ onboardingKey, versionKey }) => {
      localStorage.setItem(onboardingKey, "done");
      localStorage.setItem(versionKey, "1.0.0");
    },
    { onboardingKey: ONBOARDING_KEY, versionKey: VERSION_KEY }
  );
  await page.goto("/");
  await expect(page).toHaveTitle(/Center Rog/);
});

test("loads all evidences and opens backup settings", async ({ page }) => {
  await expect(page.getByRole("tab")).toHaveCount(4);
  await page.getByRole("button", { name: "Odpri varnostne kopije" }).click();
  await expect(page.getByRole("heading", { name: "Varnostne kopije" })).toBeVisible();
  await expect(page.getByText("Različica aplikacije 1.0.0")).toBeVisible();
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

test("shows release notes once for a newly installed version", async ({ page }) => {
  await page.evaluate((versionKey) => localStorage.removeItem(versionKey), VERSION_KEY);
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
  await page.locator('[data-field="estimatedValue"]').fill("25,00");
  await page.locator('[data-field="labCode"]').fill("TST");

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z6V8AAAAASUVORK5CYII=",
    "base64"
  );
  await page.locator("#offerInput").setInputFiles({
    name: "ponudba.png",
    mimeType: "image/png",
    buffer: png
  });
  await page.getByRole("button", { name: "Shrani dokument" }).click();
  await expect(page.getByText("SHRANJENO").first()).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Prenesi PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);

  await page.reload();
  await expect(page.getByText("Testno podjetje")).toBeVisible();
});

test("routes print through the active proposal PDF flow", async ({ page }) => {
  await page.locator('[data-field="fullName"]').fill("Testni Mentor");
  await page.locator('[data-field="jobTitle"]').fill("Vodja testnega laba");
  await page.locator('[data-field="purpose"]').fill("Testni lab");
  await page.locator('[data-field="explanation"]').fill("Testni material 25 EUR");
  await page.locator('[data-field="company"]').fill("Testno podjetje");
  await page.locator('[data-field="estimatedValue"]').fill("25,00");
  await page.locator('[data-field="labCode"]').fill("TST");
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
  await expect(page.getByDisplayValue("Ana")).toBeVisible();
  await expect(page.getByDisplayValue("Novak")).toBeVisible();
});

test("imports Connecteam XLSX after PIN setup", async ({ page }) => {
  await page.getByRole("tab", { name: "Poročila ur" }).click();
  await page.getByLabel("Šestmestni PIN").fill("123456");
  await page.getByLabel("Ponovi PIN").fill("123456");
  await page.getByRole("button", { name: "Nastavi PIN in odkleni" }).click();
  await expect(page.getByText("Poročila ur", { exact: true }).first()).toBeVisible();

  const workbookBytes = await page.evaluate(() => {
    const rows = [
      ["Users", "Shift title", "Job", "Date", "Set times", "shift total hrs"],
      ["Ana Novak", "Dopoldne", "Odprti termini", "11. 07. 2026", "09:00 - 15:00", "06:00"]
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "List view");
    return Array.from(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));
  });
  await page.locator("#hourReportInput").setInputFiles({
    name: "connecteam.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(workbookBytes)
  });
  await expect(page.getByText("Ana Novak")).toBeVisible();
  await expect(page.getByText(/6 h/)).toBeVisible();
});
