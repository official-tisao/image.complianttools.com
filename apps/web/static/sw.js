/* global Request, Response, URL, caches, clients, fetch, self */

const VERSION = 'complianttools-shell-v1';
const CACHE_NAME = `${VERSION}-runtime`;
const IMMUTABLE_PREFIXES = ['/_app/immutable/', '/ocr-runtime/', '/wasm/', '/models/', '/fonts/'];

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function isImmutableAsset(url) {
  return (
    IMMUTABLE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)) ||
    url.pathname === '/favicon.ico'
  );
}

async function cacheResponse(request, response) {
  if (response && response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    return await cacheResponse(request, await fetch(request));
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error(`No cached response for ${request.url}`);
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  return cacheResponse(request, await fetch(request));
}

async function headFromCacheOrNetwork(request) {
  const cached = await caches.match(new Request(request.url));
  if (cached) {
    return new Response(null, { status: cached.status, headers: cached.headers });
  }
  return fetch(request);
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!['GET', 'HEAD'].includes(request.method) || !isSameOrigin(request)) return;

  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  } else if (request.method === 'HEAD' && isImmutableAsset(url)) {
    event.respondWith(headFromCacheOrNetwork(request));
  } else if (isImmutableAsset(url)) {
    event.respondWith(cacheFirst(request));
  }
});
