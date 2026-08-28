import test from "node:test";
import assert from "node:assert/strict";

import {
  backupFileName,
  backupIsDue,
  createBackupEncryption,
  createEncryptedBackup,
  decryptBackupFile,
  millisecondsUntilBackup,
  summarizeBackupStores,
  transferBackupFileName,
  validateBackupPassword
} from "../src/backup.js";

test("validates backup passwords", () => {
  assert.equal(validateBackupPassword("kratko"), false);
  assert.equal(validateBackupPassword("varno-geslo"), true);
});

test("encrypts and restores records with Blob attachments", async () => {
  const encryption = await createBackupEncryption("varno-geslo", { iterations: 1_000 });
  const stores = {
    proposals: [{ id: "proposal-1", serial: "KOV-2026-001" }],
    attachments: [
      {
        id: "attachment-1",
        fileName: "ponudba.pdf",
        blob: new Blob(["test-pdf"], { type: "application/pdf" })
      }
    ],
    assets: []
  };
  const backup = await createEncryptedBackup(stores, {
    ...encryption,
    createdAt: "2026-07-11T17:30:00.000Z"
  });
  const restored = await decryptBackupFile(backup, "varno-geslo");

  assert.equal(restored.stores.proposals[0].serial, "KOV-2026-001");
  assert.equal(restored.stores.attachments[0].blob.type, "application/pdf");
  assert.equal(await restored.stores.attachments[0].blob.text(), "test-pdf");
});

test("rejects an incorrect backup password", async () => {
  const encryption = await createBackupEncryption("pravo-geslo", { iterations: 1_000 });
  const backup = await createEncryptedBackup({ proposals: [] }, encryption);
  await assert.rejects(
    () => decryptBackupFile(backup, "napacno-geslo"),
    /Geslo ni pravilno/
  );
});

test("schedules one daily backup after 19.30", () => {
  const before = new Date(2026, 6, 11, 19, 29, 0);
  const after = new Date(2026, 6, 11, 19, 31, 0);
  const config = { encryptionKey: {}, lastBackupDate: "" };

  assert.equal(backupIsDue(config, before), false);
  assert.equal(backupIsDue(config, after), true);
  assert.equal(
    backupIsDue({ ...config, lastBackupDate: "2026-07-11" }, after),
    false
  );
  assert.equal(backupFileName(after), "center-rog-evidence-2026-07-11.backup");
  assert.ok(millisecondsUntilBackup(before) > 0);
});

test("names a transfer package separately from daily backups", () => {
  const date = new Date(2026, 7, 28, 10, 0, 0);
  assert.equal(transferBackupFileName(date), "center-rog-predaja-2026-08-28.backup");
});

test("summarizes every transferable store", () => {
  assert.deepEqual(
    summarizeBackupStores({
      proposals: [{}, {}],
      materialIssues: [{}],
      attendanceSheets: [{}, {}, {}],
      hourProfiles: [{}],
      attachments: [{}, {}],
      assets: [{}, {}]
    }),
    {
      proposals: 2,
      materialIssues: 1,
      attendanceSheets: 3,
      hourProfiles: 1,
      attachments: 2,
      settings: 2,
      documents: 7,
      totalRecords: 11
    }
  );
});
