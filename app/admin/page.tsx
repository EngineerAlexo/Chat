import { requireAdmin } from '@/lib/supabase/admin'
import { StatCard, SectionHeader, Table, Tr, Td, AdminAvatar, Badge } from '@/components/admin/ui'
import { Users, MessageSquare, Activity, TrendingUp, Wifi, Image } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default async function AdminOverviewPage() {
  const { supabase } = await requireAdmin()

  // Parallel data fetching
  const [
    { count: totalUsers },
    { count: totalMessages },
    { count: totalConversations },
    { count: onlineUsers },
    { data: recentUsers },
    { data: recentMessages },
    { count: todayMessages },
    { count: todayUsers },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('messages').select('*', { count: 'exact', head: true }),
    supabase.from('conversations').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('online_status', true),
    supabase.from('profiles').select('id, username, avatar_url, role, status, created_at, online_status')
      .order('created_at', { ascending: false }).limit(5),
    supabase.from('messages')
      .select('id, content, media_type, created_at, sender:profiles(username, avatar_url)')
      .order('created_at', { ascending: false }).limit(5),
    supabase.from('messages').select('*', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 86400000).toISOString()),
    supabase.from('profiles').select('*', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 86400000).toISOString()),
  ])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <SectionHeader
        title="Dashboard Overview"
        sub="Welcome back — here's what's happening on your platform"
      />

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Users" value={totalUsers ?? 0} icon={<Users className="w-4 h-4" />}
          color="blue" trend={{ value: todayUsers ?? 0, label: 'today' }} />
        <StatCard label="Total Messages" value={totalMessages ?? 0} icon={<MessageSquare className="w-4 h-4" />}
          color="green" trend={{ value: todayMessages ?? 0, label: 'today' }} />
        <StatCard label="Conversations" value={totalConversations ?? 0} icon={<Activity className="w-4 h-4" />}
          color="purple" />
        <StatCard label="Online Now" value={onlineUsers ?? 0} icon={<Wifi className="w-4 h-4" />}
          color="orange" sub="Active users" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent users */}
        <div>
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wide mb-3">Recent Users</h2>
          <Table headers={['User', 'Role', 'Status', 'Joined']}>
            {(recentUsers ?? []).map((u) => (
              <Tr key={u.id}>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <AdminAvatar src={u.avatar_url} name={u.username} size={28} />
                    <span className="text-white text-sm">{u.username ?? 'Unknown'}</span>
                    {u.online_status && <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />}
                  </div>
                </Td>
                <Td><Badge label={u.role ?? 'user'} color={u.role ?? 'user'} /></Td>
                <Td><Badge label={u.status ?? 'active'} color={u.status ?? 'active'} /></Td>
                <Td className="text-white/40 text-xs">
                  {formatDistanceToNow(new Date(u.created_at), { addSuffix: true })}
                </Td>
              </Tr>
            ))}
          </Table>
        </div>

        {/* Recent messages */}
        <div>
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wide mb-3">Recent Messages</h2>
          <Table headers={['Sender', 'Content', 'Time']}>
            {(recentMessages ?? []).map((m) => {
              const sender = m.sender as unknown as { username: string | null; avatar_url: string | null } | null
              return (
                <Tr key={m.id}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <AdminAvatar src={sender?.avatar_url} name={sender?.username} size={24} />
                      <span className="text-white text-xs">{sender?.username ?? 'Unknown'}</span>
                    </div>
                  </Td>
                  <Td className="max-w-[180px]">
                    {m.media_type
                      ? <span className="flex items-center gap-1 text-white/40 text-xs"><Image className="w-3 h-3" />{m.media_type}</span>
                      : <span className="text-white/70 text-xs truncate block">{m.content ?? '—'}</span>
                    }
                  </Td>
                  <Td className="text-white/40 text-xs whitespace-nowrap">
                    {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                  </Td>
                </Tr>
              )
            })}
          </Table>
        </div>
      </div>
    </div>
  )
}
