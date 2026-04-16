'use client'

import { useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { AdminBtn } from '@/components/admin/ui'
import { Shield } from 'lucide-react'

export default function MakeAdminForm() {
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  async function handlePromote() {
    if (!username.trim()) return
    setLoading(true)
    setMsg(null)
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('profiles')
      .update({ role: 'admin' })
      .eq('username', username.trim())
      .select('username')
      .single()

    if (error || !data) {
      setMsg({ text: `User "@${username}" not found`, ok: false })
    } else {
      setMsg({ text: `@${data.username} is now an admin`, ok: true })
      setUsername('')
    }
    setLoading(false)
  }

  return (
    <div className="bg-[#0f1117] border border-white/5 rounded-xl p-5">
      <h3 className="text-white font-medium mb-4 text-sm flex items-center gap-2">
        <Shield className="w-4 h-4 text-purple-400" /> Promote User to Admin
      </h3>
      <div className="flex gap-2">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter username..."
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-tg-blue/50"
          onKeyDown={(e) => e.key === 'Enter' && handlePromote()}
        />
        <AdminBtn onClick={handlePromote} disabled={loading || !username.trim()} size="md">
          Promote
        </AdminBtn>
      </div>
      {msg && (
        <p className={`mt-2 text-xs ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>{msg.text}</p>
      )}
    </div>
  )
}
