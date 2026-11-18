// ============================================
// PrepTrack - Service Worker
// Caches assets for offline use
// ============================================

const CACHE_NAME = 'preptrack-v46';

// Core assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/pages/dashboard.html',
  '/pages/exam.html',
  '/pages/results.html',
  '/pages/profile.html',
  '/pages/login.html',
  '/pages/register.html',
  '/pages/resources.html',
  '/pages/contact.html',
  '/pages/courses.html',
  '/pages/attendance.html',
  '/css/style.css?v=6',
  '/css/dashboard.css?v=5',
  '/css/responsive.css',
  '/css/courses.css',
  '/css/attendance.css',
  '/css/materials.css',
  '/js/app.js?v=6',
  '/js/auth.js?v=12',
  '/js/supabase.js',
  '/js/supabase-attendance.js',
  '/js/exam.js',
  '/js/results.js',
  '/js/profile.js',
  '/js/dashboard.js',
  '/js/courses.js',
  '/js/attendance.js',
  '/js/materials.js',
  '/icons/logo.PNG',
  '/manifest.json'
];

// --- Install: Pre-cache all core assets ---
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS).catch(() => {
        // Don't fail install if some assets are missing
      });
    })
  );
  self.skipWaiting();
});

// --- Activate: Clean up old caches ---
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// --- Fetch: Network-first for HTML, Cache-first for static assets ---
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests (e.g. Supabase API)
  if (request.method !== 'GET' || url.origin !== location.origin) {
    return;
  }

  // HTML pages: Network first, fall back to cache
  if (request.headers.get('Accept') && request.headers.get('Accept').includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('/pages/dashboard.html')))
    );
    return;
  }

  // Static assets: Cache first, then network
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      });
    })
  );
});
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
