/// <reference lib="webworker" />
export {};
declare const self: ServiceWorkerGlobalScope;
const CACHE = "until-__VERSION__";
const ASSETS: string[] = __ASSETS__;
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith("until-") && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("chatgpt")
  )
    return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        async () =>
          (await caches.match("/")) ||
          new Response("Open Until online once before using it offline.", {
            status: 503,
          }),
      ),
    );
    return;
  }
  if (ASSETS.includes(url.pathname))
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request)),
    );
});
declare const __ASSETS__: string[];
