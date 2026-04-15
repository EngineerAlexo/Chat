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
      async (payload) => {
        const msg = payload.new as Message
        // Fetch full message with sender
        const { data } = await supabase
          .from('messages')
          .select('*, sender:profiles(*), reply_to:messages!reply_to_id(*), reactions(*)')
          .eq('id', msg.id)
          .single()

        if (data) {
          const currentUser = useChatStore.getState().currentUser
          // Don't add if it's our own optimistic message (already in store)
          const existing = useChatStore.getState().messages[conversationId]
          const alreadyExists = existing?.find(
            (m) => m.id === data.id || (m.optimistic && m.content === data.content && m.sender_id === data.sender_id)
          )
          if (alreadyExists && alreadyExists.optimistic) {
            useChatStore.getState().updateMessage(conversationId, alreadyExists.id, { ...data, optimistic: false, status: 'delivered' })
          } else if (!alreadyExists) {
            useChatStore.getState().addMessage(conversationId, { ...data, status: data.sender_id === currentUser?.id ? 'sent' : 'delivered' })
          }
          // Update last message in conversation list
          useChatStore.getState().updateConversation(conversationId, { last_message: data })
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
  if (!messageChannel) return
  messageChannel.send({
    type: 'broadcast',
    event: 'typing',
    payload: { user_id: user.user_id, username: user.username, avatar_url: user.avatar_url },
  })
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
