'use client'

import { useState, useMemo } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { SectionHeader, AdminAvatar, AdminBtn, SearchInput } from '@/components/admin/ui'
import { formatDistanceToNow } from 'date-fns'
import { Trash2, ExternalLink, Image, Video, Mic, FileText } from 'lucide-react'

interface MediaItem {
  id: string
  media_url: string | null
  media_type: string | null
  created_at: string
  sender: { username: string | null; avatar_url: string | null } | null
}

interface Props { initialMedia: MediaItem[] }

const TYPE_ICON: Record<string, React.ReactNode> = {
  image: <Image className="w-4 h-4" />,
  video: <Video className="w-4 h-4" />,
  voice: <Mic className="w-4 h-4" />,
  audio: <Mic className="w-4 h-4" />,
  file:  <FileText className="w-4 h-4" />,
}

export default function MediaClient({ initialMedia }: Props) {
  const [media, setMedia] = useState(initialMedia)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'image' | 'video' | 'voice' | 'file'>('all')
  const [deleting, setDeleting] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return media.filter((m) => {
      const matchSearch = !search ||
        (m.sender as { username?: string | null } | null)?.username?.toLowerCase().includes(search.toLowerCase())
      const matchFilter = filter === 'all' ? true : m.media_type === filter
      return matchSearch && matchFilter
    })
  }, [media, search, filter])

  async function deleteMedia(id: string) {
    if (!confirm('Delete this media message?')) return
    setDeleting(id)
    await getSupabaseClient().from('messages').delete().eq('id', id)
    setMedia((prev) => prev.filter((m) => m.id !== id))
    setDeleting(null)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <SectionHeader title="Media Management" sub={`${media.length} media files`} />

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
          {(['all', 'image', 'video', 'voice', 'file'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition ${
                filter === f ? 'bg-tg-blue text-white' : 'text-white/50 hover:text-white'
              }`}>
              {f}
            </button>
          ))}
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search by uploader..." />
      </div>

      {/* Grid view */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {filtered.map((m) => {
          const sender = m.sender as { username: string | null; avatar_url: string | null } | null
          const isImage = m.media_type === 'image' || m.media_type === 'gif'
          const isVideo = m.media_type === 'video'

          return (
            <div key={m.id} className="group relative bg-[#0f1117] border border-white/5 rounded-xl overflow-hidden hover:border-white/15 transition-all">
              {/* Preview */}
              <div className="aspect-square bg-white/5 flex items-center justify-center overflow-hidden">
                {isImage && m.media_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.media_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : isVideo && m.media_url ? (
                  <video src={m.media_url} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-white/20">
                    {TYPE_ICON[m.media_type ?? 'file'] ?? <FileText className="w-8 h-8" />}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <AdminAvatar src={sender?.avatar_url} name={sender?.username} size={16} />
                  <span className="text-white/60 text-[10px] truncate">{sender?.username ?? 'Unknown'}</span>
                </div>
                <p className="text-white/30 text-[10px]">
                  {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                </p>
              </div>

              {/* Hover actions */}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {m.media_url && (
                  <a href={m.media_url} target="_blank" rel="noopener noreferrer"
                    className="w-6 h-6 bg-black/60 rounded-md flex items-center justify-center text-white/70 hover:text-white">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <button onClick={() => deleteMedia(m.id)} disabled={deleting === m.id}
                  className="w-6 h-6 bg-red-500/80 rounded-md flex items-center justify-center text-white hover:bg-red-500">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-white/30">No media found</div>
      )}
    </div>
  )
}
