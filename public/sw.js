/* War Table service worker (docs/MOBILE.md §2): the game loads offline after the first visit.
 *
 *   index.html (navigations)   network-first, 3.5 s timeout, then the cached copy — a new deploy is
 *                              always picked up when online, and it names new hashed assets.
 *   assets/* (content-hashed)  cache-first; a new build has new names, so cache-first never goes stale.
 *   fonts, icons, manifest     cache-first, refreshed in the background.
 *
 * The build (vite.config.ts) stamps VERSION and the PRECACHE list into dist/sw.js; each build is its
 * own cache, older ones are deleted on activate. skipWaiting + clients.claim:
 * a new worker takes over at once and never waits on open tabs. Everything is relative to the
 * registration scope, so it works at / and under the GitHub Pages subpath (/war-table/).
 * In dev this file is served as-is and never registered (src/main.ts registers it in production only).
 */
const VERSION = 'dev';
const PRECACHE = [];

const SCOPE = self.registration ? self.registration.scope : self.location.href.replace(/sw\.js.*$/, '');
const INDEX = new URL('./', SCOPE).href;
const abs = (p) => new URL(p, SCOPE).href;
/*
 * v6: every deployed version shares one origin (jhuang124.github.io/war-table-v5/, /war-table-v6/, ...) and Cache
 * Storage is per origin, so each version's cache is named by its own path ('war-table:/war-table-v6/:<version>')
 * and activate deletes only this path's older caches, never another version's offline copy. (Caches named the old
 * way, 'war-table-<version>', belong to v5 and earlier and are left alone.)
 */
const SCOPE_KEY = `war-table:${new URL(SCOPE).pathname}:`;
const CACHE = `${SCOPE_KEY}${VERSION}`;
/*
 * v6: install precaches what every device runs (the page, the hashed scripts and styles, the fonts, the figures and
 * the manifest). Textures (two sizes: a device uses one), map thumbnails and icons are cached the first time they
 * are actually used instead, so a phone never downloads the desktop's textures.
 */
const ON_USE = [/(^|\/)tex\//, /(^|\/)icons\//, /\.png$/i];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // One by one, so a single missing file never fails the whole install.
      const list = PRECACHE.filter((p) => !ON_USE.some((re) => re.test(p))).map(abs);
      await Promise.all(
        [INDEX, ...list].map(async (url) => {
          try {
            // v6: the page has just loaded these, so the HTTP cache already holds them: reuse it (the first visit
            // used to download everything twice). Only the page itself is fetched fresh.
            const res = await fetch(url, url === INDEX ? { cache: 'reload' } : undefined);
            if (res.ok) await cache.put(url, res);
          } catch {
            /* offline during install: it fills in on use */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith(SCOPE_KEY) && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function networkFirstIndex(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(request), timeout(3500)]);
    if (res && res.ok) {
      await cache.put(INDEX, res.clone());
      return res;
    }
    return (await cache.match(INDEX)) || res;
  } catch {
    const hit = await cache.match(INDEX);
    if (hit) return hit;
    return fetch(request);
  }
}

async function cacheFirst(request, refresh) {
  const cache = await caches.open(CACHE);
  const url = request.url.split('#')[0];
  const hit = await cache.match(url, { ignoreSearch: true });
  const load = () =>
    fetch(request)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') cache.put(url, res.clone());
        return res;
      })
      .catch(() => null);
  if (hit) {
    // Unhashed files (fonts, icons, manifest) refresh quietly for next time.
    if (refresh) load();
    return hit;
  }
  const res = await load();
  return res || new Response('', { status: 504, statusText: 'Offline' });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !req.url.startsWith(SCOPE)) return;
  if (req.mode === 'navigate' || url.href === INDEX || url.pathname.endsWith('/index.html')) {
    event.respondWith(networkFirstIndex(req));
    return;
  }
  if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(req, false));
    return;
  }
  event.respondWith(cacheFirst(req, true));
});
