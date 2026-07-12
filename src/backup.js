export const BACKUP_CONFIG_ASSET_ID = "center-rog-backup-config-v1";
export const BACKUP_FORMAT = "center-rog-evidence-backup";
export const BACKUP_VERSION = 1;
export const BACKUP_HOUR = 19;
export const BACKUP_MINUTE = 30;
export const BACKUP_ITERATIONS = 210_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function cryptoApi() {
  const api = globalThis.crypto;
  if (!api?.subtle || !api?.getRandomValues) {
    throw new Error("Ta brskalnik ne podpira varnega šifriranja varnostnih kopij.");
  }
  return api;
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  cryptoApi().getRandomValues(bytes);
  return bytes;
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(value, "base64"));
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveBackupKey(password, salt, iterations = BACKUP_ITERATIONS) {
  const material = await cryptoApi().subtle.importKey(
    "raw",
    encoder.encode(String(password)),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return cryptoApi().subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encodeBackupValue(value) {
  if (value instanceof Blob) {
    return {
      __backupType: "Blob",
      mimeType: value.type || "application/octet-stream",
      data: bytesToBase64(new Uint8Array(await value.arrayBuffer()))
    };
  }
  if (value instanceof Date) {
    return { __backupType: "Date", value: value.toISOString() };
  }
  if (value instanceof ArrayBuffer) {
    return { __backupType: "ArrayBuffer", data: bytesToBase64(new Uint8Array(value)) };
  }
  if (ArrayBuffer.isView(value)) {
    return {
      __backupType: "TypedArray",
      constructor: value.constructor.name,
      data: bytesToBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
    };
  }
  if (Array.isArray(value)) return Promise.all(value.map(encodeBackupValue));
  if (value && typeof value === "object") {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, child]) => [key, await encodeBackupValue(child)])
    );
    return Object.fromEntries(entries);
  }
  return value;
}

function typedArrayFromName(name, bytes) {
  const constructors = {
    Uint8Array,
    Uint16Array,
    Uint32Array,
    Int8Array,
    Int16Array,
    Int32Array,
    Float32Array,
    Float64Array
  };
  const Constructor = constructors[name] || Uint8Array;
  return new Constructor(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function decodeBackupValue(value) {
  if (Array.isArray(value)) return value.map(decodeBackupValue);
  if (!value || typeof value !== "object") return value;
  if (value.__backupType === "Blob") {
    return new Blob([base64ToBytes(value.data)], { type: value.mimeType });
  }
  if (value.__backupType === "Date") return new Date(value.value);
  if (value.__backupType === "ArrayBuffer") return base64ToBytes(value.data).buffer;
  if (value.__backupType === "TypedArray") {
    return typedArrayFromName(value.constructor, base64ToBytes(value.data));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, decodeBackupValue(child)])
  );
}

export function validateBackupPassword(password) {
  return String(password || "").length >= 8;
}

export function supportsDirectoryBackup(scope = globalThis) {
  return typeof scope.showDirectoryPicker === "function";
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function backupFileName(date = new Date()) {
  return `center-rog-evidence-${localDateKey(date)}.backup`;
}

export function backupIsDue(config, now = new Date()) {
  if (!config?.encryptionKey) return false;
  if (config.lastBackupDate === localDateKey(now)) return false;
  const due = new Date(now);
  due.setHours(BACKUP_HOUR, BACKUP_MINUTE, 0, 0);
  return now >= due;
}

export function millisecondsUntilBackup(now = new Date()) {
  const due = new Date(now);
  due.setHours(BACKUP_HOUR, BACKUP_MINUTE, 0, 0);
  if (due <= now) due.setDate(due.getDate() + 1);
  return Math.max(1_000, due.getTime() - now.getTime());
}

export async function createBackupEncryption(password, { iterations = BACKUP_ITERATIONS } = {}) {
  if (!validateBackupPassword(password)) {
    throw new Error("Geslo za varnostno kopijo naj vsebuje vsaj 8 znakov.");
  }
  const salt = randomBytes(16);
  return {
    encryptionKey: await deriveBackupKey(password, salt, iterations),
    salt: bytesToBase64(salt),
    iterations
  };
}

export async function createEncryptedBackup(
  stores,
  { encryptionKey, salt, iterations = BACKUP_ITERATIONS, createdAt = new Date().toISOString() }
) {
  if (!encryptionKey || !salt) throw new Error("Zaščita varnostne kopije ni nastavljena.");
  const payload = await encodeBackupValue({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt,
    stores
  });
  const iv = randomBytes(12);
  const ciphertext = await cryptoApi().subtle.encrypt(
    { name: "AES-GCM", iv },
    encryptionKey,
    encoder.encode(JSON.stringify(payload))
  );
  const envelope = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    encrypted: true,
    createdAt,
    iterations,
    salt,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  };
  return new Blob([JSON.stringify(envelope)], { type: "application/x-center-rog-backup" });
}

export async function decryptBackupFile(file, password) {
  let envelope;
  try {
    envelope = JSON.parse(await file.text());
  } catch {
    throw new Error("Izbrana datoteka ni veljavna varnostna kopija.");
  }
  if (
    envelope?.format !== BACKUP_FORMAT ||
    envelope?.version !== BACKUP_VERSION ||
    !envelope?.encrypted
  ) {
    throw new Error("Ta oblika varnostne kopije ni podprta.");
  }
  try {
    const key = await deriveBackupKey(
      password,
      base64ToBytes(envelope.salt),
      envelope.iterations || BACKUP_ITERATIONS
    );
    const plaintext = await cryptoApi().subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(envelope.iv) },
      key,
      base64ToBytes(envelope.ciphertext)
    );
    const payload = decodeBackupValue(JSON.parse(decoder.decode(plaintext)));
    if (payload?.format !== BACKUP_FORMAT || !payload?.stores) throw new Error("invalid");
    return payload;
  } catch {
    throw new Error("Geslo ni pravilno ali pa je varnostna kopija poškodovana.");
  }
}

export async function directoryPermission(directoryHandle, { request = false } = {}) {
  if (!directoryHandle) return "unsupported";
  const options = { mode: "readwrite" };
  const current = await directoryHandle.queryPermission?.(options);
  if (current === "granted" || !request) return current || "prompt";
  return (await directoryHandle.requestPermission?.(options)) || "prompt";
}

export async function writeBackupFile(directoryHandle, fileName, blob) {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}
