import { requireAdmin } from '@/lib/supabase/admin'
import { Table, Tr, Td, SectionHeader, AdminAvatar, Badge } from '@/components/admin/ui'
import { formatDistanceToNow } from 'date-fns'

export default async function AdminActivityPage() {
  const { supabase } = await requireAdmin()

  // Recent user activity derived from messages + profiles
  const [{ data: recentMessages }, { data: recentUsers }] = await Promise.all([
    supabase.from('messages')
      .select('id, sender_id, content, media_type, created_at, sender:profiles(username, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('profiles')
      .select('id, username, avatar_url, online_status, last_seen, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  // Build unified activity feed
  type ActivityItem = {
    id: string; type: string; user: { username: string | null; avatar_url: string | null } | null
    detail: string; time: string
  }

  const activities: ActivityItem[] = [
    ...(recentMessages ?? []).map((m) => ({
      id: `msg-${m.id}`,
      type: m.media_type ? 'media_sent' : 'message_sent',
      user: m.sender as unknown as { username: string | null; avatar_url: string | null } | null,
      detail: m.media_type ? `Sent ${m.media_type}` : (m.content?.slice(0, 60) ?? 'Sent a message'),
      time: m.created_at,
    })),
    ...(recentUsers ?? []).map((u) => ({
      id: `user-${u.id}`,
      type: 'user_joined',
      user: { username: u.username, avatar_url: u.avatar_url },
      detail: 'Joined the platform',
      time: u.created_at,
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 60)

  const ACTION_COLOR: Record<string, string> = {
    message_sent: 'blue',
    media_sent:   'purple',
    user_joined:  'green',
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <SectionHeader title="Activity Feed" sub="Recent platform activity" />

      <Table headers={['User', 'Action', 'Detail', 'Time']} empty={activities.length === 0}>
        {activities.map((a) => (
          <Tr key={a.id}>
            <Td>
              <div className="flex items-center gap-2.5">
                <AdminAvatar src={a.user?.avatar_url} name={a.user?.username} size={28} />
                <span className="text-white text-sm">{a.user?.username ?? 'Unknown'}</span>
              </div>
            </Td>
            <Td>
              <Badge label={a.type.replace('_', ' ')} color={ACTION_COLOR[a.type] ?? 'gray'} />
            </Td>
            <Td className="text-white/50 text-xs max-w-[240px] truncate">{a.detail}</Td>
            <Td className="text-white/30 text-xs whitespace-nowrap">
              {formatDistanceToNow(new Date(a.time), { addSuffix: true })}
            </Td>
          </Tr>
        ))}
      </Table>
    </div>
  )
}
