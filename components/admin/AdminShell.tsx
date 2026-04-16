'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { getSupabaseClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils/cn'
import {
  LayoutDashboard, Users, MessageSquare, Image, BarChart3,
  Settings, LogOut, Menu, X, Bell, ChevronRight, Shield,
  Activity
} from 'lucide-react'

const NAV = [
  { href: '/admin',          label: 'Overview',   icon: LayoutDashboard },
  { href: '/admin/users',    label: 'Users',      icon: Users },
  { href: '/admin/messages', label: 'Messages',   icon: MessageSquare },
  { href: '/admin/media',    label: 'Media',      icon: Image },
  { href: '/admin/activity', label: 'Activity',   icon: Activity },
  { href: '/admin/analytics',label: 'Analytics',  icon: BarChart3 },
  { href: '/admin/settings', label: 'Settings',   icon: Settings },
]

interface Props {
  children: React.ReactNode
  adminProfile: { username: string | null; avatar_url: string | null }
}

export default function AdminShell({ children, adminProfile }: Props) {
  const pathname = usePathname()
  const router   = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  async function handleLogout() {
    await getSupabaseClient().auth.signOut()
    router.push('/auth/login')
  }

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={cn(
      'flex flex-col h-full bg-[#0f1117] border-r border-white/5',
      mobile ? 'w-64' : 'w-64'
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/5">
        <div className="w-8 h-8 rounded-lg bg-tg-blue flex items-center justify-center flex-shrink-0">
          <Shield className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-white font-semibold text-sm">Admin Panel</p>
          <p className="text-white/40 text-xs">Telegram Clone</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/admin' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group',
                active
                  ? 'bg-tg-blue/15 text-tg-blue'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
              {active && <ChevronRight className="w-3 h-3 ml-auto opacity-60" />}
            </Link>
          )
        })}
      </nav>

      {/* Admin profile */}
      <div className="px-3 py-4 border-t border-white/5">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/5">
          <div className="w-7 h-7 rounded-full bg-tg-blue/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {adminProfile.avatar_url
              ? <img src={adminProfile.avatar_url} alt="" className="w-full h-full object-cover" />
              : <span className="text-tg-blue text-xs font-bold">{(adminProfile.username ?? 'A')[0].toUpperCase()}</span>
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{adminProfile.username ?? 'Admin'}</p>
            <p className="text-white/40 text-[10px]">Administrator</p>
          </div>
          <button onClick={handleLogout} className="text-white/30 hover:text-red-400 transition p-1" title="Sign out">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-[#080b10] text-white overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: -256 }} animate={{ x: 0 }} exit={{ x: -256 }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              className="fixed left-0 top-0 bottom-0 z-50 md:hidden"
            >
              <Sidebar mobile />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="flex items-center gap-4 px-4 md:px-6 h-14 border-b border-white/5 bg-[#0f1117] flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden text-white/50 hover:text-white">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <button className="relative text-white/40 hover:text-white transition">
            <Bell className="w-4 h-4" />
          </button>
          <Link href="/chat" className="text-xs text-white/40 hover:text-white transition px-2 py-1 rounded-md hover:bg-white/5">
            ← Back to App
          </Link>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
