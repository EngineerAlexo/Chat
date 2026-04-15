const CACHE_NAME = 'chatapp-v1'

// Assets to pre-cache on install
const PRECACHE = [
  '/',
  '/chat',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

self.addEventListener('install', (e) => {
  // Skip waiting so new SW activates immediately
  self.skipWaiting()
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  )
})

self.addEventListener('activate', (e) => {
  // Take control of all clients immediately
  e.waitUntil(
    Promise.all([
      clients.claim(),
      // Delete old caches
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      ),
    ])
  )
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  const url = new URL(request.url)

  // Only handle GET requests on same origin
  if (request.method !== 'GET') return
  if (url.origin !== location.origin) return

  // Skip Supabase API calls — always go to network
  if (url.hostname.includes('supabase.co')) return

  // Network-first for navigation (HTML pages)
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((c) => c.put(request, clone))
          return res
        })
        .catch(() => caches.match(request).then((r) => r ?? caches.match('/')))
    )
    return
  }

  // Cache-first for static assets (JS, CSS, images, fonts)
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json'
  ) {
    e.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((res) => {
            const clone = res.clone()
            caches.open(CACHE_NAME).then((c) => c.put(request, clone))
            return res
          })
      )
    )
    return
  }

  // Network-first for everything else
  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((c) => c.put(request, clone))
        }
        return res
      })
      .catch(() => caches.match(request))
  )
})
