import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Telegram Clone',
  description: 'A Telegram Web-like chat application',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
