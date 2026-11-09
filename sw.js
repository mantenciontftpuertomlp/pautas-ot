// Pautas OT 1.29: guarda la app para usarla sin internet
const CACHE = "pautasot-1.29-09a16adc";
const ARCHIVOS = ["./", "app.js", "estilo.css", "icon/icon-180.png", "icon/icon-192.png", "icon/icon-512.png", "index.html", "lib/jspdf.umd.min.js", "lib/pdf.min.js", "lib/pdf.worker.min.js", "manifest.webmanifest", "motor.js"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => { if (e.request.method !== "GET") return; e.respondWith(caches.match(e.request, {ignoreSearch: true}).then(r => r || fetch(e.request))); });
