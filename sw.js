// sw.js — Clínica App (PWA)
const CACHE_NAME = "clinica-cache-52"; // <-- mude a versão sempre que alterar arquivos estáticos
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  // JS modularizado
  "./js/helpers.js",
  "./js/pacientes.js",
  "./js/agenda.js",
  "./js/fiscal.js",
  "./js/nfe.js",
  "./js/main.js",
];

// ===== INSTALAÇÃO =====
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
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
  const { request } = event;

  // Nunca cachear chamadas da API (Google Apps Script)
  const isAppsScript = /script\.google\.com\/macros\/s\/.*\/exec/i.test(request.url);

  // Só tratamos GET
  if (request.method !== "GET") {
    if (isAppsScript) return; // deixa ir direto
    return;                   // demais métodos também direto
  }

  // Navegação SPA: network-first com fallback offline
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Requests à API: nunca cachear
  if (isAppsScript) {
    event.respondWith(fetch(request));
    return;
  }

  // Estáticos do próprio site: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((resp) => {
        // cacheia somente respostas básicas (mesma origem) de arquivos estáticos
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return resp;
      }).catch(() => {
        // fallback para navegação se offline
        if (request.mode === "navigate") return caches.match("./index.html");
      });
    })
  );
});

// (Opcional) permitir forçar a ativação via postMessage
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
