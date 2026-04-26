import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { Conversation, Message, Profile, TypingUser } from '@/lib/types'

interface ChatState {
  // Auth
  currentUser: Profile | null
  setCurrentUser: (user: Profile | null) => void

  // Conversations
  conversations: Conversation[]
  setConversations: (convs: Conversation[]) => void
  updateConversation: (id: string, updates: Partial<Conversation>) => void
  upsertConversation: (conv: Conversation) => void

  // Active chat
  activeConversationId: string | null
  setActiveConversationId: (id: string | null) => void

  // Messages per conversation
  messages: Record<string, Message[]>
  setMessages: (convId: string, msgs: Message[]) => void
  prependMessages: (convId: string, msgs: Message[]) => void
  addMessage: (convId: string, msg: Message) => void
  updateMessage: (convId: string, msgId: string, updates: Partial<Message>) => void
  removeMessage: (convId: string, msgId: string) => void
  upsertMessage: (convId: string, msg: Message) => void

  // Reply
  replyTo: Message | null
  setReplyTo: (msg: Message | null) => void

  // Edit
  editingMessage: Message | null
  setEditingMessage: (msg: Message | null) => void

  // Typing
  typingUsers: Record<string, TypingUser[]>
  setTypingUsers: (convId: string, users: TypingUser[]) => void

  // Online presence
  onlineUsers: Set<string>
  setOnlineUsers: (users: Set<string>) => void
  setUserOnline: (userId: string, online: boolean) => void

  // UI state
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  searchQuery: string
  setSearchQuery: (q: string) => void
  theme: 'light' | 'dark'
  toggleTheme: () => void

  // Pagination
  hasMore: Record<string, boolean>
  setHasMore: (convId: string, has: boolean) => void
  loadingMore: Record<string, boolean>
  setLoadingMore: (convId: string, loading: boolean) => void
}

export const useChatStore = create<ChatState>()(
  subscribeWithSelector((set, get) => ({
    currentUser: null,
    setCurrentUser: (user) => set({ currentUser: user }),

    conversations: [],
    setConversations: (convs) => set({ conversations: convs }),
    updateConversation: (id, updates) =>
      set((s) => ({
        conversations: s.conversations.map((c) => (c.id === id ? { ...c, ...updates } : c)),
      })),
    upsertConversation: (conv) =>
      set((s) => {
        const exists = s.conversations.find((c) => c.id === conv.id)
        if (exists) {
          return { conversations: s.conversations.map((c) => (c.id === conv.id ? { ...c, ...conv } : c)) }
        }
        return { conversations: [conv, ...s.conversations] }
      }),

    activeConversationId: null,
    setActiveConversationId: (id) => set({ activeConversationId: id }),

    messages: {},
    setMessages: (convId, msgs) =>
      set((s) => ({ messages: { ...s.messages, [convId]: msgs } })),
    prependMessages: (convId, msgs) =>
      set((s) => {
        const existing = s.messages[convId] ?? []
        const existingIds = new Set(existing.map((m) => m.id))
        const newMsgs = msgs.filter((m) => !existingIds.has(m.id))
        return { messages: { ...s.messages, [convId]: [...newMsgs, ...existing] } }
      }),
    addMessage: (convId, msg) =>
      set((s) => {
        const existing = s.messages[convId] ?? []
        if (existing.find((m) => m.id === msg.id)) return s
        return { messages: { ...s.messages, [convId]: [...existing, msg] } }
      }),
    updateMessage: (convId, msgId, updates) =>
      set((s) => ({
        messages: {
          ...s.messages,
          [convId]: (s.messages[convId] ?? []).map((m) =>
            m.id === msgId ? { ...m, ...updates } : m
          ),
        },
      })),
    removeMessage: (convId, msgId) =>
      set((s) => ({
        messages: {
          ...s.messages,
          [convId]: (s.messages[convId] ?? []).filter((m) => m.id !== msgId),
        },
      })),
    upsertMessage: (convId, msg) =>
      set((s) => {
        const existing = s.messages[convId] ?? []
        const idx = existing.findIndex((m) => m.id === msg.id)
        if (idx >= 0) {
          const updated = [...existing]
          updated[idx] = { ...existing[idx], ...msg }
          return { messages: { ...s.messages, [convId]: updated } }
        }
        return { messages: { ...s.messages, [convId]: [...existing, msg] } }
      }),

    replyTo: null,
    setReplyTo: (msg) => set({ replyTo: msg }),

    editingMessage: null,
    setEditingMessage: (msg) => set({ editingMessage: msg }),

    typingUsers: {},
    setTypingUsers: (convId, users) =>
      set((s) => ({ typingUsers: { ...(s.typingUsers ?? {}), [convId]: users } })),

    onlineUsers: new Set(),
    setOnlineUsers: (users) => set({ onlineUsers: users }),
    setUserOnline: (userId, online) =>
      set((s) => {
        const next = new Set(s.onlineUsers)
        if (online) next.add(userId)
        else next.delete(userId)
        return { onlineUsers: next }
      }),

    sidebarOpen: true,
    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    searchQuery: '',
    setSearchQuery: (q) => set({ searchQuery: q }),
    theme: 'light',
    toggleTheme: () =>
      set((s) => {
        const next = s.theme === 'light' ? 'dark' : 'light'
        if (typeof document !== 'undefined') {
          document.documentElement.classList.toggle('dark', next === 'dark')
          localStorage.setItem('tg-theme', next)
        }
        return { theme: next }
      }),

    hasMore: {},
    setHasMore: (convId, has) =>
      set((s) => ({ hasMore: { ...(s.hasMore ?? {}), [convId]: has } })),
    loadingMore: {},
    setLoadingMore: (convId, loading) =>
      set((s) => ({ loadingMore: { ...(s.loadingMore ?? {}), [convId]: loading } })),
  }))
)
