// Service Worker v4 — all PWA icon sizes cached
const CACHE_NAME = 'chatapp-v4'
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon-72.png',
  '/icons/icon-96.png',
  '/icons/icon-128.png',
  '/icons/icon-144.png',
  '/icons/icon-152.png',
  '/icons/icon-192.png',
  '/icons/icon-384.png',
  '/icons/icon-512.png',
]

// ── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', (e) => {
  console.log('[SW] installing v3')
  // skipWaiting so new SW takes control immediately — critical for Android install prompt
  self.skipWaiting()
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS).catch((err) => console.warn('[SW] precache failed:', err)))
  )
})

// ── Activate ───────────────────────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  console.log('[SW] activating v3')
  e.waitUntil(
    Promise.all([
      // clients.claim() makes SW control all open pages immediately
      // This is required for Android Chrome to show "Install App"
      clients.claim(),
      // Delete old caches
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => {
          console.log('[SW] deleting old cache:', k)
          return caches.delete(k)
        }))
      ),
    ])
  )
})

// ── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  const { request } = e
  const url = new URL(request.url)

  // Only handle same-origin GET requests
  if (request.method !== 'GET') return
  if (url.origin !== location.origin) return

  // Never intercept Supabase API calls
  if (url.hostname.includes('supabase.co')) return

  // Navigation requests — network first, SW-cached fallback
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          // Cache successful navigation responses
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE_NAME).then((c) => c.put(request, clone))
          }
          return res
        })
        .catch(() =>
          caches.match(request)
            .then((r) => r ?? caches.match('/'))
        )
    )
    return
  }

  // Static Next.js assets + icons — cache first
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json'
  ) {
    e.respondWith(
      caches.match(request).then(
        (cached) => cached ?? fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE_NAME).then((c) => c.put(request, clone))
          }
          return res
        })
      )
    )
    return
  }

  // Everything else — network first, cache fallback
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

// ── Push Notifications ─────────────────────────────────────────────────────
self.addEventListener('push', (e) => {
  if (!e.data) return
  let data
  try { data = e.data.json() } catch { return }

  const { title = 'New message', body = '', conversationId, icon } = data

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: icon ?? '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: conversationId ?? 'chat',
      data: { conversationId },
      vibrate: [200, 100, 200],
    })
  )
})

// ── Notification click ─────────────────────────────────────────────────────
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const convId = e.notification.data?.conversationId
  const url = convId ? `/chat/${convId}` : '/chat'

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(location.origin)) {
          client.focus()
          client.postMessage({ type: 'navigate', url })
          return
        }
      }
      return clients.openWindow(url)
    })
  )
})
