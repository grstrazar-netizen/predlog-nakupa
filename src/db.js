const DB_NAME = "predlog-nakupa-db";
const DB_VERSION = 5;
const STORES = {
  proposals: "proposals",
  materialIssues: "materialIssues",
  attendanceSheets: "attendanceSheets",
  hourProfiles: "hourProfiles",
  calendarEvents: "calendarEvents",
  attachments: "attachments",
  assets: "assets"
};

const BACKUP_STORE_NAMES = Object.values(STORES);

let dbPromise;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("Lokalnega shranjevanja podatkov ni bilo mogoče dokončati."));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    const rejectTransaction = () =>
      reject(
        transaction.error ||
          new Error("Lokalnega shranjevanja podatkov ni bilo mogoče dokončati.")
      );
    transaction.onerror = rejectTransaction;
    transaction.onabort = rejectTransaction;
  });
}

async function binaryRecordForStorage(record) {
  if (!record?.blob || !(record.blob instanceof Blob)) return record;
  return {
    ...record,
    blob: await record.blob.arrayBuffer()
  };
}

function binaryRecordForUse(record) {
  if (!record?.blob || record.blob instanceof Blob) return record;
  if (record.blob instanceof ArrayBuffer || ArrayBuffer.isView(record.blob)) {
    return {
      ...record,
      blob: new Blob([record.blob], { type: record.mimeType || "application/octet-stream" })
    };
  }
  return record;
}

