export const HOUR_SECURITY_ASSET_ID = "hour-report-security-v1";
export const HOUR_SECURITY_VERSION = 1;
export const HOUR_SECURITY_ITERATIONS = 210_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function cryptoApi() {
  const api = globalThis.crypto;
  if (!api?.subtle || !api?.getRandomValues) {
    throw new Error("Ta brskalnik ne podpira varnega lokalnega šifriranja.");
  }
  return api;
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  cryptoApi().getRandomValues(bytes);
  return bytes;
}

function randomId() {
  return cryptoApi().randomUUID?.() || bytesToBase64(randomBytes(18)).replace(/[+/=]/g, "");
}

export function validateHourPin(pin) {
  return /^\d{6}$/.test(String(pin || ""));
}

async function deriveWrappingKey(secret, salt, iterations) {
  const material = await cryptoApi().subtle.importKey(
    "raw",
    encoder.encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return cryptoApi().subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations
    },
    material,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
}

async function wrapRawDataKey(rawDataKey, secret, salt, iterations) {
  const wrappingKey = await deriveWrappingKey(secret, salt, iterations);
  const iv = randomBytes(12);
  const ciphertext = await cryptoApi().subtle.encrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    rawDataKey
  );
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  };
}

async function unwrapRawDataKey(wrapper, secret, salt, iterations) {
  const wrappingKey = await deriveWrappingKey(secret, salt, iterations);
  return cryptoApi().subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(wrapper.iv) },
    wrappingKey,
    base64ToBytes(wrapper.ciphertext)
  );
}

async function importDataKey(rawDataKey) {
  return cryptoApi().subtle.importKey(
    "raw",
    rawDataKey,
    {
      name: "AES-GCM",
      length: 256
    },
    true,
    ["encrypt", "decrypt"]
  );
}

async function exportDataKey(dataKey) {
  return cryptoApi().subtle.exportKey("raw", dataKey);
}

export async function createHourSecurity({ pin }) {
  if (!validateHourPin(pin)) {
    throw new Error("PIN mora vsebovati natanko šest številk.");
  }

  const rawDataKey = randomBytes(32);
  const pinSalt = randomBytes(16);
  const now = new Date().toISOString();
  const config = {
    id: HOUR_SECURITY_ASSET_ID,
    type: "hour-report-security",
    version: HOUR_SECURITY_VERSION,
    iterations: HOUR_SECURITY_ITERATIONS,
    pinSalt: bytesToBase64(pinSalt),
    pinWrap: await wrapRawDataKey(
      rawDataKey,
      String(pin),
      pinSalt,
      HOUR_SECURITY_ITERATIONS
    ),
    createdAt: now,
    updatedAt: now
  };

  return {
    config,
    dataKey: await importDataKey(rawDataKey)
  };
}

export async function unlockHourDataKey(config, pin) {
  if (!config || config.version !== HOUR_SECURITY_VERSION) {
    throw new Error("Zaščite poročil ni mogoče prebrati.");
  }
  const normalizedPin = String(pin || "");
  if (!normalizedPin) throw new Error("Vnesi šestmestni PIN.");

  try {
    const rawDataKey = await unwrapRawDataKey(
      config.pinWrap,
      normalizedPin,
      base64ToBytes(config.pinSalt),
      config.iterations || HOUR_SECURITY_ITERATIONS
    );
    return importDataKey(rawDataKey);
  } catch {
    throw new Error("PIN ni pravilen.");
  }
}

export async function replaceHourPin(config, dataKey, newPin) {
  if (!validateHourPin(newPin)) {
    throw new Error("PIN mora vsebovati natanko šest številk.");
  }
  const pinSalt = randomBytes(16);
  const rawDataKey = await exportDataKey(dataKey);
  const {
    recoveryQuestion: _recoveryQuestion,
    recoverySalt: _recoverySalt,
    recoveryWrap: _recoveryWrap,
    ...configWithoutLegacyRecovery
  } = config;
  return {
    ...configWithoutLegacyRecovery,
    pinSalt: bytesToBase64(pinSalt),
    pinWrap: await wrapRawDataKey(
      rawDataKey,
      String(newPin),
      pinSalt,
      config.iterations || HOUR_SECURITY_ITERATIONS
    ),
    updatedAt: new Date().toISOString()
  };
}

export function isEncryptedHourProfileRecord(record) {
  return (
    record?.recordType === "encrypted-hour-profile" &&
    record?.version === HOUR_SECURITY_VERSION &&
    typeof record.iv === "string" &&
    typeof record.ciphertext === "string"
  );
}

export async function encryptHourProfiles(profiles, dataKey) {
  return Promise.all(
    (profiles || []).map(async (profile) => {
      const iv = randomBytes(12);
      const ciphertext = await cryptoApi().subtle.encrypt(
        { name: "AES-GCM", iv },
        dataKey,
        encoder.encode(JSON.stringify(profile))
      );
      return {
        id: randomId(),
        recordType: "encrypted-hour-profile",
        version: HOUR_SECURITY_VERSION,
        iv: bytesToBase64(iv),
        ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
        updatedAt: new Date().toISOString()
      };
    })
  );
}

export async function decryptHourProfiles(records, dataKey) {
  return Promise.all(
    (records || []).map(async (record) => {
      if (!isEncryptedHourProfileRecord(record)) {
        throw new Error("Profil urnih postavk ni shranjen v pričakovani obliki.");
      }
      try {
        const plaintext = await cryptoApi().subtle.decrypt(
          { name: "AES-GCM", iv: base64ToBytes(record.iv) },
          dataKey,
          base64ToBytes(record.ciphertext)
        );
        return JSON.parse(decoder.decode(plaintext));
      } catch {
        throw new Error("Šifriranih profilov urnih postavk ni mogoče odpreti.");
      }
    })
  );
}
