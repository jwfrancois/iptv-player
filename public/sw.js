// Service Worker for IPTV Player
// Caches app shell for offline use + serves stale channel data when network fails

const CACHE_NAME = 'iptv-player-v1'
const APP_SHELL = [
  '/',
  '/manifest.json',
]

// Install: cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  )
  self.skipWaiting()
})

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch: network-first for API, cache-first for app shell
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Skip non-GET requests
  if (event.request.method !== 'GET') return

  // Skip HLS/stream requests (too large to cache, handled by app)
  if (url.pathname.startsWith('/api/hls') || url.pathname.startsWith('/api/stream')) return

  // For API requests (channel lists, categories): network-first, cache fallback
  if (url.pathname.startsWith('/api/iptv')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful API responses for offline use
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {})
          }
          return response
        })
        .catch(() => {
          // Network failed: try cached response
          return caches.match(event.request).then((cached) => cached || new Response('Offline', { status: 503 }))
        })
    )
    return
  }

  // For app shell: cache-first, network fallback
  if (url.pathname === '/' || url.pathname.startsWith('/_next/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {})
          }
          return response
        })
      })
    )
    return
  }
})
