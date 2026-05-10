/* Service Worker for Practice app
   - Caches app shell
   - Provides network-first GET handling with cache fallback
   - Queues failed non-GET requests (POST/PUT/DELETE) in IndexedDB and retries them on sync
*/

const CACHE_NAME = 'practiceapp-shell-v1';
const OFFLINE_URLS = [
  '/',
  '/index.html',
  '/src/index.css',
  '/src/assets/favicon/metronome.png',
  '/src/assets/icons/icon-512.png',
  '/src/assets/icons/icon-512-maskable.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(OFFLINE_URLS)).catch(() => {})
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// Simple IndexedDB helper for storing failed requests
function openRequestsDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('pwa-requests', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('requests', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveFailedRequest(request) {
  try {
    const body = await request.clone().text().catch(() => null);
    const headers = {};
    for (const pair of request.headers.entries()) headers[pair[0]] = pair[1];
    const entry = {
      url: request.url,
      method: request.method,
      headers,
      body
    };
    const db = await openRequestsDB();
    const tx = db.transaction('requests', 'readwrite');
    tx.objectStore('requests').add(entry);
    return tx.complete;
  } catch (err) {
    return Promise.reject(err);
  }
}

async function replayRequests() {
  const db = await openRequestsDB();
  const tx = db.transaction('requests', 'readwrite');
  const store = tx.objectStore('requests');
  const all = await new Promise((res, rej) => {
    const getAll = store.getAll();
    getAll.onsuccess = () => res(getAll.result);
    getAll.onerror = () => rej(getAll.error);
  });

  for (const item of all) {
    try {
      const fetchOptions = { method: item.method, headers: item.headers };
      if (item.body) fetchOptions.body = item.body;
      const response = await fetch(item.url, fetchOptions);
      if (response && response.ok) {
        // remove from store
        await new Promise((res, rej) => {
          const del = store.delete(item.id);
          del.onsuccess = () => res();
          del.onerror = () => rej(del.error);
        });
      }
    } catch (e) {
      // keep item for next sync
    }
  }
}

self.addEventListener('sync', event => {
  if (event.tag === 'sync-requests') {
    event.waitUntil(replayRequests());
  }
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // For GET requests: network-first, fallback to cache
  if (req.method === 'GET') {
    event.respondWith(
      fetch(req)
        .then(res => {
          // put in cache
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(cached => cached || caches.match('/index.html')))
    );
    return;
  }

  // For non-GET (POST/PUT/DELETE) try network, on failure persist and register sync
  event.respondWith(
    fetch(req.clone()).catch(async () => {
      try {
        await saveFailedRequest(req);
        if (self.registration && self.registration.sync) {
          await self.registration.sync.register('sync-requests');
        }
      } catch (e) {
        // ignore
      }
      return new Response(JSON.stringify({ queued: true }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' }
      });
    })
  );
});
