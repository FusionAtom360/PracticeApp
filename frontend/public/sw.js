const CACHE_NAME = 'practiceapp-shell-v1';
const REQUEST_DB_NAME = 'pwa-requests';
const REQUEST_STORE = 'requests';
const OFFLINE_URLS = [
  '/',
  '/index.html',
  '/src/index.css',
  '/favicon/metronome.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png'
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

function openRequestsDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(REQUEST_DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(REQUEST_STORE)) {
        db.createObjectStore(REQUEST_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function completeTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
  });
}

async function saveFailedRequest(request) {
  const body = await request.clone().text().catch(() => null);
  const headers = {};
  for (const pair of request.headers.entries()) headers[pair[0]] = pair[1];
  const entry = {
    url: request.url,
    method: request.method,
    headers,
    body,
    queuedAt: Date.now(),
    attempts: 0,
    lastError: null
  };
  const db = await openRequestsDB();
  const transaction = db.transaction(REQUEST_STORE, 'readwrite');
  transaction.objectStore(REQUEST_STORE).add(entry);
  await completeTransaction(transaction);
  return entry.queuedAt;
}

function deleteRequest(store, id) {
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function updateRequest(store, id, changes) {
  return new Promise((resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => {
      if (!request.result) return resolve();
      const update = store.put({ ...request.result, ...changes });
      update.onsuccess = () => resolve();
      update.onerror = () => reject(update.error);
    };
    request.onerror = () => reject(request.error);
  });
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach(client => client.postMessage(message));
}

async function replayRequests() {
  const db = await openRequestsDB();
  const readTransaction = db.transaction(REQUEST_STORE, 'readonly');
  const all = await new Promise((resolve, reject) => {
    const request = readTransaction.objectStore(REQUEST_STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  for (const item of all) {
    try {
      const options = { method: item.method, headers: item.headers };
      if (item.body) options.body = item.body;
      const response = await fetch(item.url, options);
      const transaction = db.transaction(REQUEST_STORE, 'readwrite');
      const store = transaction.objectStore(REQUEST_STORE);

      if (response.ok) {
        await deleteRequest(store, item.id);
        await notifyClients({ type: 'mutation-synced', requestId: item.id });
      } else if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
        await deleteRequest(store, item.id);
        await notifyClients({ type: 'mutation-failed', requestId: item.id, status: response.status });
      } else {
        await updateRequest(store, item.id, {
          attempts: (item.attempts || 0) + 1,
          lastError: `HTTP ${response.status}`
        });
      }
    } catch (error) {
      const transaction = db.transaction(REQUEST_STORE, 'readwrite');
      await updateRequest(transaction.objectStore(REQUEST_STORE), item.id, {
        attempts: (item.attempts || 0) + 1,
        lastError: error instanceof Error ? error.message : 'Network error'
      });
    }
  }
}

self.addEventListener('sync', event => {
  if (event.tag === 'sync-requests') event.waitUntil(replayRequests());
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method === 'GET') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('/index.html')))
    );
    return;
  }

  event.respondWith(
    fetch(request.clone()).catch(async () => {
      try {
        const requestId = await saveFailedRequest(request);
        if (self.registration && self.registration.sync) {
          await self.registration.sync.register('sync-requests');
        }
        return new Response(JSON.stringify({
          queued: true,
          requestId,
          message: 'Request queued for retry when the connection is restored.'
        }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch {
        return new Response(JSON.stringify({
          queued: false,
          error: 'Request could not be sent or queued.'
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    })
  );
});
