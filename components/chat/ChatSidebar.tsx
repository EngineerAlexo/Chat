'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useChatStore } from '@/lib/stores/useChatStore'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { Conversation, Profile } from '@/lib/types'
import { formatTime } from '@/lib/utils/formatTime'
import { cn } from '@/lib/utils/cn'
import Avatar from '@/components/ui/Avatar'
import NewChatModal from './NewChatModal'
import {
  Search, Moon, Sun, Edit, LogOut, X, Users, Bookmark,
  Settings, UserPlus, Radio, ChevronDown
} from 'lucide-react'

export default function ChatSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const {
    conversations, setConversations, currentUser, searchQuery, setSearchQuery,
    theme, toggleTheme, onlineUsers, sidebarOpen
  } = useChatStore()

  const [showNewChat, setShowNewChat] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const loadConversations = useCallback(async () => {
    if (!currentUser) return
    const supabase = getSupabaseClient()

    // Get all conversation IDs for current user
    const { data: participations } = await supabase
      .from('participants')
      .select('conversation_id')
      .eq('user_id', currentUser.id)

    if (!participations?.length) {
      setConversations([])
      return
    }

    const convIds = participations.map((p) => p.conversation_id)

    // Fetch conversations with participants + profiles
    const { data: convData } = await supabase
      .from('conversations')
      .select(`
        id, name, type, created_at,
        participants(id, user_id, role, profile:profiles(id, username, avatar_url, online_status, last_seen))
      `)
      .in('id', convIds)
      .order('created_at', { ascending: false })

    if (!convData?.length) return

    // Batch fetch last messages
    const { data: lastMessages } = await supabase
      .from('messages')
      .select('id, conversation_id, content, media_type, created_at, sender_id')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false })

    // Group last message per conversation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastMsgMap: Record<string, any> = {}
    if (lastMessages) {
      for (const msg of lastMessages) {
        if (!lastMsgMap[msg.conversation_id]) {
          lastMsgMap[msg.conversation_id] = msg
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const convs: Conversation[] = (convData as any[]).map((conv) => ({
      ...conv,
      last_message: lastMsgMap[conv.id] ?? null,
    }))

    // Sort by last message time (most recent first)
    convs.sort((a, b) => {
      const aTime = a.last_message?.created_at ?? a.created_at
      const bTime = b.last_message?.created_at ?? b.created_at
      return new Date(bTime).getTime() - new Date(aTime).getTime()
    })

    setConversations(convs)
  }, [currentUser, setConversations])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  // Realtime: reload sidebar when messages, conversations, or participants change
  useEffect(() => {
    if (!currentUser) return
    const supabase = getSupabaseClient()
    const channel = supabase
      .channel(`sidebar:${currentUser.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        loadConversations()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, () => {
        loadConversations()
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'participants',
          filter: `user_id=eq.${currentUser.id}`,
        },
        () => {
          // A new conversation was shared with this user
          loadConversations()
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentUser, loadConversations])

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    if (showMenu) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showMenu])

  const filtered = conversations.filter((c) => {
    if (!searchQuery) return true
    const name = getConvName(c, currentUser)
    return name.toLowerCase().includes(searchQuery.toLowerCase())
  })

  async function handleLogout() {
    const supabase = getSupabaseClient()
    if (currentUser) {
      await supabase.from('profiles').update({ online_status: false }).eq('id', currentUser.id)
    }
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  if (!sidebarOpen) return null

  return (
    <>
      <motion.aside
        initial={false}
        className="flex flex-col h-full border-r border-tg-border dark:border-tg-border-dark bg-white dark:bg-tg-bg-dark-secondary flex-shrink-0 w-full md:w-[360px]"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-tg-border dark:border-tg-border-dark">
          {/* Avatar + menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-1 hover:opacity-80 transition flex-shrink-0"
            >
              <Avatar
                src={currentUser?.avatar_url}
                name={currentUser?.username ?? 'U'}
                size={36}
                online={true}
              />
              <ChevronDown className={cn('w-3 h-3 text-tg-text-secondary transition-transform', showMenu && 'rotate-180')} />
            </button>

            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -8 }}
                  className="absolute top-12 left-0 z-50 bg-white dark:bg-tg-bg-dark-secondary rounded-xl shadow-modal border border-tg-border dark:border-tg-border-dark py-1 w-56"
                >
                  <div className="px-4 py-2 border-b border-tg-border dark:border-tg-border-dark">
                    <p className="font-semibold text-sm text-gray-900 dark:text-white">@{currentUser?.username}</p>
                    {currentUser?.bio && <p className="text-xs text-tg-text-secondary truncate">{currentUser.bio}</p>}
                  </div>
                  <MenuItem icon={<Bookmark className="w-4 h-4 text-tg-blue" />} label="Saved Messages" onClick={() => { setShowMenu(false); navigateToSaved() }} />
                  <MenuItem icon={<Users className="w-4 h-4 text-green-500" />} label="People" onClick={() => { setShowMenu(false); router.push('/chat/people') }} />
                  <MenuItem icon={<UserPlus className="w-4 h-4 text-purple-500" />} label="New Group / Channel" onClick={() => { setShowMenu(false); router.push('/chat/new-group') }} />
                  <MenuItem
                    icon={theme === 'dark' ? <Sun className="w-4 h-4 text-yellow-500" /> : <Moon className="w-4 h-4 text-indigo-500" />}
                    label={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                    onClick={() => { setShowMenu(false); toggleTheme() }}
                  />
                  <MenuItem icon={<Settings className="w-4 h-4 text-tg-text-secondary" />} label="Settings" onClick={() => { setShowMenu(false); router.push('/chat/settings') }} />
                  <hr className="my-1 border-tg-border dark:border-tg-border-dark" />
                  <MenuItem icon={<LogOut className="w-4 h-4" />} label="Sign Out" onClick={() => { setShowMenu(false); handleLogout() }} danger />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tg-text-secondary" />
            <input
              type="text"
              placeholder="Search chats"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-tg-bg-secondary dark:bg-tg-bg-dark text-sm text-gray-900 dark:text-white placeholder-tg-text-secondary focus:outline-none focus:ring-2 focus:ring-tg-blue/50 transition"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-tg-text-secondary hover:text-gray-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* New chat */}
          <button
            onClick={() => setShowNewChat(true)}
            title="New private chat"
            className="w-9 h-9 rounded-full bg-tg-blue hover:bg-tg-blue-dark text-white flex items-center justify-center transition flex-shrink-0"
          >
            <Edit className="w-4 h-4" />
          </button>
        </div>

        {/* Quick nav pills */}
        <div className="flex gap-2 px-3 py-2 border-b border-tg-border dark:border-tg-border-dark overflow-x-auto scrollbar-none">
          <NavPill icon={<Users className="w-3.5 h-3.5" />} label="People" onClick={() => router.push('/chat/people')} />
          <NavPill icon={<UserPlus className="w-3.5 h-3.5" />} label="New Group" onClick={() => router.push('/chat/new-group')} />
          <NavPill icon={<Radio className="w-3.5 h-3.5" />} label="Channel" onClick={() => router.push('/chat/new-group')} />
          <NavPill icon={<Settings className="w-3.5 h-3.5" />} label="Settings" onClick={() => router.push('/chat/settings')} />
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-tg-text-secondary text-sm px-4 text-center">
              <Edit className="w-8 h-8 mb-2 opacity-30" />
              {searchQuery
                ? 'No chats found'
                : <><p className="font-medium">No conversations yet</p><p className="text-xs mt-1">Click <strong>People</strong> to find users and start chatting</p></>}
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {filtered.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  currentUser={currentUser}
                  isActive={pathname === `/chat/${conv.id}`}
                  onlineUsers={onlineUsers}
                  onClick={() => router.push(`/chat/${conv.id}`)}
                />
              ))}
            </AnimatePresence>
          )}
        </div>
      </motion.aside>

      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onCreated={(id) => { setShowNewChat(false); router.push(`/chat/${id}`); loadConversations() }}
        />
      )}
    </>
  )

  async function navigateToSaved() {
    if (!currentUser) return
    const supabase = getSupabaseClient()
    const { data: participations } = await supabase
      .from('participants')
      .select('conversation_id')
      .eq('user_id', currentUser.id)

    if (participations?.length) {
      const convIds = participations.map((p) => p.conversation_id)
      const { data: saved } = await supabase
        .from('conversations')
        .select('id')
        .eq('type', 'saved')
        .in('id', convIds)
        .maybeSingle()
      if (saved) { router.push(`/chat/${saved.id}`); return }
    }

    // Create saved messages
    const { data: conv } = await supabase
      .from('conversations')
      .insert({ name: 'Saved Messages', type: 'saved' })
      .select('id')
      .single()
    if (conv) {
      await supabase.from('participants').insert({ conversation_id: conv.id, user_id: currentUser.id, role: 'owner' })
      await loadConversations()
      router.push(`/chat/${conv.id}`)
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getConvName(conv: Conversation, currentUser: Profile | null): string {
  if (conv.type === 'saved') return 'Saved Messages'
  if (conv.name) return conv.name
  if (conv.type === 'private' && conv.participants) {
    const other = conv.participants.find((p) => p.user_id !== currentUser?.id)
    return other?.profile?.username ?? 'Unknown'
  }
  return 'Chat'
}

function getConvAvatar(conv: Conversation, currentUser: Profile | null): string | null {
  if (conv.type === 'private' && conv.participants) {
    const other = conv.participants.find((p) => p.user_id !== currentUser?.id)
    return other?.profile?.avatar_url ?? null
  }
  return null
}

function getOtherUserId(conv: Conversation, currentUser: Profile | null): string | null {
  if (conv.type === 'private' && conv.participants) {
    const other = conv.participants.find((p) => p.user_id !== currentUser?.id)
    return other?.user_id ?? null
  }
  return null
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 w-full px-4 py-2.5 text-sm transition',
        danger
          ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
          : 'text-gray-700 dark:text-gray-200 hover:bg-tg-bg-secondary dark:hover:bg-tg-bg-dark'
      )}
    >
      {icon} {label}
    </button>
  )
}

function NavPill({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-tg-bg-secondary dark:bg-tg-bg-dark text-xs font-medium text-tg-text-secondary hover:bg-tg-blue/10 hover:text-tg-blue dark:hover:bg-tg-blue/20 transition whitespace-nowrap flex-shrink-0"
    >
      {icon} {label}
    </button>
  )
}

interface ConvItemProps {
  conv: Conversation
  currentUser: Profile | null
  isActive: boolean
  onlineUsers: Set<string>
  onClick: () => void
}

function ConversationItem({ conv, currentUser, isActive, onlineUsers, onClick }: ConvItemProps) {
  const name = getConvName(conv, currentUser)
  const avatar = getConvAvatar(conv, currentUser)
  const otherId = getOtherUserId(conv, currentUser)
  const isOnline = otherId ? onlineUsers.has(otherId) : false
  const lastMsg = conv.last_message

  const lastMsgText = lastMsg
    ? lastMsg.media_type
      ? `📎 ${lastMsg.media_type}`
      : lastMsg.content ?? ''
    : 'No messages yet'

  return (
    <motion.button
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 md:py-3 transition-colors text-left border-b border-tg-border/30 dark:border-tg-border-dark/30 touch-feedback conv-item',
        isActive
          ? 'bg-tg-blue/10 dark:bg-tg-blue/20'
          : 'hover:bg-tg-bg-secondary dark:hover:bg-tg-bg-dark'
      )}
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        {conv.type === 'saved' ? (
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-tg-blue flex items-center justify-center">
            <Bookmark className="w-4 h-4 md:w-5 md:h-5 text-white" />
          </div>
        ) : conv.type === 'group' ? (
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-purple-500 flex items-center justify-center">
            <Users className="w-4 h-4 md:w-5 md:h-5 text-white" />
          </div>
        ) : conv.type === 'channel' ? (
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-orange-500 flex items-center justify-center">
            <Radio className="w-4 h-4 md:w-5 md:h-5 text-white" />
          </div>
        ) : (
          <Avatar src={avatar} name={name} size={40} online={isOnline} />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={cn(
            'font-semibold text-sm truncate',
            isActive ? 'text-tg-blue' : 'text-gray-900 dark:text-white'
          )}>
            {name}
          </span>
          {lastMsg && (
            <span className="text-[11px] text-tg-text-secondary flex-shrink-0">
              {formatTime(lastMsg.created_at)}
            </span>
          )}
        </div>
        <p className="text-xs text-tg-text-secondary truncate mt-0.5">
          {lastMsgText}
        </p>
      </div>
    </motion.button>
  )
}
