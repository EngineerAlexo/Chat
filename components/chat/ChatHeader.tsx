'use client'

import { useMemo } from 'react'
import { useChatStore } from '@/lib/stores/useChatStore'
import { formatLastSeen } from '@/lib/utils/formatTime'
import { cn } from '@/lib/utils/cn'
import Avatar from '@/components/ui/Avatar'
import { Phone, Video, Search, MoreVertical, ArrowLeft, Users, Bookmark } from 'lucide-react'

interface Props {
  conversationId: string
  currentUserId: string
}

export default function ChatHeader({ conversationId, currentUserId }: Props) {
  const { conversations, onlineUsers, typingUsers, setSidebarOpen, sidebarOpen } = useChatStore()

  const conv = conversations.find((c) => c.id === conversationId)
  const typing = typingUsers[conversationId] ?? []

  const { name, avatar, subtitle, isOnline, otherUserId } = useMemo(() => {
    if (!conv) return { name: '', avatar: null, subtitle: '', isOnline: false, otherUserId: null }

    if (conv.type === 'saved') {
      return { name: 'Saved Messages', avatar: null, subtitle: 'Your personal cloud storage', isOnline: false, otherUserId: null }
    }

    if (conv.type === 'private') {
      const other = conv.participants?.find((p) => p.user_id !== currentUserId)
      const profile = other?.profile
      const online = other ? onlineUsers.has(other.user_id) : false
      return {
        name: profile?.username ?? 'Unknown',
        avatar: profile?.avatar_url ?? null,
        subtitle: online ? 'online' : formatLastSeen(profile?.last_seen ?? null),
        isOnline: online,
        otherUserId: other?.user_id ?? null,
      }
    }

    const memberCount = conv.participants?.length ?? 0
    return {
      name: conv.name ?? 'Group',
      avatar: null,
      subtitle: `${memberCount} members`,
      isOnline: false,
      otherUserId: null,
    }
  }, [conv, currentUserId, onlineUsers])

  const typingText = useMemo(() => {
    if (!typing.length) return null
    if (typing.length === 1) return `${typing[0].username ?? 'Someone'} is typing...`
    return `${typing.length} people are typing...`
  }, [typing])

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-tg-border dark:border-tg-border-dark bg-white dark:bg-tg-bg-dark-secondary flex-shrink-0 shadow-sm">
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="text-tg-text-secondary hover:text-gray-700 dark:hover:text-gray-300 flex-shrink-0"
        title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
      >
        <ArrowLeft className={cn('w-5 h-5 transition-transform', !sidebarOpen && 'rotate-180')} />
      </button>

      <div className="flex-shrink-0">
        {conv?.type === 'saved' ? (
          <div className="w-10 h-10 rounded-full bg-tg-blue flex items-center justify-center">
            <Bookmark className="w-5 h-5 text-white" />
          </div>
        ) : conv?.type === 'group' ? (
          <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
        ) : (
          <Avatar src={avatar} name={name} size={40} online={isOnline} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h2 className="font-semibold text-gray-900 dark:text-white text-sm truncate">{name}</h2>
        <p className={cn('text-xs truncate transition-all', typingText ? 'text-tg-blue' : isOnline ? 'text-tg-green' : 'text-tg-text-secondary')}>
          {typingText ? (
            <span className="flex items-center gap-1">
              {typingText}
              <TypingDots />
            </span>
          ) : subtitle}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <HeaderBtn icon={<Search className="w-4 h-4" />} />
        <HeaderBtn icon={<Phone className="w-4 h-4" />} />
        <HeaderBtn icon={<Video className="w-4 h-4" />} />
        <HeaderBtn icon={<MoreVertical className="w-4 h-4" />} />
      </div>
    </div>
  )
}

function HeaderBtn({ icon }: { icon: React.ReactNode }) {
  return (
    <button className="w-8 h-8 rounded-full flex items-center justify-center text-tg-text-secondary hover:bg-tg-bg-secondary dark:hover:bg-tg-bg-dark hover:text-gray-700 dark:hover:text-gray-300 transition">
      {icon}
    </button>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="typing-dot w-1 h-1 rounded-full bg-tg-blue animate-[typing-dot_1.4s_infinite_ease-in-out]"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  )
}
