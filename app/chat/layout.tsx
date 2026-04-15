import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ChatLayout from '@/components/chat/ChatLayout'

export default async function Layout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  // Auto-create profile if missing
  let { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) {
    const username = user.email?.split('@')[0]?.replace(/[^a-z0-9_]/gi, '_') ?? `user_${user.id.slice(0, 6)}`
    const { data: newProfile } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        username,
        avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
        bio: '',
        online_status: false,
      })
      .select('*')
      .single()
    profile = newProfile
  }

  // Auto-create Saved Messages conversation
  const { data: savedConvs } = await supabase
    .from('participants')
    .select('conversation_id, conversations!inner(type)')
    .eq('user_id', user.id)

  const hasSaved = savedConvs?.some((p) => {
    const conv = p.conversations as unknown as { type: string }
    return conv?.type === 'saved'
  })

  if (!hasSaved) {
    const { data: savedConv } = await supabase
      .from('conversations')
      .insert({ name: 'Saved Messages', type: 'saved' })
      .select('id')
      .single()
    if (savedConv) {
      await supabase.from('participants').insert({
        conversation_id: savedConv.id,
        user_id: user.id,
        role: 'owner',
      })
    }
  }

  return <ChatLayout initialProfile={profile}>{children}</ChatLayout>
}
