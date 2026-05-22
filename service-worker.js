const CACHE_NAME = "predlog-nakupa-v38";
const ASSETS = [
  "/",
  "/index.html",
  "/src/app.js",
  "/src/db.js",
  "/src/pdf.js",
  "/src/utils.js",
  "/src/styles.css",
  "/manifest.webmanifest",
  "/icon.svg",
  "/assets/center-rog-logo.svg"
];

const CACHEABLE_ORIGINS = new Set([
  self.location.origin,
  "https://cdn.jsdelivr.net",
  "https://unpkg.com"
]);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
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
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (!CACHEABLE_ORIGINS.has(url.origin)) return;
  event.respondWith(handleFetch(event.request));
});
