import type { Metadata, Viewport } from 'next'
import './globals.css'
import PWAProvider from '@/components/PWAProvider'

export const metadata: Metadata = {
  title: 'Telegram Clone',
  description: 'A Telegram Web-like chat application',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Chat',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  // Tells Android Chrome to resize the layout (not overlay) when keyboard opens
  interactiveWidget: 'resizes-content',
  themeColor: '#17212b',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192.png" />
        <meta name="theme-color" content="#17212b" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Chat" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body>
        {children}
        <PWAProvider />
      </body>
    </html>
  )
}
