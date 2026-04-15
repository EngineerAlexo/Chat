'use client'

import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useChatStore } from '@/lib/stores/useChatStore'
import Avatar from '@/components/ui/Avatar'
import { X, Camera, Save, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface Props {
  conversationId: string
  currentName: string
  currentAvatar: string | null
  onClose: () => void
}

export default function GroupEditModal({ conversationId, currentName, currentAvatar, onClose }: Props) {
  const { updateConversation } = useChatStore()
  const [name, setName] = useState(currentName)
  const [avatarUrl, setAvatarUrl] = useState(currentAvatar ?? '')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const supabase = getSupabaseClient()
    const path = `groups/${conversationId}/${Date.now()}.${file.name.split('.').pop()}`
    const { data, error: upErr } = await supabase.storage.from('media').upload(path, file, { upsert: true })
    if (!upErr && data) {
      const { data: urlData } = supabase.storage.from('media').getPublicUrl(data.path)
      setAvatarUrl(urlData.publicUrl)
    }
    setUploading(false)
    e.target.value = ''
  }

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    const supabase = getSupabaseClient()

    const { error: err } = await supabase
      .from('conversations')
      .update({ name: name.trim(), avatar_url: avatarUrl || null })
      .eq('id', conversationId)

    if (err) { setError(err.message); setSaving(false); return }

    // Optimistic update in store
    updateConversation(conversationId, { name: name.trim(), avatar_url: avatarUrl || null })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white dark:bg-tg-bg-dark-secondary rounded-2xl shadow-modal overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-tg-border dark:border-tg-border-dark">
          <h2 className="font-semibold text-gray-900 dark:text-white">Edit Info</h2>
          <button onClick={onClose} className="text-tg-text-secondary hover:text-gray-700 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Avatar */}
          <div className="flex justify-center">
            <div className="relative">
              <Avatar src={avatarUrl || null} name={name || 'G'} size={72} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute bottom-0 right-0 w-7 h-7 bg-tg-blue rounded-full flex items-center justify-center text-white shadow-md hover:bg-tg-blue-dark transition"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="text-xs text-tg-text-secondary mb-1 block">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              className="w-full px-3 py-2.5 rounded-xl border border-tg-border dark:border-tg-border-dark bg-tg-bg-secondary dark:bg-tg-bg-dark text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-tg-blue"
            />
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className={cn(
              'w-full py-2.5 rounded-xl font-semibold text-white text-sm transition flex items-center justify-center gap-2',
              'bg-tg-blue hover:bg-tg-blue-dark disabled:opacity-50'
            )}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Save</>}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
