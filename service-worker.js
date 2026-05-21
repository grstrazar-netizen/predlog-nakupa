const CACHE_NAME = "predlog-nakupa-v36";
const ASSETS = [
  "/",
  "/index.html",
  "/src/app.js",
  "/src/db.js",
  "/src/pdf.js",
  "/src/utils.js",
  "/src/styles.css",
  "/vendor/pdf-lib.min.js",
  "/vendor/lucide.min.js",
  "/manifest.webmanifest",
  "/icon.svg",
  "/assets/center-rog-logo.svg"
];

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
    if (response.ok) {
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
  if (url.origin !== self.location.origin) return;
  event.respondWith(handleFetch(event.request));
});
