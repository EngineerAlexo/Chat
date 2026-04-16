'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Download, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// ── Module-level prompt storage ────────────────────────────────────────────
// Must be captured at module level — Android Chrome fires this very early,
// before React hydrates. We use a single listener registered once via a flag.
declare global {
  interface Window {
    __pwaPrompt?: BeforeInstallPromptEvent
    __pwaPromptListenerAdded?: boolean
  }
}

// Register the listener exactly once, even across HMR re-evaluations
if (typeof window !== 'undefined' && !window.__pwaPromptListenerAdded) {
  window.__pwaPromptListenerAdded = true
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    window.__pwaPrompt = e as BeforeInstallPromptEvent
    console.log('[PWA] beforeinstallprompt captured ✓')
    window.dispatchEvent(new CustomEvent('pwa:prompt'))
  })
  console.log('[PWA] beforeinstallprompt listener registered')
}

const DISMISSED_UNTIL_KEY = 'pwa-dismissed-until'

export default function PWAProvider() {
  const router = useRouter()
  const [hasPrompt, setHasPrompt] = useState(false)
  const [showBanner, setShowBanner] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const swRegistered = useRef(false)
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Track whether we've already shown the banner to prevent double-show
  const bannerShownRef = useRef(false)

  useEffect(() => {
    // Already running as installed PWA
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    ) {
      setIsInstalled(true)
      return
    }

    // ── Register Service Worker ──────────────────────────────────────────
    if ('serviceWorker' in navigator && !swRegistered.current) {
      swRegistered.current = true
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then((reg) => {
          console.log('[SW] registered, scope:', reg.scope)
          reg.update().catch(() => {})
          navigator.serviceWorker.addEventListener('message', (e) => {
            if (e.data?.type === 'navigate' && e.data.url) {
              router.push(e.data.url)
            }
          })
        })
        .catch((err) => console.warn('[SW] registration failed:', err))
    }

    // ── Show install banner (called at most once) ─────────────────────────
    function maybeShowBanner() {
      if (bannerShownRef.current) return
      const dismissedUntil = localStorage.getItem(DISMISSED_UNTIL_KEY)
      if (dismissedUntil && Date.now() < parseInt(dismissedUntil)) return
      bannerShownRef.current = true
      setHasPrompt(true)
      // Delay banner so it doesn't appear on first load
      bannerTimerRef.current = setTimeout(() => setShowBanner(true), 5000)
    }

    // Check if prompt was already captured before this component mounted
    if (window.__pwaPrompt) {
      maybeShowBanner()
    }

    // Listen for future prompt events
    const onPrompt = () => maybeShowBanner()
    window.addEventListener('pwa:prompt', onPrompt)

    // Detect successful install
    const onInstalled = () => {
      console.log('[PWA] appinstalled event fired ✓')
      setIsInstalled(true)
      setShowBanner(false)
      setHasPrompt(false)
      window.__pwaPrompt = undefined
    }
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('pwa:prompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current)
    }
  }, [router])

  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) return
    if (Notification.permission !== 'default') return
    const result = await Notification.requestPermission()
    console.log('[PWA] notification permission:', result)
  }, [])

  useEffect(() => {
    if (isInstalled && 'Notification' in window && Notification.permission === 'default') {
      const t = setTimeout(requestNotificationPermission, 5000)
      return () => clearTimeout(t)
    }
  }, [isInstalled, requestNotificationPermission])

  async function handleInstall() {
    const prompt = window.__pwaPrompt
    if (!prompt) {
      console.warn('[PWA] no deferred prompt — cannot install')
      return
    }

    // Clear immediately to prevent double-trigger
    window.__pwaPrompt = undefined
    setShowBanner(false)
    setHasPrompt(false)
    bannerShownRef.current = false

    console.log('[PWA] triggering install prompt...')
    try {
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      console.log('[PWA] install outcome:', outcome)
      if (outcome === 'accepted') {
        setTimeout(requestNotificationPermission, 2000)
      } else {
        // User dismissed — don't show again for 1 day
        localStorage.setItem(DISMISSED_UNTIL_KEY, String(Date.now() + 24 * 60 * 60 * 1000))
      }
    } catch (e) {
      console.warn('[PWA] prompt() failed:', e)
    }
  }

  function handleDismiss() {
    setShowBanner(false)
    localStorage.setItem(DISMISSED_UNTIL_KEY, String(Date.now() + 3 * 24 * 60 * 60 * 1000))
  }

  if (isInstalled) return null

  return (
    <AnimatePresence>
      {showBanner && hasPrompt && (
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
            <button onClick={handleDismiss} className="text-white/70 hover:text-white p-1" aria-label="Dismiss">
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

export async function sendLocalNotification(opts: {
  title: string; body: string; conversationId?: string; icon?: string
}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification(opts.title, {
      body: opts.body,
      icon: opts.icon ?? '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: opts.conversationId ?? 'chat',
      data: { conversationId: opts.conversationId },
    } as NotificationOptions)
  } catch {}
}
