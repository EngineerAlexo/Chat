'use client'

import { useEffect, useCallback, useState } from 'react'
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

export default function ChatWindow({ conversationId, currentUserId }: Props) {
  const {
    setMessages, upsertConversation, setHasMore, setActiveConversationId,
    messages, hasMore, loadingMore, setLoadingMore, prependMessages,
    conversations,
  } = useChatStore()

  const [loading, setLoading] = useState(false)

  // Check if we already have this conversation's messages cached
  const cachedMessages = messages[conversationId]
  const hasCached = cachedMessages !== undefined

  useEffect(() => {
    setActiveConversationId(conversationId)
    subscribeToConversation(conversationId)

    // If already cached, skip fetch — use store data instantly
    if (hasCached) {
      return () => { setActiveConversationId(null) }
    }

    // Not cached — fetch in background, show skeleton meanwhile
    let cancelled = false
    setLoading(true)

    async function fetchData() {
      const supabase = getSupabaseClient()

      // Run conversation + messages in parallel
      const [convResult, msgResult] = await Promise.all([
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
          .limit(50),
      ])

      if (cancelled) return

      if (convResult.data) upsertConversation(convResult.data)

      const msgs = msgResult.data ? [...msgResult.data].reverse() : []
      setMessages(conversationId, msgs)
      setHasMore(conversationId, msgs.length === 50)
      setLoading(false)
    }

    fetchData()

    return () => {
      cancelled = true
      setActiveConversationId(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  const loadMore = useCallback(async () => {
    if (loadingMore[conversationId] || !hasMore[conversationId]) return
    const msgs = messages[conversationId] ?? []
    if (!msgs.length) return

    setLoadingMore(conversationId, true)
    const supabase = getSupabaseClient()
    const oldest = msgs[0]

    const { data } = await supabase
      .from('messages')
      .select('*, sender:profiles(*), reply_to:messages!reply_to_id(*), reactions(*)')
      .eq('conversation_id', conversationId)
      .lt('created_at', oldest.created_at)
      .not('deleted_for', 'cs', `{${currentUserId}}`)
      .order('created_at', { ascending: false })
      .limit(50)

    if (data) {
      prependMessages(conversationId, data.reverse())
      setHasMore(conversationId, data.length === 50)
    }
    setLoadingMore(conversationId, false)
  }, [conversationId, loadingMore, hasMore, messages, currentUserId, setLoadingMore, prependMessages, setHasMore])

  const convMessages = messages[conversationId] ?? []

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Header renders immediately — no data needed */}
      <ChatHeader conversationId={conversationId} currentUserId={currentUserId} />

      {/* Messages area */}
      <div className="messages-scroll">
        {loading && !hasCached ? (
          <MessageSkeleton />
        ) : (
          <MessageList
            conversationId={conversationId}
            messages={convMessages}
            currentUserId={currentUserId}
            onLoadMore={loadMore}
            isLoadingMore={loadingMore[conversationId] ?? false}
          />
        )}
      </div>

      {/* Input — always visible, no data dependency */}
      <div className="flex-shrink-0 pb-safe">
        <MessageInput conversationId={conversationId} currentUserId={currentUserId} />
      </div>
    </div>
  )
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function MessageSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-3 py-4 h-full bg-tg-bg-secondary dark:bg-tg-bg-dark-tertiary">
      {/* Simulate a few incoming + outgoing bubbles */}
      {[
        { own: false, w: 'w-48' },
        { own: true,  w: 'w-36' },
        { own: false, w: 'w-64' },
        { own: false, w: 'w-40' },
        { own: true,  w: 'w-52' },
        { own: true,  w: 'w-28' },
        { own: false, w: 'w-56' },
      ].map((item, i) => (
        <div key={i} className={`flex ${item.own ? 'justify-end' : 'justify-start'}`}>
          {!item.own && (
            <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse mr-2 flex-shrink-0 self-end" />
          )}
          <div
            className={`h-9 rounded-2xl animate-pulse ${item.w} ${
              item.own
                ? 'bg-tg-blue/20 dark:bg-tg-blue/30'
                : 'bg-gray-200 dark:bg-gray-700'
            }`}
          />
        </div>
      ))}
    </div>
  )
}
