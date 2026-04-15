'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useChatStore } from '@/lib/stores/useChatStore'
import type { Profile } from '@/lib/types'
import Avatar from '@/components/ui/Avatar'
import { Search, X, Loader2, Users } from 'lucide-react'

interface Props {
  onClose: () => void
  onCreated: (id: string) => void
}

export default function NewChatModal({ onClose, onCreated }: Props) {
  const { currentUser } = useChatStore()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState<string | null>(null)

  // Load all users initially, filter on query
  useEffect(() => {
    async function loadUsers() {
      if (!currentUser) return
      setLoading(true)
      const supabase = getSupabaseClient()
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', currentUser.id)
        .order('username')
        .limit(50)
      setResults(data ?? [])
      setLoading(false)
    }
    loadUsers()
  }, [currentUser])

  const filtered = results.filter((p) =>
    !query || p.username?.toLowerCase().includes(query.toLowerCase())
  )

  async function startChat(profile: Profile) {
    if (!currentUser || creating) return
    setCreating(profile.id)
    const supabase = getSupabaseClient()

    // Check existing private conversation
    const { data: myConvs } = await supabase
      .from('participants')
      .select('conversation_id')
      .eq('user_id', currentUser.id)

    if (myConvs?.length) {
      const myConvIds = myConvs.map((p) => p.conversation_id)
      const { data: shared } = await supabase
        .from('participants')
        .select('conversation_id')
        .eq('user_id', profile.id)
        .in('conversation_id', myConvIds)

      if (shared?.length) {
        const { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .eq('id', shared[0].conversation_id)
          .eq('type', 'private')
          .maybeSingle()
        if (conv) { onCreated(conv.id); return }
      }
    }

    // Create new
    const { data: conv } = await supabase
      .from('conversations')
      .insert({ type: 'private' })
      .select('id')
      .single()

    if (conv) {
      await supabase.from('participants').insert([
        { conversation_id: conv.id, user_id: currentUser.id, role: 'member' },
        { conversation_id: conv.id, user_id: profile.id, role: 'member' },
      ])
      onCreated(conv.id)
    }
    setCreating(null)
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm bg-white dark:bg-tg-bg-dark-secondary rounded-2xl shadow-modal overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-tg-border dark:border-tg-border-dark">
            <h2 className="font-semibold text-gray-900 dark:text-white">New Message</h2>
            <button onClick={onClose} className="text-tg-text-secondary hover:text-gray-700 dark:hover:text-gray-300">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className="p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tg-text-secondary" />
              <input
                autoFocus
                type="text"
                placeholder="Search by username..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-tg-bg-secondary dark:bg-tg-bg-dark text-sm text-gray-900 dark:text-white placeholder-tg-text-secondary focus:outline-none focus:ring-2 focus:ring-tg-blue/50"
              />
            </div>
          </div>

          {/* Results */}
          <div className="max-h-72 overflow-y-auto">
            {loading && (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-tg-blue" />
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="flex flex-col items-center py-8 text-tg-text-secondary">
                <Users className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">{query ? 'No users found' : 'No other users yet'}</p>
              </div>
            )}
            {filtered.map((profile) => (
              <button
                key={profile.id}
                onClick={() => startChat(profile)}
                disabled={!!creating}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-tg-bg-secondary dark:hover:bg-tg-bg-dark transition-colors"
              >
                <Avatar src={profile.avatar_url} name={profile.username ?? 'U'} size={40} online={profile.online_status} />
                <div className="text-left flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 dark:text-white">@{profile.username}</p>
                  {profile.bio && <p className="text-xs text-tg-text-secondary truncate">{profile.bio}</p>}
                </div>
                {creating === profile.id && <Loader2 className="w-4 h-4 animate-spin text-tg-blue flex-shrink-0" />}
              </button>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
