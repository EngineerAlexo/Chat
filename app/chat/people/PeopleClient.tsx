'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'
import Avatar from '@/components/ui/Avatar'
import { Search, MessageCircle, ArrowLeft, Loader2, Users, AlertCircle } from 'lucide-react'
import { formatLastSeen } from '@/lib/utils/formatTime'

interface Props {
  profiles: Profile[]
  currentUserId: string
}

export default function PeopleClient({ profiles, currentUserId }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [starting, setStarting] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const filtered = profiles.filter((p) =>
    !query ||
    p.username?.toLowerCase().includes(query.toLowerCase()) ||
    p.bio?.toLowerCase().includes(query.toLowerCase())
  )

  async function startChat(targetUserId: string) {
    if (starting) return // prevent double-click
    setStarting(targetUserId)
    setErrorMsg(null)

    try {
      const supabase = getSupabaseClient()

      // ── 1. Find existing private conversation shared by both users ──────────
      const { data: myRows, error: myErr } = await supabase
        .from('participants')
        .select('conversation_id')
        .eq('user_id', currentUserId)

      if (myErr) throw new Error('Could not load your conversations: ' + myErr.message)

      if (myRows && myRows.length > 0) {
        const myConvIds = myRows.map((r) => r.conversation_id)

        const { data: theirRows } = await supabase
          .from('participants')
          .select('conversation_id')
          .eq('user_id', targetUserId)
          .in('conversation_id', myConvIds)

        if (theirRows && theirRows.length > 0) {
          // Check each shared conv — pick the first private one
          const sharedIds = theirRows.map((r) => r.conversation_id)
          const { data: privateConv } = await supabase
            .from('conversations')
            .select('id')
            .eq('type', 'private')
            .in('id', sharedIds)
            .limit(1)
            .maybeSingle()

          if (privateConv) {
            console.log('[startChat] existing conversation found:', privateConv.id)
            router.push(`/chat/${privateConv.id}`)
            return // don't reset starting — we're navigating away
          }
        }
      }

      // ── 2. Create new private conversation ──────────────────────────────────
      console.log('[startChat] creating new conversation between', currentUserId, 'and', targetUserId)

      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .insert({ type: 'private' })
        .select('id')
        .single()

      if (convErr || !conv) {
        throw new Error('Failed to create conversation: ' + (convErr?.message ?? 'unknown'))
      }

      console.log('[startChat] conversation created:', conv.id)

      // ── 3. Insert both participants ──────────────────────────────────────────
      const { error: partErr } = await supabase
        .from('participants')
        .insert([
          { conversation_id: conv.id, user_id: currentUserId, role: 'member' },
          { conversation_id: conv.id, user_id: targetUserId, role: 'member' },
        ])

      if (partErr) {
        // Cleanup orphaned conversation
        await supabase.from('conversations').delete().eq('id', conv.id)
        throw new Error('Failed to add participants: ' + partErr.message)
      }

      console.log('[startChat] participants inserted, navigating to /chat/' + conv.id)
      router.push(`/chat/${conv.id}`)
      // don't reset starting — navigating away
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      console.error('[startChat] error:', msg)
      setErrorMsg(msg)
      setStarting(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-tg-bg-secondary dark:bg-tg-bg-dark-tertiary">
      {/* Header */}
      <div className="bg-white dark:bg-tg-bg-dark-secondary border-b border-tg-border dark:border-tg-border-dark px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => router.back()}
            className="text-tg-text-secondary hover:text-gray-700 dark:hover:text-gray-300"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-semibold text-gray-900 dark:text-white">People</h1>
          <span className="ml-auto text-xs text-tg-text-secondary">{profiles.length} users</span>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tg-text-secondary" />
          <input
            autoFocus
            type="text"
            placeholder="Search by username..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-tg-bg-secondary dark:bg-tg-bg-dark text-sm text-gray-900 dark:text-white placeholder-tg-text-secondary focus:outline-none focus:ring-2 focus:ring-tg-blue/50 transition"
          />
        </div>
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-4 py-2 flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-xs text-red-600 dark:text-red-400 flex-1">{errorMsg}</p>
            <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-tg-text-secondary">
            <Users className="w-10 h-10 mb-2 opacity-40" />
            <p className="text-sm">{query ? 'No users found' : 'No other users yet'}</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filtered.map((profile, i) => (
              <motion.div
                key={profile.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
                className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-tg-bg-dark-secondary border-b border-tg-border/50 dark:border-tg-border-dark/50 hover:bg-tg-bg-secondary dark:hover:bg-tg-bg-dark transition-colors"
              >
                <Avatar
                  src={profile.avatar_url}
                  name={profile.username ?? 'U'}
                  size={48}
                  online={profile.online_status}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                    @{profile.username}
                  </p>
                  <p className="text-xs text-tg-text-secondary truncate">
                    {profile.bio || (profile.online_status ? 'online' : formatLastSeen(profile.last_seen))}
                  </p>
                </div>
                <button
                  onClick={() => startChat(profile.id)}
                  disabled={starting !== null}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-tg-blue hover:bg-tg-blue-dark text-white text-xs font-semibold transition active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed min-w-[90px] justify-center"
                >
                  {starting === profile.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <><MessageCircle className="w-3.5 h-3.5" /> Message</>
                  )}
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
