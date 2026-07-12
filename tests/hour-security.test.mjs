import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";

import {
  createHourSecurity,
  createUnprotectedHourSecurity,
  decryptHourProfiles,
  encryptHourProfiles,
  replaceHourPin,
  unlockHourDataKey,
  validateHourPin
} from "../src/hour-security.js";
import { renderHourReportsWorkspace } from "../src/hour-report-ui.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

test("sprejme samo šestmestni številčni PIN", () => {
  assert.equal(validateHourPin("123456"), true);
  assert.equal(validateHourPin("12345"), false);
  assert.equal(validateHourPin("1234567"), false);
  assert.equal(validateHourPin("12a456"), false);
});

test("nezaščiteni način je izrecno označen in ne vsebuje PIN podatkov", () => {
  const config = createUnprotectedHourSecurity();
  assert.equal(config.mode, "unprotected");
  assert.equal("pinWrap" in config, false);
  assert.equal("pinSalt" in config, false);
});

test("PIN odklene šifrirane profile", async () => {
  const { config, dataKey } = await createHourSecurity({ pin: "123456" });
  const records = await encryptHourProfiles(
    [
      {
        id: "gregor-strazar",
        name: "Gregor Stražar",
        weekdayRateCents: 1500,
        bonusCents: 2500
      }
    ],
    dataKey
  );

  const serialized = JSON.stringify(records);
  assert.equal(serialized.includes("Gregor"), false);
  assert.equal(serialized.includes("1500"), false);
  assert.equal(serialized.includes("2500"), false);

  const pinKey = await unlockHourDataKey(config, "123456");
  assert.equal((await decryptHourProfiles(records, pinKey))[0].name, "Gregor Stražar");
});

test("napačen PIN ne odklene profilov", async () => {
  const { config } = await createHourSecurity({ pin: "123456" });
  await assert.rejects(() => unlockHourDataKey(config, "000000"), /PIN ni pravilen/);
});

test("po spremembi velja nov PIN, stari pa ne več", async () => {
  const { config, dataKey } = await createHourSecurity({ pin: "123456" });
  const updated = await replaceHourPin(config, dataKey, "654321");
  await assert.rejects(() => unlockHourDataKey(updated, "123456"), /PIN ni pravilen/);
  const nextKey = await unlockHourDataKey(updated, "654321");
  const records = await encryptHourProfiles([{ name: "Ana Novak" }], dataKey);
  assert.equal((await decryptHourProfiles(records, nextKey))[0].name, "Ana Novak");
});

test("sprememba PIN-a odstrani stare podatke varnostnega vprašanja", async () => {
  const { config, dataKey } = await createHourSecurity({ pin: "123456" });
  const legacyConfig = {
    ...config,
    recoveryQuestion: "Staro vprašanje",
    recoverySalt: "c3RhcmEgc29s",
    recoveryWrap: { iv: "aXY=", ciphertext: "cG9kYXRraQ==" }
  };
  const updated = await replaceHourPin(legacyConfig, dataKey, "654321");
  assert.equal("recoveryQuestion" in updated, false);
  assert.equal("recoverySalt" in updated, false);
  assert.equal("recoveryWrap" in updated, false);
});

test("nova nastavitev ne shranjuje varnostnega vprašanja", async () => {
  const { config } = await createHourSecurity({ pin: "123456" });
  assert.equal("recoveryQuestion" in config, false);
  assert.equal("recoveryWrap" in config, false);
});

test("prva nastavitev zahteva samo PIN in njegovo potrditev", () => {
  const html = renderHourReportsWorkspace({
    batch: null,
    selectedReport: null,
    security: {
      status: "unconfigured",
      screen: "setup",
      configured: false,
      error: "",
      failedAttempts: 0,
      remainingSeconds: 0
    },
    saveState: {
      kind: "locked",
      label: "Ni nastavljeno",
      detail: "Nastavi PIN"
    },
    disabledAttr: "",
    toolsPanelOpen: false,
    renderEvidenceTabs: () => "<nav>Evidence</nav>",
    renderDocumentCommands: () => "",
    renderUnsavedPrompt: () => "",
    icon: (name) => `<i>${name}</i>`,
    escapeHtml: (value) => String(value),
    formatCurrency: (value) => String(value)
  });

  assert.match(html, /data-hour-security-setup/);
  assert.match(html, /name="pinConfirmation"/);
  assert.match(html, /data-hour-security-action="disable-pin-confirm"/);
  assert.doesNotMatch(html, /Varnostno vprašanje|Varnostni odgovor/);
});

test("zaklenjeni pogled ne izriše resničnih podatkov poročila", () => {
  const html = renderHourReportsWorkspace({
    batch: {
      fileName: "zasebno.xlsx",
      reports: [{ id: "1", personName: "Zelo Zasebno Ime", rows: [] }]
    },
    selectedReport: {
      id: "1",
      personName: "Zelo Zasebno Ime",
      rows: []
    },
    security: {
      status: "locked",
      screen: "unlock",
      configured: true,
      error: "",
      failedAttempts: 0,
      remainingSeconds: 0
    },
    saveState: {
      kind: "locked",
      label: "Zaklenjeno",
      detail: "Za dostop vnesi PIN"
    },
    disabledAttr: "",
    toolsPanelOpen: false,
    renderEvidenceTabs: () => "<nav>Evidence</nav>",
    renderDocumentCommands: () => "",
    renderUnsavedPrompt: () => "",
    icon: (name) => `<i>${name}</i>`,
    escapeHtml: (value) => String(value),
    formatCurrency: (value) => String(value)
  });

  assert.equal(html.includes("Zelo Zasebno Ime"), false);
  assert.equal(html.includes("zasebno.xlsx"), false);
  assert.match(html, /data-hour-security-unlock/);
  assert.match(html, /hour-security-preview/);
  assert.match(html, /data-hour-security-action="reset-confirm"/);
});
