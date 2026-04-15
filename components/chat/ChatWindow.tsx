'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { useChatStore } from '@/lib/stores/useChatStore'
import { subscribeToConversation } from '@/lib/supabase/realtime'
import { getSupabaseClient } from '@/lib/supabase/client'
import ChatHeader from './ChatHeader'
import MessageList from './MessageList'
import MessageInput from './MessageInput'

interface Props {
  conversationId: string
  currentUserId: string
}

// Track fetched conversations across mounts (module-level, not per-render)
const fetchedConversations = new Set<string>()

export default function ChatWindow({ conversationId, currentUserId }: Props) {
  // Single store call — stable action refs don't cause re-renders
  const store = useChatStore()

  const convMessages  = store.messages[conversationId] ?? []
  const hasMore       = store.hasMore[conversationId] ?? false
  const isLoadingMore = store.loadingMore[conversationId] ?? false

  const [loading, setLoading] = useState(false)
  const cancelRef = useRef(false)

  useEffect(() => {
    cancelRef.current = false
    store.setActiveConversationId(conversationId)
    subscribeToConversation(conversationId)

    // Already fetched — use cached data instantly, no spinner
    if (fetchedConversations.has(conversationId)) {
      return () => {
        cancelRef.current = true
        store.setActiveConversationId(null)
      }
    }

    // Check if store already has messages for this conversation
    const alreadyCached = useChatStore.getState().messages[conversationId] !== undefined
    if (alreadyCached) {
      fetchedConversations.add(conversationId)
      return () => {
        cancelRef.current = true
        store.setActiveConversationId(null)
      }
    }

    // First load — show skeleton, fetch in background
    fetchedConversations.add(conversationId)
    setLoading(true)

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
    ]).then(([convResult, msgResult]) => {
      if (cancelRef.current) return

      if (convResult.data) {
        useChatStore.getState().upsertConversation(convResult.data)
      }

      const msgs = msgResult.data ? [...msgResult.data].reverse() : []
      useChatStore.getState().setMessages(conversationId, msgs)
      useChatStore.getState().setHasMore(conversationId, msgs.length === 30)
      setLoading(false)
    }).catch(() => {
      if (!cancelRef.current) setLoading(false)
    })

    return () => {
      cancelRef.current = true
      store.setActiveConversationId(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return
    const msgs = useChatStore.getState().messages[conversationId] ?? []
    if (!msgs.length) return

    useChatStore.getState().setLoadingMore(conversationId, true)
    const supabase = getSupabaseClient()
    const oldest = msgs[0]

    const { data } = await supabase
      .from('messages')
      .select('*, sender:profiles(*), reply_to:messages!reply_to_id(*), reactions(*)')
      .eq('conversation_id', conversationId)
      .lt('created_at', oldest.created_at)
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

// ─── Skeleton ─────────────────────────────────────────────────────────────────
const SKELETON_ITEMS = [
  { own: false, w: 'w-48' },
  { own: true,  w: 'w-36' },
  { own: false, w: 'w-64' },
  { own: false, w: 'w-40' },
  { own: true,  w: 'w-52' },
  { own: true,  w: 'w-28' },
  { own: false, w: 'w-56' },
] as const

function MessageSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-3 py-4 h-full bg-tg-bg-secondary dark:bg-tg-bg-dark-tertiary overflow-hidden">
      {SKELETON_ITEMS.map((item, i) => (
        <div key={i} className={`flex ${item.own ? 'justify-end' : 'justify-start'}`}>
          {!item.own && (
            <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse mr-2 flex-shrink-0 self-end" />
          )}
          <div className={`h-9 rounded-2xl animate-pulse ${item.w} ${
            item.own ? 'bg-tg-blue/20 dark:bg-tg-blue/30' : 'bg-gray-200 dark:bg-gray-700'
          }`} />
        </div>
      ))}
    </div>
  )
}
