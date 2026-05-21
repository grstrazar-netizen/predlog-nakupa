const DB_NAME = "predlog-nakupa-db";
const DB_VERSION = 1;
const STORES = {
  proposals: "proposals",
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
