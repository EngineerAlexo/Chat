'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'
import Avatar from '@/components/ui/Avatar'
import { Search, ArrowLeft, Check, Loader2, Users, Radio, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface Props {
  profiles: Profile[]
  currentUserId: string
}

export default function NewGroupClient({ profiles, currentUserId }: Props) {
  const router = useRouter()
  const [type, setType] = useState<'group' | 'channel'>('group')
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [step, setStep] = useState<'members' | 'name'>('members')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const filtered = profiles.filter((p) =>
    !query || p.username?.toLowerCase().includes(query.toLowerCase())
  )

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function create() {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setErrorMsg('Please enter a name')
      return
    }
    if (creating) return

    setCreating(true)
    setErrorMsg(null)

    try {
      const supabase = getSupabaseClient()

      // ── 1. Create conversation ───────────────────────────────────────────────
      console.log('[createGroup] inserting conversation:', { name: trimmedName, type })

      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .insert({ name: trimmedName, type })
        .select('id')
        .single()

      if (convErr || !conv) {
        throw new Error('Failed to create ' + type + ': ' + (convErr?.message ?? 'unknown error'))
      }

      console.log('[createGroup] conversation created:', conv.id)

      // ── 2. Insert participants (creator as owner + selected members) ─────────
      const memberIds = Array.from(selected)
      const participantRows = [
        { conversation_id: conv.id, user_id: currentUserId, role: 'owner' as const },
        ...memberIds.map((uid) => ({
          conversation_id: conv.id,
          user_id: uid,
          role: 'member' as const,
        })),
      ]

      const { error: partErr } = await supabase
        .from('participants')
        .insert(participantRows)

      if (partErr) {
        // Cleanup
        await supabase.from('conversations').delete().eq('id', conv.id)
        throw new Error('Failed to add members: ' + partErr.message)
      }

      console.log('[createGroup] participants inserted, navigating to /chat/' + conv.id)
      router.push(`/chat/${conv.id}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      console.error('[createGroup] error:', msg)
      setErrorMsg(msg)
      setCreating(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-tg-bg-secondary dark:bg-tg-bg-dark-tertiary">
      {/* Header */}
      <div className="bg-white dark:bg-tg-bg-dark-secondary border-b border-tg-border dark:border-tg-border-dark px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => step === 'name' ? setStep('members') : router.back()}
            className="text-tg-text-secondary hover:text-gray-700 dark:hover:text-gray-300"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-semibold text-gray-900 dark:text-white flex-1">
            {step === 'members' ? 'Add Members' : `Name your ${type}`}
          </h1>
          {/* Show Next only on members step — allow 0 members (creator only) */}
          {step === 'members' && (
            <button
              onClick={() => setStep('name')}
              className="text-tg-blue font-semibold text-sm"
            >
              Next →
            </button>
          )}
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

      {step === 'members' ? (
        <>
          {/* Type selector */}
          <div className="bg-white dark:bg-tg-bg-dark-secondary border-b border-tg-border dark:border-tg-border-dark px-4 py-3 flex gap-3">
            <button
              onClick={() => setType('group')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition',
                type === 'group'
                  ? 'bg-tg-blue text-white'
                  : 'bg-tg-bg-secondary dark:bg-tg-bg-dark text-tg-text-secondary'
              )}
            >
              <Users className="w-4 h-4" /> Group
            </button>
            <button
              onClick={() => setType('channel')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition',
                type === 'channel'
                  ? 'bg-tg-blue text-white'
                  : 'bg-tg-bg-secondary dark:bg-tg-bg-dark text-tg-text-secondary'
              )}
            >
              <Radio className="w-4 h-4" /> Channel
            </button>
          </div>

          {/* Search */}
          <div className="bg-white dark:bg-tg-bg-dark-secondary border-b border-tg-border dark:border-tg-border-dark px-4 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tg-text-secondary" />
              <input
                type="text"
                placeholder="Search users to add..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-tg-bg-secondary dark:bg-tg-bg-dark text-sm text-gray-900 dark:text-white placeholder-tg-text-secondary focus:outline-none focus:ring-2 focus:ring-tg-blue/50"
              />
            </div>
          </div>

          {/* Selected count */}
          <div className="bg-tg-bg-secondary dark:bg-tg-bg-dark border-b border-tg-border dark:border-tg-border-dark px-4 py-1.5">
            <p className="text-xs text-tg-text-secondary">
              {selected.size > 0
                ? `${selected.size} member${selected.size !== 1 ? 's' : ''} selected`
                : 'Select members (optional — you can add later)'}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-tg-text-secondary">
                <p className="text-sm">No users found</p>
              </div>
            ) : (
              filtered.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => toggleSelect(profile.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-tg-bg-dark-secondary border-b border-tg-border/50 dark:border-tg-border-dark/50 hover:bg-tg-bg-secondary dark:hover:bg-tg-bg-dark transition-colors text-left"
                >
                  <Avatar src={profile.avatar_url} name={profile.username ?? 'U'} size={44} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 dark:text-white">@{profile.username}</p>
                    {profile.bio && (
                      <p className="text-xs text-tg-text-secondary truncate">{profile.bio}</p>
                    )}
                  </div>
                  <div className={cn(
                    'w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition',
                    selected.has(profile.id)
                      ? 'bg-tg-blue border-tg-blue'
                      : 'border-tg-border dark:border-tg-border-dark'
                  )}>
                    {selected.has(profile.id) && <Check className="w-3.5 h-3.5 text-white" />}
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      ) : (
        /* ── Name step ─────────────────────────────────────────────────────── */
        <div className="flex-1 p-4 space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-tg-bg-dark-secondary rounded-2xl p-4 space-y-3"
          >
            <label className="text-xs text-tg-text-secondary uppercase tracking-wide font-medium">
              {type === 'group' ? 'Group' : 'Channel'} Name *
            </label>
            <input
              autoFocus
              type="text"
              placeholder={type === 'group' ? 'e.g. Team Chat' : 'e.g. Announcements'}
              value={name}
              onChange={(e) => { setName(e.target.value); setErrorMsg(null) }}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              maxLength={64}
              className="w-full px-3 py-2.5 rounded-xl border border-tg-border dark:border-tg-border-dark bg-tg-bg-secondary dark:bg-tg-bg-dark text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-tg-blue"
            />
            <p className="text-xs text-tg-text-secondary">
              {selected.size > 0
                ? `${selected.size} member${selected.size !== 1 ? 's' : ''} will be added`
                : 'No members selected — you can add them later'}
            </p>
          </motion.div>

          <button
            onClick={create}
            disabled={!name.trim() || creating}
            className="w-full py-3 rounded-2xl bg-tg-blue hover:bg-tg-blue-dark text-white font-semibold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            {creating
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
              : <>Create {type === 'group' ? 'Group' : 'Channel'}</>}
          </button>
        </div>
      )}
    </div>
  )
}
