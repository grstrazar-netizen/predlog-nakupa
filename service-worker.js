const CACHE_NAME = "predlog-nakupa-v74";
const CACHE_PREFIX = "predlog-nakupa-";
const IS_LOCAL_DEV = ["localhost", "127.0.0.1", "::1"].includes(self.location.hostname);
const ASSETS = [
  "/",
  "/index.html",
  "/src/app.js",
  "/src/db.js",
  "/src/pdf.js",
  "/src/document-layout.js",
  "/src/material-issue.js",
  "/src/material-issue-pdf.js",
  "/src/attendance-sheet.js",
  "/src/attendance-sheet-pdf.js",
  "/src/hour-report.js",
  "/src/hour-security.js",
  "/src/hour-report-pdf.js",
  "/src/hour-report-ui.js",
  "/src/utils.js",
  "/src/styles.css",
  "/manifest.webmanifest",
  "/icon.svg",
  "/assets/center-rog-logo.svg",
  "/assets/fonts/NotoSans-Regular.ttf",
  "/assets/fonts/NotoSans-SemiBold.ttf",
  "/assets/fonts/NotoSans-Bold.ttf",
  "/assets/fonts/NotoSans-Italic.ttf",
  "/assets/vendor/xlsx.full.min.js",
  "/assets/vendor/jszip.min.js"
];

const CACHEABLE_ORIGINS = new Set([
  self.location.origin,
  "https://cdn.jsdelivr.net",
  "https://unpkg.com"
]);

self.addEventListener("install", (event) => {
  if (IS_LOCAL_DEV) {
    event.waitUntil(self.skipWaiting());
    return;
  }

  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  if (IS_LOCAL_DEV) {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key))))
        .then(() => self.registration.unregister())
    );
    self.clients.claim();
    return;
  }

  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

async function handleFetch(request) {
  if (request.mode === "navigate") {
    try {
      return await fetch(request);
    } catch {
      return (await caches.match("/index.html")) || Response.error();
    }
  }

  const cached = await caches.match(request);

  try {
    const response = await fetch(request);
    if (response.ok || response.type === "opaque") {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return cached || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  if (IS_LOCAL_DEV) return;
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (!CACHEABLE_ORIGINS.has(url.origin)) return;
  event.respondWith(handleFetch(event.request));
});
