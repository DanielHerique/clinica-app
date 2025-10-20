// sw.js — Clínica App (Google Sheets + PWA)
const CACHE_NAME = "clinica-cache-v7"; // << troque a versão sempre que alterar app.js/css
const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

// ===== INSTALAÇÃO =====
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(FILES_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// ===== ATIVAÇÃO =====
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    ).then(() => self.clients.claim())
  );
});

// ===== FETCH =====
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((cached) => cached || fetch(event.request))
      .catch(() => {
        // fallback para navegação se estiver offline
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
      })
  );
});
