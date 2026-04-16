import { requireAdmin } from '@/lib/supabase/admin'
import { StatCard, SectionHeader } from '@/components/admin/ui'
import { Users, MessageSquare, Image, Wifi, TrendingUp, Activity } from 'lucide-react'

export default async function AdminAnalyticsPage() {
  const { supabase } = await requireAdmin()

  const now = new Date()
  const day  = new Date(now.getTime() - 86400000).toISOString()
  const week = new Date(now.getTime() - 7 * 86400000).toISOString()

  const [
    { count: totalUsers },
    { count: totalMessages },
    { count: totalConversations },
    { count: onlineUsers },
    { count: mediaMessages },
    { count: weekMessages },
    { count: weekUsers },
    { count: todayMessages },
    { count: todayUsers },
    { count: groupConvs },
    { count: privateConvs },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('messages').select('*', { count: 'exact', head: true }),
    supabase.from('conversations').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('online_status', true),
    supabase.from('messages').select('*', { count: 'exact', head: true }).not('media_url', 'is', null),
    supabase.from('messages').select('*', { count: 'exact', head: true }).gte('created_at', week),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', week),
    supabase.from('messages').select('*', { count: 'exact', head: true }).gte('created_at', day),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', day),
    supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('type', 'group'),
    supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('type', 'private'),
  ])

  const avgMsgsPerUser = totalUsers ? Math.round((totalMessages ?? 0) / totalUsers) : 0
  const mediaRatio = totalMessages ? Math.round(((mediaMessages ?? 0) / totalMessages) * 100) : 0

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <SectionHeader title="Analytics" sub="Platform performance and usage statistics" />

      <div className="space-y-8">
        {/* Users */}
        <section>
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Users</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Users" value={totalUsers ?? 0} icon={<Users className="w-4 h-4" />} color="blue" />
            <StatCard label="Online Now" value={onlineUsers ?? 0} icon={<Wifi className="w-4 h-4" />} color="green" />
            <StatCard label="New This Week" value={weekUsers ?? 0} icon={<TrendingUp className="w-4 h-4" />} color="purple" />
            <StatCard label="New Today" value={todayUsers ?? 0} icon={<Activity className="w-4 h-4" />} color="orange" />
          </div>
        </section>

        {/* Messages */}
        <section>
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Messages</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Messages" value={totalMessages ?? 0} icon={<MessageSquare className="w-4 h-4" />} color="blue" />
            <StatCard label="This Week" value={weekMessages ?? 0} icon={<TrendingUp className="w-4 h-4" />} color="green" />
            <StatCard label="Today" value={todayMessages ?? 0} icon={<Activity className="w-4 h-4" />} color="purple" />
            <StatCard label="Avg per User" value={avgMsgsPerUser} icon={<Users className="w-4 h-4" />} color="orange" sub="messages / user" />
          </div>
        </section>

        {/* Media & Conversations */}
        <section>
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Content</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Media Files" value={mediaMessages ?? 0} icon={<Image className="w-4 h-4" />} color="blue" />
            <StatCard label="Media Ratio" value={`${mediaRatio}%`} icon={<Activity className="w-4 h-4" />} color="purple" sub="of all messages" />
            <StatCard label="Group Chats" value={groupConvs ?? 0} icon={<Users className="w-4 h-4" />} color="green" />
            <StatCard label="Private Chats" value={privateConvs ?? 0} icon={<MessageSquare className="w-4 h-4" />} color="orange" />
          </div>
        </section>

        {/* Summary card */}
        <div className="bg-[#0f1117] border border-white/5 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-4">Platform Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            {[
              ['Total Conversations', totalConversations ?? 0],
              ['Total Users', totalUsers ?? 0],
              ['Total Messages', totalMessages ?? 0],
              ['Media Messages', mediaMessages ?? 0],
              ['Online Users', onlineUsers ?? 0],
              ['Avg Msgs/User', avgMsgsPerUser],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-white/40">{label}</span>
                <span className="text-white font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
