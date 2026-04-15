'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useChatStore } from '@/lib/stores/useChatStore'
import type { Profile } from '@/lib/types'
import Avatar from '@/components/ui/Avatar'
import { Camera, Save, LogOut, Moon, Sun, ArrowLeft, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface Props { profile: Profile | null }

export default function SettingsClient({ profile }: Props) {
  const router = useRouter()
  const { theme, toggleTheme, setCurrentUser } = useChatStore()
  const [username, setUsername] = useState(profile?.username ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleSave() {
    if (!profile) return
    setSaving(true)
    setError('')
    const supabase = getSupabaseClient()

    const cleanUsername = username.toLowerCase().trim().replace(/\s+/g, '_')
    if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
      setError('Username: 3-20 chars, letters/numbers/underscore only')
      setSaving(false)
      return
    }

    // Check uniqueness (exclude self)
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .neq('id', profile.id)
      .maybeSingle()

    if (existing) {
      setError('Username already taken')
      setSaving(false)
      return
    }

    const { data: updated, error: err } = await supabase
      .from('profiles')
      .update({ username: cleanUsername, bio, avatar_url: avatarUrl })
      .eq('id', profile.id)
      .select('*')
      .single()

    if (err) { setError(err.message); setSaving(false); return }
    if (updated) setCurrentUser(updated)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile) return
    setUploading(true)
    const supabase = getSupabaseClient()
    const path = `avatars/${profile.id}/${Date.now()}.${file.name.split('.').pop()}`
    const { data, error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (!error && data) {
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(data.path)
      setAvatarUrl(urlData.publicUrl)
    }
    setUploading(false)
    e.target.value = ''
  }

  async function handleLogout() {
    const supabase = getSupabaseClient()
    if (profile) {
      await supabase.from('profiles').update({ online_status: false }).eq('id', profile.id)
    }
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-tg-bg-secondary dark:bg-tg-bg-dark-tertiary overflow-y-auto">
      {/* Header */}
      <div className="bg-white dark:bg-tg-bg-dark-secondary border-b border-tg-border dark:border-tg-border-dark px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.back()} className="text-tg-text-secondary hover:text-gray-700 dark:hover:text-gray-300">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-semibold text-gray-900 dark:text-white">Settings</h1>
      </div>

      <div className="max-w-lg mx-auto w-full p-4 space-y-4">
        {/* Avatar */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white dark:bg-tg-bg-dark-secondary rounded-2xl p-6 flex flex-col items-center gap-4">
          <div className="relative">
            <Avatar src={avatarUrl} name={username || 'U'} size={80} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 w-7 h-7 bg-tg-blue rounded-full flex items-center justify-center text-white shadow-md hover:bg-tg-blue-dark transition"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </div>
          <p className="text-sm text-tg-text-secondary">Tap camera to change photo</p>
        </motion.div>

        {/* Profile fields */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="bg-white dark:bg-tg-bg-dark-secondary rounded-2xl p-4 space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm uppercase tracking-wide text-tg-text-secondary">Profile</h2>
          <div>
            <label className="text-xs text-tg-text-secondary mb-1 block">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              className="w-full px-3 py-2.5 rounded-xl border border-tg-border dark:border-tg-border-dark bg-tg-bg-secondary dark:bg-tg-bg-dark text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-tg-blue transition"
            />
          </div>
          <div>
            <label className="text-xs text-tg-text-secondary mb-1 block">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Write something about yourself..."
              rows={3}
              maxLength={200}
              className="w-full px-3 py-2.5 rounded-xl border border-tg-border dark:border-tg-border-dark bg-tg-bg-secondary dark:bg-tg-bg-dark text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-tg-blue transition resize-none"
            />
            <p className="text-xs text-tg-text-secondary text-right mt-1">{bio.length}/200</p>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              'w-full py-2.5 rounded-xl font-semibold text-white text-sm transition flex items-center justify-center gap-2',
              saved ? 'bg-green-500' : 'bg-tg-blue hover:bg-tg-blue-dark',
              saving && 'opacity-70 cursor-not-allowed'
            )}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <><Check className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> Save Changes</>}
          </button>
        </motion.div>

        {/* Appearance */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white dark:bg-tg-bg-dark-secondary rounded-2xl p-4">
          <h2 className="font-semibold text-tg-text-secondary text-sm uppercase tracking-wide mb-3">Appearance</h2>
          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-tg-bg-secondary dark:hover:bg-tg-bg-dark transition"
          >
            <span className="text-sm text-gray-900 dark:text-white">
              {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
            </span>
            {theme === 'dark'
              ? <Moon className="w-5 h-5 text-indigo-400" />
              : <Sun className="w-5 h-5 text-yellow-500" />}
          </button>
        </motion.div>

        {/* Logout */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <button
            onClick={handleLogout}
            className="w-full py-3 rounded-2xl bg-white dark:bg-tg-bg-dark-secondary text-red-500 font-semibold text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </motion.div>
      </div>
    </div>
  )
}
