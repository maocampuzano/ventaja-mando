// Service worker de la web del líder: guarda la aplicación para que abra sin señal. No guarda nada de la base de
// datos ni de otros sitios: solo los archivos de la propia aplicación (mismo origen, GET).
const CACHE = "comando-app-v1";
const BASICOS = ["/", "/manifest.webmanifest", "/icono-192.png", "/icono-512.png", "/apple-touch-icon.png", "/favicon.ico"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASICOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const r = e.request;
  const url = new URL(r.url);
  if (r.method !== "GET" || url.origin !== self.location.origin) return;
  if (r.mode === "navigate") {
    // La página: primero la red (para tener la última versión); sin señal, la guardada.
    e.respondWith(fetch(r).then((resp) => { const copia = resp.clone(); caches.open(CACHE).then((c) => c.put("/", copia)); return resp; })
      .catch(() => caches.match("/")));
    return;
  }
  // Los archivos de la aplicación llevan su versión en el nombre: si ya están guardados, no cambian.
  e.respondWith(caches.match(r).then((guardado) => guardado || fetch(r).then((resp) => {
    if (resp.ok && (url.pathname.startsWith("/_expo/") || url.pathname.startsWith("/assets/") || /\.(png|ico|ttf|woff2?)$/.test(url.pathname))) {
      const copia = resp.clone();
      caches.open(CACHE).then((c) => c.put(r, copia));
    }
    return resp;
  })));
});
