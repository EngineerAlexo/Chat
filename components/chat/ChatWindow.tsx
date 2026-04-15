'use client'

import { useEffect, useCallback } from 'react'
import { useChatStore } from '@/lib/stores/useChatStore'
import { subscribeToConversation } from '@/lib/supabase/realtime'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { Conversation, Message } from '@/lib/types'
import ChatHeader from './ChatHeader'
import MessageList from './MessageList'
import MessageInput from './MessageInput'

interface Props {
  conversationId: string
  initialConversation: Conversation | null
  initialMessages: Message[]
  currentUserId: string
}

export default function ChatWindow({ conversationId, initialConversation, initialMessages, currentUserId }: Props) {
  const {
    setMessages, upsertConversation, setHasMore, setActiveConversationId,
    messages, hasMore, loadingMore, setLoadingMore, prependMessages
  } = useChatStore()

  useEffect(() => {
    // Initialize this conversation's data
    setMessages(conversationId, initialMessages)
    if (initialConversation) upsertConversation(initialConversation)
    setHasMore(conversationId, initialMessages.length === 50)
    setActiveConversationId(conversationId)

    // Subscribe to realtime
    subscribeToConversation(conversationId)

    return () => {
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
      {/* Header — fixed height */}
      <ChatHeader conversationId={conversationId} currentUserId={currentUserId} />

      {/* Messages — takes all remaining space, scrollable with momentum */}
      <div className="messages-scroll">
        <MessageList
          conversationId={conversationId}
          messages={convMessages}
          currentUserId={currentUserId}
          onLoadMore={loadMore}
          isLoadingMore={loadingMore[conversationId] ?? false}
        />
      </div>

      {/* Input — always at bottom, never hidden by keyboard */}
      <div className="flex-shrink-0 pb-safe">
        <MessageInput conversationId={conversationId} currentUserId={currentUserId} />
      </div>
    </div>
  )
}
