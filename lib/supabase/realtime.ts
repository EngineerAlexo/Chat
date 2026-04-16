import { getSupabaseClient } from './client'
import { useChatStore } from '@/lib/stores/useChatStore'
import type { Message, Reaction } from '@/lib/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

let messageChannel: RealtimeChannel | null = null
let presenceChannel: RealtimeChannel | null = null
const typingTimers: Record<string, NodeJS.Timeout> = {}

export function subscribeToConversation(conversationId: string) {
  const supabase = getSupabaseClient()
  const store = useChatStore.getState()

  if (messageChannel) {
    supabase.removeChannel(messageChannel)
  }

  messageChannel = supabase
    .channel(`conv:${conversationId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => {
        // Use payload directly — no extra fetch needed
        const msg = payload.new as Message
        const currentUser = useChatStore.getState().currentUser
        const existing = useChatStore.getState().messages[conversationId]

        // Match against optimistic message (same sender + content, still pending)
        const optimistic = existing?.find(
          (m) => m.optimistic && m.content === msg.content && m.sender_id === msg.sender_id
        )

        if (optimistic) {
          // Replace optimistic with real message
          useChatStore.getState().updateMessage(conversationId, optimistic.id, {
            ...msg,
            optimistic: false,
            status: 'delivered',
          })
        } else if (!existing?.find((m) => m.id === msg.id)) {
          // New message from another user
          useChatStore.getState().addMessage(conversationId, {
            ...msg,
            status: msg.sender_id === currentUser?.id ? 'sent' : 'delivered',
          })
        }

        // Update sidebar last message
        useChatStore.getState().updateConversation(conversationId, { last_message: msg })

        // Foreground notification — only when message is from someone else
        // and the document is hidden (user switched tabs/apps)
        if (
          msg.sender_id !== currentUser?.id &&
          typeof document !== 'undefined' &&
          document.hidden &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          // Find sender name from conversations
          const convs = useChatStore.getState().conversations
          const conv = convs.find((c) => c.id === conversationId)
          const sender = conv?.participants?.find((p) => p.user_id === msg.sender_id)
          const senderName = sender?.profile?.username ?? 'New message'
          const body = msg.content ?? (msg.media_type ? `📎 ${msg.media_type}` : '')

          navigator.serviceWorker.ready.then((reg) => {
            reg.showNotification(senderName, {
              body,
              icon: sender?.profile?.avatar_url ?? '/icons/icon-192.png',
              badge: '/icons/icon-192.png',
              tag: conversationId,
              renotify: true,
              data: { conversationId },
            }).catch(() => {})
          }).catch(() => {})
        }
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => {
        const msg = payload.new as Message
        useChatStore.getState().upsertMessage(conversationId, msg)
      }
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => {
        useChatStore.getState().removeMessage(conversationId, payload.old.id)
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'reactions' },
      async () => {
        // Refetch reactions for visible messages
        const msgs = useChatStore.getState().messages[conversationId] ?? []
        const ids = msgs.slice(-50).map((m) => m.id)
        if (!ids.length) return
        const { data } = await supabase
          .from('reactions')
          .select('*, profile:profiles(*)')
          .in('message_id', ids)
        if (data) {
          const byMsg: Record<string, Reaction[]> = {}
          data.forEach((r) => {
            if (!byMsg[r.message_id]) byMsg[r.message_id] = []
            byMsg[r.message_id].push(r)
          })
          Object.entries(byMsg).forEach(([msgId, reactions]) => {
            useChatStore.getState().updateMessage(conversationId, msgId, { reactions })
          })
        }
      }
    )
    .on('broadcast', { event: 'typing' }, (payload) => {
      const { user_id, username, avatar_url } = payload.payload as { user_id: string; username: string; avatar_url: string }
      const currentUser = useChatStore.getState().currentUser
      if (user_id === currentUser?.id) return

      const current = useChatStore.getState().typingUsers[conversationId] ?? []
      const filtered = current.filter((u) => u.user_id !== user_id)
      useChatStore.getState().setTypingUsers(conversationId, [...filtered, { user_id, username, avatar_url }])

      // Clear after 3s
      if (typingTimers[user_id]) clearTimeout(typingTimers[user_id])
      typingTimers[user_id] = setTimeout(() => {
        const curr = useChatStore.getState().typingUsers[conversationId] ?? []
        useChatStore.getState().setTypingUsers(conversationId, curr.filter((u) => u.user_id !== user_id))
      }, 3000)
    })
    .subscribe()

  return messageChannel
}

export function broadcastTyping(conversationId: string, user: { user_id: string; username: string | null; avatar_url: string | null }) {
  // messageChannel may be null briefly on mobile — silently skip, not an error
  if (!messageChannel) return
  try {
    messageChannel.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        user_id: user.user_id,
        username: user.username ?? '',
        avatar_url: user.avatar_url ?? '',
      },
    })
  } catch {
    // Channel not ready yet — ignore
  }
}

export function subscribeToPresence(currentUserId: string) {
  const supabase = getSupabaseClient()

  if (presenceChannel) {
    supabase.removeChannel(presenceChannel)
  }

  presenceChannel = supabase.channel('presence:global', {
    config: { presence: { key: currentUserId } },
  })

  presenceChannel
    .on('presence', { event: 'sync' }, () => {
      const state = presenceChannel!.presenceState()
      const online = new Set(Object.keys(state))
      useChatStore.getState().setOnlineUsers(online)
    })
    .on('presence', { event: 'join' }, ({ key }) => {
      useChatStore.getState().setUserOnline(key, true)
    })
    .on('presence', { event: 'leave' }, ({ key }) => {
      useChatStore.getState().setUserOnline(key, false)
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await presenceChannel!.track({ user_id: currentUserId, online_at: new Date().toISOString() })
      }
    })

  return presenceChannel
}

export function unsubscribeAll() {
  const supabase = getSupabaseClient()
  if (messageChannel) supabase.removeChannel(messageChannel)
  if (presenceChannel) supabase.removeChannel(presenceChannel)
  messageChannel = null
  presenceChannel = null
}
