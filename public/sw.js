const CACHE_NAME = 'chatapp-v2'
const STATIC_ASSETS = [
  '/',
  '/chat',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

// ── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  )
})

// ── Activate ───────────────────────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    Promise.all([
      clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      ),
    ])
  )
})

// ── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  const { request } = e
  const url = new URL(request.url)

  if (request.method !== 'GET') return
  if (url.origin !== location.origin) return
  if (url.hostname.includes('supabase.co')) return

  // Navigation — network first, fallback to cache
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

  // Static assets — cache first
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.json') {
    e.respondWith(
      caches.match(request).then(
        (cached) => cached ?? fetch(request).then((res) => {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((c) => c.put(request, clone))
          return res
        })
      )
    )
    return
  }

  // Everything else — network first
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

  const { title = 'New message', body = '', conversationId, senderAvatar } = data

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: senderAvatar ?? '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: conversationId ?? 'chat',
      renotify: true,
      data: { conversationId },
      vibrate: [200, 100, 200],
    })
  )
})

// ── Notification click — open/focus app and navigate ──────────────────────
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const convId = e.notification.data?.conversationId
  const url = convId ? `/chat/${convId}` : '/chat'

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if open
      for (const client of windowClients) {
        if (client.url.includes(location.origin)) {
          client.focus()
          client.postMessage({ type: 'navigate', url })
          return
        }
      }
      // Open new window
      return clients.openWindow(url)
    })
  )
})