export function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORES.proposals)) {
        const store = db.createObjectStore(STORES.proposals, { keyPath: "id" });
        store.createIndex("serial", "serial", { unique: true });
        store.createIndex("year", "year", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.materialIssues)) {
        const store = db.createObjectStore(STORES.materialIssues, { keyPath: "id" });
        store.createIndex("serial", "serial", { unique: true });
        store.createIndex("year", "year", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.attendanceSheets)) {
        const store = db.createObjectStore(STORES.attendanceSheets, { keyPath: "id" });
        store.createIndex("eventDate", "eventDate", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.hourProfiles)) {
        const store = db.createObjectStore(STORES.hourProfiles, { keyPath: "id" });
        store.createIndex("name", "name", { unique: false });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.calendarEvents)) {
        const store = db.createObjectStore(STORES.calendarEvents, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.attachments)) {
        const store = db.createObjectStore(STORES.attachments, { keyPath: "id" });
        store.createIndex("documentId", "documentId", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.assets)) {
        db.createObjectStore(STORES.assets, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

export async function getAllProposals() {
  const db = await openDatabase();
  return requestToPromise(db.transaction(STORES.proposals).objectStore(STORES.proposals).getAll());
}

export async function saveProposal(proposal) {
  const db = await openDatabase();
  const tx = db.transaction(STORES.proposals, "readwrite");
  tx.objectStore(STORES.proposals).put(proposal);
  await transactionDone(tx);
  return proposal;
}

export async function getAllMaterialIssues() {
  const db = await openDatabase();
  return requestToPromise(
    db.transaction(STORES.materialIssues).objectStore(STORES.materialIssues).getAll()
  );
}

export async function saveMaterialIssue(issue) {
  const db = await openDatabase();
  const tx = db.transaction(STORES.materialIssues, "readwrite");
  tx.objectStore(STORES.materialIssues).put(issue);
  await transactionDone(tx);
  return issue;
}

export async function deleteMaterialIssue(id) {
  if (!id) return;
  const db = await openDatabase();
  const tx = db.transaction(STORES.materialIssues, "readwrite");
  tx.objectStore(STORES.materialIssues).delete(id);
  await transactionDone(tx);
}

export async function getAllAttendanceSheets() {
  const db = await openDatabase();
  return requestToPromise(
    db.transaction(STORES.attendanceSheets).objectStore(STORES.attendanceSheets).getAll()
  );
}

export async function saveAttendanceSheet(sheet) {
  const db = await openDatabase();
  const tx = db.transaction(STORES.attendanceSheets, "readwrite");
  tx.objectStore(STORES.attendanceSheets).put(sheet);
  await transactionDone(tx);
  return sheet;
}

export async function saveAttendanceSheets(sheets) {
  const db = await openDatabase();
  const tx = db.transaction(STORES.attendanceSheets, "readwrite");
  const store = tx.objectStore(STORES.attendanceSheets);
  sheets.forEach((sheet) => store.put(sheet));
  await transactionDone(tx);
  return sheets;
}

export async function deleteAttendanceSheet(id) {
  if (!id) return;
  const db = await openDatabase();
  const tx = db.transaction(STORES.attendanceSheets, "readwrite");
  tx.objectStore(STORES.attendanceSheets).delete(id);
  await transactionDone(tx);
}

export async function getAllHourProfiles() {
  const db = await openDatabase();
  return requestToPromise(
    db.transaction(STORES.hourProfiles).objectStore(STORES.hourProfiles).getAll()
  );
}

export async function getAllCalendarEvents() {
  const db = await openDatabase();
  return requestToPromise(
    db.transaction(STORES.calendarEvents).objectStore(STORES.calendarEvents).getAll()
  );
}

export async function saveCalendarEvent(event) {
  const db = await openDatabase();
  const tx = db.transaction(STORES.calendarEvents, "readwrite");
  tx.objectStore(STORES.calendarEvents).put(event);
  await transactionDone(tx);
  return event;
}

export async function deleteCalendarEvent(id) {
  if (!id) return;
  const db = await openDatabase();
  const tx = db.transaction(STORES.calendarEvents, "readwrite");
  tx.objectStore(STORES.calendarEvents).delete(id);
  await transactionDone(tx);
}

export async function saveHourProfile(profile) {
  const db = await openDatabase();
  const tx = db.transaction(STORES.hourProfiles, "readwrite");
  tx.objectStore(STORES.hourProfiles).put(profile);
  await transactionDone(tx);
  return profile;
}

export async function saveHourSecurityBundle(securityAsset, encryptedProfiles) {
  if (!securityAsset?.id) throw new Error("Varnostna nastavitev nima identifikatorja.");
  const db = await openDatabase();
  const tx = db.transaction([STORES.assets, STORES.hourProfiles], "readwrite");
  const done = transactionDone(tx);
  const profileStore = tx.objectStore(STORES.hourProfiles);
  tx.objectStore(STORES.assets).put(securityAsset);
  profileStore.clear();
  (encryptedProfiles || []).forEach((profile) => profileStore.put(profile));
  await done;
  return securityAsset;
}

export async function clearHourSecurityData(securityAssetId) {
  const db = await openDatabase();
  const tx = db.transaction([STORES.assets, STORES.hourProfiles], "readwrite");
  const done = transactionDone(tx);
  tx.objectStore(STORES.hourProfiles).clear();
  if (securityAssetId) tx.objectStore(STORES.assets).delete(securityAssetId);
  await done;
}

export async function saveProposalBundle(proposal, { attachment = null, deleteAttachmentIds = [] } = {}) {
  if (
    attachment &&
    (attachment.id !== proposal.offerAttachmentId || attachment.documentId !== proposal.id)
  ) {
    throw new Error("Priponka ni pravilno povezana z dokumentom.");
  }

  const storedAttachment = await binaryRecordForStorage(attachment);

  const db = await openDatabase();
  const tx = db.transaction([STORES.proposals, STORES.attachments], "readwrite");
  const done = transactionDone(tx);
  const proposalStore = tx.objectStore(STORES.proposals);
  const attachmentStore = tx.objectStore(STORES.attachments);

  proposalStore.put(proposal);
  if (storedAttachment) attachmentStore.put(storedAttachment);

  [...new Set(deleteAttachmentIds.filter(Boolean))]
    .filter((id) => id !== attachment?.id)
    .forEach((id) => attachmentStore.delete(id));

  await done;
  return proposal;
}

export async function deleteProposal(id) {
  if (!id) return;
  const db = await openDatabase();
  const tx = db.transaction(STORES.proposals, "readwrite");
  tx.objectStore(STORES.proposals).delete(id);
  await transactionDone(tx);
}

export async function deleteProposalBundle(proposal) {
  if (!proposal?.id) return;
  const db = await openDatabase();
  const tx = db.transaction([STORES.proposals, STORES.attachments], "readwrite");
  const done = transactionDone(tx);
  tx.objectStore(STORES.proposals).delete(proposal.id);
  if (proposal.offerAttachmentId) {
    tx.objectStore(STORES.attachments).delete(proposal.offerAttachmentId);
  }
  await done;
}

export async function saveAttachment(attachment) {
  const storedAttachment = await binaryRecordForStorage(attachment);
  const db = await openDatabase();
  const tx = db.transaction(STORES.attachments, "readwrite");
  tx.objectStore(STORES.attachments).put(storedAttachment);
  await transactionDone(tx);
  return attachment;
}

export async function getAttachment(id) {
  if (!id) return null;
  const db = await openDatabase();
  return binaryRecordForUse(
    await requestToPromise(db.transaction(STORES.attachments).objectStore(STORES.attachments).get(id))
  );
}

export async function deleteAttachment(id) {
  if (!id) return;
  const db = await openDatabase();
  const tx = db.transaction(STORES.attachments, "readwrite");
  tx.objectStore(STORES.attachments).delete(id);
  await transactionDone(tx);
}

export async function deleteOrphanAttachments() {
  const db = await openDatabase();
  const readTx = db.transaction([STORES.proposals, STORES.attachments], "readonly");
  const readDone = transactionDone(readTx);
  const [proposals, attachments] = await Promise.all([
    requestToPromise(readTx.objectStore(STORES.proposals).getAll()),
    requestToPromise(readTx.objectStore(STORES.attachments).getAll())
  ]);
  await readDone;

  const attachmentIds = new Set(attachments.map((attachment) => attachment.id));
  const referencedIds = new Set(proposals.map((proposal) => proposal.offerAttachmentId).filter(Boolean));
  const orphanIds = attachments
    .filter((attachment) => !referencedIds.has(attachment.id))
    .map((attachment) => attachment.id);
  const proposalsWithMissingAttachments = proposals.filter(
    (proposal) => proposal.offerAttachmentId && !attachmentIds.has(proposal.offerAttachmentId)
  );

  if (!orphanIds.length && !proposalsWithMissingAttachments.length) return orphanIds;

  const writeTx = db.transaction([STORES.proposals, STORES.attachments], "readwrite");
  const writeDone = transactionDone(writeTx);
  const proposalStore = writeTx.objectStore(STORES.proposals);
  const attachmentStore = writeTx.objectStore(STORES.attachments);
  orphanIds.forEach((id) => attachmentStore.delete(id));
  proposalsWithMissingAttachments.forEach((proposal) => {
    proposalStore.put({ ...proposal, offerAttachmentId: "" });
  });
  await writeDone;
  return orphanIds;
}

export async function getAsset(id) {
  const db = await openDatabase();
  return binaryRecordForUse(
    await requestToPromise(db.transaction(STORES.assets).objectStore(STORES.assets).get(id))
  );
}

export async function saveAsset(asset) {
  const storedAsset = await binaryRecordForStorage(asset);
  const db = await openDatabase();
  const tx = db.transaction(STORES.assets, "readwrite");
  tx.objectStore(STORES.assets).put(storedAsset);
  await transactionDone(tx);
  return asset;
}

export async function deleteAsset(id) {
  if (!id) return;
  const db = await openDatabase();
  const tx = db.transaction(STORES.assets, "readwrite");
  tx.objectStore(STORES.assets).delete(id);
  await transactionDone(tx);
}

export async function getDatabaseBackupSnapshot({ excludeAssetIds = [] } = {}) {
  const db = await openDatabase();
  const tx = db.transaction(BACKUP_STORE_NAMES, "readonly");
  const done = transactionDone(tx);
  const entries = await Promise.all(
    BACKUP_STORE_NAMES.map(async (storeName) => [
      storeName,
      await requestToPromise(tx.objectStore(storeName).getAll())
    ])
  );
  await done;

  const excludedAssets = new Set(excludeAssetIds.filter(Boolean));
  const stores = Object.fromEntries(entries);
  stores[STORES.assets] = (stores[STORES.assets] || []).filter(
    (asset) => !excludedAssets.has(asset?.id)
  );
  return stores;
}

export async function replaceDatabaseFromBackup(
  stores,
  { preserveAssetIds = [] } = {}
) {
  if (!stores || typeof stores !== "object") {
    throw new Error("Varnostna kopija ne vsebuje veljavnih podatkov.");
  }

  const restoredStores = { ...stores };
  for (const storeName of [STORES.attachments, STORES.assets]) {
    const records = Array.isArray(stores[storeName]) ? stores[storeName] : [];
    restoredStores[storeName] = await Promise.all(records.map(binaryRecordForStorage));
  }

  const db = await openDatabase();
  const preservedAssets = [];
  for (const assetId of preserveAssetIds.filter(Boolean)) {
    const asset = await requestToPromise(
      db.transaction(STORES.assets).objectStore(STORES.assets).get(assetId)
    );
    if (asset) preservedAssets.push(asset);
  }

  const tx = db.transaction(BACKUP_STORE_NAMES, "readwrite");
  const done = transactionDone(tx);
  for (const storeName of BACKUP_STORE_NAMES) {
    const store = tx.objectStore(storeName);
    store.clear();
    const records = Array.isArray(restoredStores[storeName]) ? restoredStores[storeName] : [];
    records.forEach((record) => store.put(record));
  }
  const assetStore = tx.objectStore(STORES.assets);
  preservedAssets.forEach((asset) => assetStore.put(asset));
  await done;
}
