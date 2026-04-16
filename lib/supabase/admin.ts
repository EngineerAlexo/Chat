import { createServerSupabaseClient } from './server'
import { redirect } from 'next/navigation'

/** Returns the supabase client + verified admin profile. Redirects if not admin. */
export async function requireAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    redirect('/chat')
  }

  return { supabase, user, profile }
}
