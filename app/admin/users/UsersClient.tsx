'use client'

import { useState, useMemo } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { SectionHeader, Table, Tr, Td, Badge, AdminAvatar, SearchInput, AdminBtn } from '@/components/admin/ui'
import { formatDistanceToNow } from 'date-fns'
import { UserCheck, UserX, Trash2, Shield, RefreshCw } from 'lucide-react'
import type { AdminProfile } from '@/lib/types/admin'

interface Props { initialUsers: AdminProfile[] }

export default function UsersClient({ initialUsers }: Props) {
  const [users, setUsers] = useState(initialUsers)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'admin' | 'suspended' | 'banned'>('all')
  const [loading, setLoading] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const matchSearch = !search ||
        u.username?.toLowerCase().includes(search.toLowerCase()) ||
        u.id.includes(search)
      const matchFilter =
        filter === 'all' ? true :
        filter === 'admin' ? u.role === 'admin' :
        filter === 'suspended' ? u.status === 'suspended' :
        filter === 'banned' ? u.status === 'banned' : true
      return matchSearch && matchFilter
    })
  }, [users, search, filter])

  async function updateUser(id: string, updates: Partial<AdminProfile>) {
    setLoading(id)
    const supabase = getSupabaseClient()
    const { error } = await supabase.from('profiles').update(updates).eq('id', id)
    if (!error) {
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, ...updates } : u))
    }
    setLoading(null)
  }

  async function deleteUser(id: string) {
    if (!confirm('Delete this user permanently? This cannot be undone.')) return
    setLoading(id)
    const supabase = getSupabaseClient()
    await supabase.from('profiles').delete().eq('id', id)
    setUsers((prev) => prev.filter((u) => u.id !== id))
    setLoading(null)
  }

  const FILTERS = ['all', 'admin', 'suspended', 'banned'] as const

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <SectionHeader
        title="User Management"
        sub={`${users.length} total users`}
      />

      {/* Filters + search */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition ${
                filter === f ? 'bg-tg-blue text-white' : 'text-white/50 hover:text-white'
              }`}>
              {f}
            </button>
          ))}
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search by username or ID..." />
        <span className="text-white/30 text-xs ml-auto">{filtered.length} results</span>
      </div>

      <Table
        headers={['User', 'Role', 'Status', 'Online', 'Joined', 'Actions']}
        empty={filtered.length === 0}
      >
        {filtered.map((u) => (
          <Tr key={u.id}>
            <Td>
              <div className="flex items-center gap-3">
                <AdminAvatar src={u.avatar_url} name={u.username} size={32} />
                <div>
                  <p className="text-white text-sm font-medium">{u.username ?? 'Unknown'}</p>
                  <p className="text-white/30 text-xs font-mono">{u.id.slice(0, 8)}…</p>
                </div>
              </div>
            </Td>
            <Td>
              <select
                value={u.role ?? 'user'}
                onChange={(e) => updateUser(u.id, { role: e.target.value as AdminProfile['role'] })}
                className="bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:border-tg-blue/50"
              >
                <option value="user">User</option>
                <option value="moderator">Moderator</option>
                <option value="admin">Admin</option>
              </select>
            </Td>
            <Td><Badge label={u.status ?? 'active'} color={u.status ?? 'active'} /></Td>
            <Td>
              <span className={`flex items-center gap-1.5 text-xs ${u.online_status ? 'text-green-400' : 'text-white/30'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${u.online_status ? 'bg-green-400' : 'bg-white/20'}`} />
                {u.online_status ? 'Online' : u.last_seen ? formatDistanceToNow(new Date(u.last_seen), { addSuffix: true }) : 'Offline'}
              </span>
            </Td>
            <Td className="text-white/40 text-xs whitespace-nowrap">
              {formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}
            </Td>
            <Td>
              <div className="flex items-center gap-1.5">
                {u.status !== 'suspended'
                  ? <AdminBtn variant="ghost" onClick={() => updateUser(u.id, { status: 'suspended' })} disabled={loading === u.id}>
                      <UserX className="w-3 h-3" />
                    </AdminBtn>
                  : <AdminBtn variant="success" onClick={() => updateUser(u.id, { status: 'active' })} disabled={loading === u.id}>
                      <UserCheck className="w-3 h-3" />
                    </AdminBtn>
                }
                {u.status !== 'banned'
                  ? <AdminBtn variant="danger" onClick={() => updateUser(u.id, { status: 'banned' })} disabled={loading === u.id}>
                      <Shield className="w-3 h-3" />
                    </AdminBtn>
                  : <AdminBtn variant="ghost" onClick={() => updateUser(u.id, { status: 'active' })} disabled={loading === u.id}>
                      <RefreshCw className="w-3 h-3" />
                    </AdminBtn>
                }
                <AdminBtn variant="danger" onClick={() => deleteUser(u.id)} disabled={loading === u.id}>
                  <Trash2 className="w-3 h-3" />
                </AdminBtn>
              </div>
            </Td>
          </Tr>
        ))}
      </Table>
    </div>
  )
}
