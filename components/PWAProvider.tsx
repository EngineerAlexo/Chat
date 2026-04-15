'use client'

import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PWAProvider() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => console.log('[SW] registered', reg.scope))
        .catch((err) => console.warn('[SW] registration failed', err))
    }

    // Capture install prompt
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
      // Only show banner if not already installed
      if (!window.matchMedia('(display-mode: standalone)').matches) {
        setShowBanner(true)
      }
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function handleInstall() {
    if (!installPrompt) return
    setShowBanner(false)
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstallPrompt(null)
  }

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ opacity: 0, y: 80 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 80 }}
          className="fixed bottom-4 left-4 right-4 z-[100] bg-tg-blue text-white rounded-2xl shadow-modal px-4 py-3 flex items-center gap-3 md:max-w-sm md:left-auto md:right-4"
        >
          <Download className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Install Chat App</p>
            <p className="text-xs text-white/80">Add to home screen for the best experience</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => setShowBanner(false)}
              className="text-white/70 hover:text-white text-xs px-2 py-1"
            >
              Later
            </button>
            <button
              onClick={handleInstall}
              className="bg-white text-tg-blue text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-white/90 transition"
            >
              Install
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
