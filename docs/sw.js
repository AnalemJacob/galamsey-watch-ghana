const prefix = "galamsey-watch:" + self.registration.scope + ":";
const cacheName = prefix + "v7";
const files = [
  "./index.html", "./style.css?v=7", "./app.js", "./model.js", "./maps.js", "./storage.js",
  "./volunteer.js?v=7", "./volunteer-imagery.js",
  "./manifest.webmanifest", "./assets/mark.svg", "./assets/bricolage.woff2", "./assets/instrument.woff2",
  "./vendor/leaflet.js", "./vendor/leaflet.css", "./vendor/images/marker-icon.png",
  "./vendor/images/marker-icon-2x.png", "./vendor/images/marker-shadow.png",
  "./data/neighbors.geojson", "./data/regions.geojson", "./data/rivers.geojson", "./data/southern-rivers.geojson",
  "./data/lakes.geojson", "./data/labels.json", "./data/examples.json", "./data/SOURCES.txt"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(files.map(url => new Request(url, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith(prefix) && key !== cacheName)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || !request.url.startsWith(self.registration.scope) ||
      new URL(request.url).pathname.startsWith(new URL("api/", self.registration.scope).pathname)) return;
  event.respondWith(caches.open(cacheName).then(async cache => {
    if (request.mode === "navigate") {
      try {
        return await fetch(request, { cache: "no-cache" });
      } catch {
        return (await cache.match(new URL("index.html", self.registration.scope))) || Response.error();
      }
    }
    const saved = await cache.match(request);
    return saved || fetch(request);
  }));
});
