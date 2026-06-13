const DB_NAME = "predlog-nakupa-db";
const DB_VERSION = 3;
const STORES = {
  proposals: "proposals",
  materialIssues: "materialIssues",
  attendanceSheets: "attendanceSheets",
  attachments: "attachments",
  assets: "assets"
};

let dbPromise;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
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

export async function saveProposalBundle(proposal, { attachment = null, deleteAttachmentIds = [] } = {}) {
  if (
    attachment &&
    (attachment.id !== proposal.offerAttachmentId || attachment.documentId !== proposal.id)
  ) {
    throw new Error("Priponka ni pravilno povezana z dokumentom.");
  }

  const db = await openDatabase();
  const tx = db.transaction([STORES.proposals, STORES.attachments], "readwrite");
  const done = transactionDone(tx);
  const proposalStore = tx.objectStore(STORES.proposals);
  const attachmentStore = tx.objectStore(STORES.attachments);

  proposalStore.put(proposal);
  if (attachment) attachmentStore.put(attachment);

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
  const db = await openDatabase();
  const tx = db.transaction(STORES.attachments, "readwrite");
  tx.objectStore(STORES.attachments).put(attachment);
  await transactionDone(tx);
  return attachment;
}

export async function getAttachment(id) {
  if (!id) return null;
  const db = await openDatabase();
  return requestToPromise(db.transaction(STORES.attachments).objectStore(STORES.attachments).get(id));
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
  return requestToPromise(db.transaction(STORES.assets).objectStore(STORES.assets).get(id));
}

export async function saveAsset(asset) {
  const db = await openDatabase();
  const tx = db.transaction(STORES.assets, "readwrite");
  tx.objectStore(STORES.assets).put(asset);
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
