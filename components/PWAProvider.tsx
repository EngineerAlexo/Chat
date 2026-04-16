'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Download, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const INSTALL_DISMISSED_KEY = 'pwa-install-dismissed'
const INSTALL_DISMISSED_UNTIL_KEY = 'pwa-install-dismissed-until'

export default function PWAProvider() {
  const router = useRouter()
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  // ── Register SW + listen for install prompt ──────────────────────────────
  useEffect(() => {
    // Check if already running as installed PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
    }

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[SW] registered, scope:', reg.scope)
          // Listen for SW messages (e.g. navigate from notification click)
          navigator.serviceWorker.addEventListener('message', (e) => {
            if (e.data?.type === 'navigate' && e.data.url) {
              router.push(e.data.url)
            }
          })
        })
        .catch((err) => console.warn('[SW] registration failed:', err))
    }

    // Capture install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)

      // Don't show if already installed or recently dismissed
      if (window.matchMedia('(display-mode: standalone)').matches) return
      const dismissedUntil = localStorage.getItem(INSTALL_DISMISSED_UNTIL_KEY)
      if (dismissedUntil && Date.now() < parseInt(dismissedUntil)) return

      // Show banner after a short delay (not immediately on load)
      setTimeout(() => setShowBanner(true), 3000)
    }

    window.addEventListener('beforeinstallprompt', handler)

    // Detect successful install
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setShowBanner(false)
      setInstallPrompt(null)
      console.log('[PWA] app installed')
    })

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [router])

  // ── Request notification permission (after user interaction) ─────────────
  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) return
    if (Notification.permission === 'granted') return
    if (Notification.permission === 'denied') return

    const result = await Notification.requestPermission()
    console.log('[PWA] notification permission:', result)
  }, [])

  // Request notification permission after install or on first meaningful interaction
  useEffect(() => {
    if (isInstalled && 'Notification' in window && Notification.permission === 'default') {
      // Wait a bit before asking
      const timer = setTimeout(requestNotificationPermission, 5000)
      return () => clearTimeout(timer)
    }
  }, [isInstalled, requestNotificationPermission])

  // ── Install handler ───────────────────────────────────────────────────────
  async function handleInstall() {
    if (!installPrompt) return
    setShowBanner(false)
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    console.log('[PWA] install outcome:', outcome)
    if (outcome === 'accepted') {
      setInstallPrompt(null)
      // Request notifications after install
      setTimeout(requestNotificationPermission, 2000)
    }
  }

  function handleDismiss() {
    setShowBanner(false)
    // Don't show again for 3 days
    localStorage.setItem(INSTALL_DISMISSED_UNTIL_KEY, String(Date.now() + 3 * 24 * 60 * 60 * 1000))
  }

  if (isInstalled) return null

  return (
    <AnimatePresence>
      {showBanner && installPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 80 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 80 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed bottom-4 left-4 right-4 z-[90] bg-tg-blue text-white rounded-2xl shadow-modal px-4 py-3 flex items-center gap-3 md:max-w-sm md:left-auto md:right-4"
        >
          <Download className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Install Chat App</p>
            <p className="text-xs text-white/80">Add to home screen for the best experience</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleDismiss}
              className="text-white/70 hover:text-white p-1"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              onClick={handleInstall}
              className="bg-white text-tg-blue text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-white/90 transition active:scale-95"
            >
              Install
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Utility: send a local notification (foreground) ───────────────────────
export async function sendLocalNotification(opts: {
  title: string
  body: string
  conversationId?: string
  icon?: string
}) {
  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return

  // Use SW notification for better behavior
  const reg = await navigator.serviceWorker.ready
  await reg.showNotification(opts.title, {
    body: opts.body,
    icon: opts.icon ?? '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: opts.conversationId ?? 'chat',
    renotify: true,
    data: { conversationId: opts.conversationId },
  })
}
