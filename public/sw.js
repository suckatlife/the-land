const CACHE = 'the-land-v1';
const CORE = [
  '/',
  '/land-mark.svg',
  '/icons/app-icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/social-card.png',
  '/manifest.webmanifest',
  '/about/',
  '/privacy/',
  '/terms/',
  '/support/',
  '/offline.html',
  '/info.css',
];

async function cacheAppShell() {
  const cache = await caches.open(CACHE);
  await Promise.allSettled(CORE.map((url) => cache.add(url)));

  // Vite fingerprints the simulation bundle. Read the current document so the
  // first installed version can keep that exact bundle available offline.
  try {
    const response = await fetch('/', { cache: 'reload' });
    if (!response.ok) return;
    const html = await response.clone().text();
    await cache.put('/', response);
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)]
      .map((match) => match[1]);
    await Promise.allSettled([...new Set(assets)].map((url) => cache.add(url)));
  } catch {
    // The individual core requests above may still have succeeded.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function navigationResponse(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      const url = new URL(request.url);
      const key = url.pathname === '/' ? '/' : request;
      await cache.put(key, response.clone());
    }
    return response;
  } catch {
    const url = new URL(request.url);
    return (
      await cache.match(url.pathname === '/' ? '/' : request)
      || await cache.match('/')
      || await cache.match('/offline.html')
    );
  }
}

async function assetResponse(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    request.mode === 'navigate'
      ? navigationResponse(request)
      : assetResponse(request),
  );
});
