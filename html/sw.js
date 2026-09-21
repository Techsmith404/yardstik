// YardStik Offline-First Service Worker
// SSoT §9.1: Zero regex lookbehinds, zero top-level await

const CACHE_NAME = 'yardstik-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/mobile.html',
    '/desktop.html',
    '/css/styles-v2.css',
    '/css/mobile.css',
    '/css/desktop.css',
    '/js/app.js',
    '/js/mobile.js',
    '/js/desktop.js',
    '/assets/data/equipment.json',
    '/assets/data/tracks.json',
    '/assets/data/trackers.json',
    '/assets/data/features.json',
    '/assets/data/reminders.md',
    '/assets/data/shifts.json',
    '/assets/data/anniversaries.json',
    '/assets/data/safety_videos.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Best effort pre-cache static assets without failing installation on individual misses
            return Promise.allSettled(
                STATIC_ASSETS.map((url) =>
                    fetch(url, { cache: 'no-cache' })
                        .then((res) => {
                            if (res.ok) return cache.put(url, res);
                        })
                        .catch(() => {})
                )
            );
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
    if (event.data && event.data.action === 'clearCache') {
        caches.delete(CACHE_NAME);
    }
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // 1. Only handle GET requests
    if (request.method !== 'GET') {
        return;
    }

    // 2. Network-Only: version.txt must never be cached so live reload polling is 100% accurate
    if (url.pathname.endsWith('version.txt')) {
        return;
    }

    // 3. Network-Only: Dynamic SSE runner streams and auth endpoints
    if (url.pathname.startsWith('/api/runners/') || url.pathname.startsWith('/api/auth/')) {
        return;
    }

    // 4. Network-First with Cache Fallback for all other requests (data, html, css, js, images)
    event.respondWith(
        fetch(request)
            .then((networkResponse) => {
                // If we received a valid response, clone and cache it for offline fallback
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseToCache);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // Network failed or offline - serve from cache if available
                return caches.match(request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // If navigation fails (e.g. mobile worker loading mobile.html offline), fallback to cached page
                    if (request.mode === 'navigate') {
                        if (url.pathname.includes('mobile')) {
                            return caches.match('/mobile.html');
                        }
                        if (url.pathname.includes('desktop')) {
                            return caches.match('/desktop.html');
                        }
                        return caches.match('/') || caches.match('/index.html');
                    }
                    return new Response('Network unavailable and resource not cached', {
                        status: 503,
                        statusText: 'Service Unavailable',
                        headers: new Headers({ 'Content-Type': 'text/plain' })
                    });
                });
            })
    );
});
