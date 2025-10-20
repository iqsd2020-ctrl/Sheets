const CACHE_NAME = 'sheets-editor-cache-v4'; // Increment version to force update
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  'https://raw.githubusercontent.com/iqsd2020-ctrl/Sheets/main/paper.png',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/lucide-static@latest/dist/lucide.min.js',
  'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js'
];

// Install: Caches essential assets for offline use
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching essential assets');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting(); // Activate new service worker immediately
});

// Activate: Deletes old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim(); // Take control of open pages immediately
});

// Fetch (Network-first, then cache)
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // If successful, cache the new response
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      })
      .catch(() => {
        // If network fails, try to get it from the cache
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Optional: return a custom offline fallback page here
          });
      })
  );
});


