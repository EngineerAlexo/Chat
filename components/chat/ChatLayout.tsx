'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useChatStore } from '@/lib/stores/useChatStore'
import { subscribeToPresence } from '@/lib/supabase/realtime'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'
import ChatSidebar from './ChatSidebar'

interface Props {
  children: React.ReactNode
  initialProfile: Profile | null
}

export default function ChatLayout({ children, initialProfile }: Props) {
  const { setCurrentUser, setSidebarOpen, sidebarOpen } = useChatStore()
  const pathname = usePathname()

  useEffect(() => {
    if (initialProfile) {
      setCurrentUser(initialProfile)
      const supabase = getSupabaseClient()
      supabase.from('profiles')
        .update({ online_status: true, last_seen: new Date().toISOString() })
        .eq('id', initialProfile.id)
        .then(() => {})
      subscribeToPresence(initialProfile.id)

      const handleUnload = () => {
        supabase.from('profiles')
          .update({ online_status: false, last_seen: new Date().toISOString() })
          .eq('id', initialProfile.id)
          .then(() => {})
      }
      window.addEventListener('beforeunload', handleUnload)
      return () => window.removeEventListener('beforeunload', handleUnload)
    }
  }, [initialProfile, setCurrentUser])

  // Apply saved theme
  useEffect(() => {
    const saved = localStorage.getItem('tg-theme') as 'light' | 'dark' | null
    if (saved === 'dark') {
      document.documentElement.classList.add('dark')
      useChatStore.setState({ theme: 'dark' })
    }
  }, [])

  // Mobile: auto-hide sidebar when in a chat
  useEffect(() => {
    const isMobile = window.innerWidth < 768
    if (isMobile) {
      const inSubPage = pathname !== '/chat' && pathname.startsWith('/chat/')
      setSidebarOpen(!inSubPage)
    } else {
      setSidebarOpen(true)
    }
  }, [pathname, setSidebarOpen])

  // Determine if we should show the "empty" placeholder or actual content
  const isRootChat = pathname === '/chat'

  return (
    <div className="flex h-screen overflow-hidden bg-tg-bg dark:bg-tg-bg-dark">
      <ChatSidebar />
      <main className={`flex-1 flex overflow-hidden min-w-0 ${!sidebarOpen || isRootChat ? 'flex' : 'hidden md:flex'}`}>
        {children}
      </main>
    </div>
  )
}
