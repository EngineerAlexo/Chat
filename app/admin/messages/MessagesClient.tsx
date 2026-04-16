'use client'

import { useState, useMemo } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { SectionHeader, Table, Tr, Td, AdminAvatar, SearchInput, AdminBtn, Badge } from '@/components/admin/ui'
import { formatDistanceToNow } from 'date-fns'
import { Trash2, Image, FileText, Mic } from 'lucide-react'
import type { AdminMessage } from '@/lib/types/admin'

interface Props { initialMessages: AdminMessage[] }

const MEDIA_ICON: Record<string, React.ReactNode> = {
  image: <Image className="w-3 h-3" />,
  video: <Image className="w-3 h-3" />,
  voice: <Mic className="w-3 h-3" />,
  file:  <FileText className="w-3 h-3" />,
}

export default function MessagesClient({ initialMessages }: Props) {
  const [messages, setMessages] = useState(initialMessages)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'text' | 'media'>('all')
  const [deleting, setDeleting] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return messages.filter((m) => {
      const matchSearch = !search ||
        m.content?.toLowerCase().includes(search.toLowerCase()) ||
        (m.sender as { username?: string | null } | null)?.username?.toLowerCase().includes(search.toLowerCase())
      const matchFilter =
        filter === 'all' ? true :
        filter === 'text' ? !m.media_type :
        filter === 'media' ? !!m.media_type : true
      return matchSearch && matchFilter
    })
  }, [messages, search, filter])

  async function deleteMessage(id: string) {
    if (!confirm('Delete this message permanently?')) return
    setDeleting(id)
    await getSupabaseClient().from('messages').delete().eq('id', id)
    setMessages((prev) => prev.filter((m) => m.id !== id))
    setDeleting(null)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <SectionHeader title="Message Moderation" sub={`${messages.length} messages`} />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
          {(['all', 'text', 'media'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition ${
                filter === f ? 'bg-tg-blue text-white' : 'text-white/50 hover:text-white'
              }`}>
              {f}
            </button>
          ))}
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search content or sender..." />
        <span className="text-white/30 text-xs ml-auto">{filtered.length} results</span>
      </div>

      <Table
        headers={['Sender', 'Content', 'Chat', 'Type', 'Sent', 'Actions']}
        empty={filtered.length === 0}
      >
        {filtered.map((m) => {
          const sender = m.sender as { username: string | null; avatar_url: string | null } | null
          const conv = m.conversation as { name: string | null; type: string } | null
          return (
            <Tr key={m.id}>
              <Td>
                <div className="flex items-center gap-2">
                  <AdminAvatar src={sender?.avatar_url} name={sender?.username} size={26} />
                  <span className="text-white text-xs">{sender?.username ?? 'Unknown'}</span>
                </div>
              </Td>
              <Td className="max-w-[220px]">
                {m.media_type
                  ? <span className="flex items-center gap-1.5 text-white/40 text-xs">
                      {MEDIA_ICON[m.media_type] ?? <Image className="w-3 h-3" />}
                      {m.media_type}
                    </span>
                  : <span className="text-white/70 text-xs truncate block max-w-[200px]">{m.content ?? '—'}</span>
                }
              </Td>
              <Td>
                <div>
                  <p className="text-white/70 text-xs">{conv?.name ?? 'Private'}</p>
                  <Badge label={conv?.type ?? 'private'} />
                </div>
              </Td>
              <Td>
                {m.is_edited && <Badge label="edited" color="orange" />}
                {m.media_type && <Badge label={m.media_type} />}
              </Td>
              <Td className="text-white/40 text-xs whitespace-nowrap">
                {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
              </Td>
              <Td>
                <AdminBtn variant="danger" onClick={() => deleteMessage(m.id)} disabled={deleting === m.id}>
                  <Trash2 className="w-3 h-3" />
                </AdminBtn>
              </Td>
            </Tr>
          )
        })}
      </Table>
    </div>
  )
}
