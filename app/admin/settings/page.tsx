import { requireAdmin } from '@/lib/supabase/admin'
import { SectionHeader } from '@/components/admin/ui'
import MakeAdminForm from './MakeAdminForm'

export default async function AdminSettingsPage() {
  const { supabase, profile } = await requireAdmin()

  const { data: admins } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, role')
    .eq('role', 'admin')

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <SectionHeader title="Settings" sub="Admin panel configuration" />

      <div className="space-y-6">
        {/* Current admin info */}
        <div className="bg-[#0f1117] border border-white/5 rounded-xl p-5">
          <h3 className="text-white font-medium mb-4 text-sm">Your Admin Account</h3>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-tg-blue/20 flex items-center justify-center">
              <span className="text-tg-blue font-bold">{(profile.username ?? 'A')[0].toUpperCase()}</span>
            </div>
            <div>
              <p className="text-white font-medium">@{profile.username}</p>
              <p className="text-white/40 text-xs font-mono">{profile.id}</p>
            </div>
            <span className="ml-auto text-xs bg-purple-500/15 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-md">
              Administrator
            </span>
          </div>
        </div>

        {/* Admin list */}
        <div className="bg-[#0f1117] border border-white/5 rounded-xl p-5">
          <h3 className="text-white font-medium mb-4 text-sm">All Administrators ({admins?.length ?? 0})</h3>
          <div className="space-y-2">
            {(admins ?? []).map((a) => (
              <div key={a.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                <div className="w-7 h-7 rounded-full bg-tg-blue/20 flex items-center justify-center text-tg-blue text-xs font-bold">
                  {(a.username ?? 'A')[0].toUpperCase()}
                </div>
                <span className="text-white/70 text-sm">@{a.username}</span>
                <span className="text-white/30 text-xs font-mono ml-auto">{a.id.slice(0, 12)}…</span>
              </div>
            ))}
          </div>
        </div>

        {/* Promote user to admin */}
        <MakeAdminForm />

        {/* SQL reminder */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5">
          <h3 className="text-amber-400 font-medium mb-2 text-sm">⚠️ Setup Reminder</h3>
          <p className="text-white/50 text-xs leading-relaxed">
            Run <code className="bg-white/10 px-1 rounded text-white/70">supabase/admin-setup.sql</code> in your
            Supabase SQL Editor to add the <code className="bg-white/10 px-1 rounded text-white/70">role</code> and{' '}
            <code className="bg-white/10 px-1 rounded text-white/70">status</code> columns to the profiles table.
            Then set your own role to &apos;admin&apos; with:{' '}
            <code className="bg-white/10 px-1 rounded text-white/70 block mt-1">
              UPDATE profiles SET role = &apos;admin&apos; WHERE id = &apos;YOUR-USER-ID&apos;;
            </code>
          </p>
        </div>
      </div>
    </div>
  )
}
