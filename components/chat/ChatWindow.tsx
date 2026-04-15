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

export default function ChatWindow({ conversationId, currentUserId }: Props) {
  // ── Granular store selectors — only re-render when needed ─────────────────
  const setMessages        = useChatStore((s) => s.setMessages)
  const upsertConversation = useChatStore((s) => s.upsertConversation)
  const setHasMore         = useChatStore((s) => s.setHasMore)
  const setActiveId        = useChatStore((s) => s.setActiveConversationId)
  const prependMessages    = useChatStore((s) => s.prependMessages)
  const setLoadingMore     = useChatStore((s) => s.setLoadingMore)

  // These selectors are conversation-scoped — only update when THIS conv changes
  const convMessages  = useChatStore((s) => s.messages[conversationId] ?? [])
  const hasMore       = useChatStore((s) => s.hasMore[conversationId] ?? false)
  const isLoadingMore = useChatStore((s) => s.loadingMore[conversationId] ?? false)

  const [loading, setLoading] = useState(false)

  // Track whether we've already fetched this conversation in this session
  const fetchedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    setActiveId(conversationId)
    subscribeToConversation(conversationId)

    // Already fetched this conversation — use cached data, no spinner
    if (fetchedRef.current.has(conversationId)) {
      return () => setActiveId(null)
    }

    // Check store cache (messages already loaded from a previous mount)
    const cached = useChatStore.getState().messages[conversationId]
    if (cached !== undefined) {
      fetchedRef.current.add(conversationId)
      return () => setActiveId(null)
    }

    // First time — fetch in background, show skeleton
    fetchedRef.current.add(conversationId)
    let cancelled = false
    setLoading(true)

    ;(async () => {
      const supabase = getSupabaseClient()

      // Parallel fetch: conversation metadata + last 30 messages
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
          .limit(30),
      ])

      if (cancelled) return

      if (convResult.data) upsertConversation(convResult.data)

      const msgs = msgResult.data ? [...msgResult.data].reverse() : []
      setMessages(conversationId, msgs)
      setHasMore(conversationId, msgs.length === 30)
      setLoading(false)
    })()

    return () => {
      cancelled = true
      setActiveId(null)
    }
  // conversationId is the only real dependency — all store actions are stable refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return
    const msgs = useChatStore.getState().messages[conversationId] ?? []
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
      .limit(30)

    if (data) {
      prependMessages(conversationId, data.reverse())
      setHasMore(conversationId, data.length === 30)
    }
    setLoadingMore(conversationId, false)
  }, [conversationId, isLoadingMore, hasMore, currentUserId, setLoadingMore, prependMessages, setHasMore])

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
