'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useChatStore } from '@/lib/stores/useChatStore'
import type { Message } from '@/lib/types'
import { subscribeToConversation } from '@/lib/supabase/realtime'
import { getSupabaseClient } from '@/lib/supabase/client'
import ChatHeader from './ChatHeader'
import MessageList from './MessageList'
import MessageInput from './MessageInput'

const EMPTY_MESSAGES: Message[] = []

interface Props {
  conversationId: string
  currentUserId: string
}

export default function ChatWindow({ conversationId, currentUserId }: Props) {
  const { convMessages, hasMore, isLoadingMore } = useChatStore(
    useShallow((s) => ({
      convMessages: s.messages?.[conversationId] ?? EMPTY_MESSAGES,
      hasMore: s.hasMore?.[conversationId] ?? false,
      isLoadingMore: s.loadingMore?.[conversationId] ?? false,
    }))
  )

  const [loading, setLoading] = useState(true)
  const didFetch = useRef(false)

  // Reset when conversation changes
  useEffect(() => {
    didFetch.current = false
    const cached = useChatStore.getState().messages
    setLoading(!cached?.[conversationId])
  }, [conversationId])

  useEffect(() => {
    if (didFetch.current) return
    didFetch.current = true

    useChatStore.getState().setActiveConversationId(conversationId)
    subscribeToConversation(conversationId)

    // Already cached — show immediately
    const cached = useChatStore.getState().messages
    if (cached?.[conversationId] !== undefined) {
      setLoading(false)
      return () => useChatStore.getState().setActiveConversationId(null)
    }

    let active = true
    const supabase = getSupabaseClient()

    Promise.all([
      supabase
        .from('conversations')
        .select('*, participants(*, profile:profiles(*))')
        .eq('id', conversationId)
        .single(),
      supabase
        .from('messages')
        .select('*, sender:profiles(*), reply_to:messages!reply_to_id(*), reactions(*)')
        .eq('conversation_id', conversationId)
        .not('deleted_for', 'cs', `{${currentUserId}}`)
        .order('created_at', { ascending: false })
        .limit(30),
    ])
      .then(([convRes, msgRes]) => {
        if (!active) return
        if (convRes.data) useChatStore.getState().upsertConversation(convRes.data)
        const msgs = msgRes.data ? [...msgRes.data].reverse() : []
        useChatStore.getState().setMessages(conversationId, msgs)
        useChatStore.getState().setHasMore(conversationId, msgs.length === 30)
        setLoading(false)
      })
      .catch(() => { if (active) setLoading(false) })

    return () => {
      active = false
      useChatStore.getState().setActiveConversationId(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return
    const msgs = useChatStore.getState().messages?.[conversationId] ?? []
    if (!msgs.length) return

    useChatStore.getState().setLoadingMore(conversationId, true)
    const supabase = getSupabaseClient()

    const { data } = await supabase
      .from('messages')
      .select('*, sender:profiles(*), reply_to:messages!reply_to_id(*), reactions(*)')
      .eq('conversation_id', conversationId)
      .lt('created_at', msgs[0].created_at)
      .not('deleted_for', 'cs', `{${currentUserId}}`)
      .order('created_at', { ascending: false })
      .limit(30)

    if (data) {
      useChatStore.getState().prependMessages(conversationId, data.reverse())
      useChatStore.getState().setHasMore(conversationId, data.length === 30)
    }
    useChatStore.getState().setLoadingMore(conversationId, false)
  }, [conversationId, isLoadingMore, hasMore, currentUserId])

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <ChatHeader conversationId={conversationId} currentUserId={currentUserId} />

      <div className="messages-scroll">
        {loading ? (
          <MessageSkeleton />
        ) : (
          <MessageList
            key={conversationId}
            conversationId={conversationId}
            messages={convMessages}
            currentUserId={currentUserId}
            onLoadMore={loadMore}
            isLoadingMore={isLoadingMore}
          />
        )}
      </div>

      <div className="flex-shrink-0 pb-safe">
        <MessageInput conversationId={conversationId} currentUserId={currentUserId} />
      </div>
    </div>
  )
}

// ─── Skeleton shimmer ─────────────────────────────────────────────────────────
const SKELETON_ROWS = [
  { own: false, w: 'w-48' }, { own: true,  w: 'w-36' },
  { own: false, w: 'w-64' }, { own: false, w: 'w-40' },
  { own: true,  w: 'w-52' }, { own: true,  w: 'w-28' },
  { own: false, w: 'w-56' },
] as const

function MessageSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-3 py-4 h-full bg-tg-bg-secondary dark:bg-tg-bg-dark-tertiary overflow-hidden">
      {SKELETON_ROWS.map((row, i) => (
        <div key={i} className={`flex ${row.own ? 'justify-end' : 'justify-start'} items-end gap-2`}>
          {!row.own && <div className="w-6 h-6 rounded-full skeleton-shimmer flex-shrink-0" />}
          <div className={`h-9 rounded-2xl skeleton-shimmer ${row.w}`} />
        </div>
      ))}
    </div>
  )
}
