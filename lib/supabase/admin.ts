import { createServerSupabaseClient } from './server'
import { redirect } from 'next/navigation'

/**
 * Returns supabase client + verified admin profile.
 * Redirects to /chat if not admin, /auth/login if not authenticated.
 * Uses the standard anon client — no recursive policy needed.
 */
export async function requireAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Read role directly — profiles_select policy is "true" so this always works
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, role')
    .eq('id', user.id)
    .maybeSingle()

  // If role column doesn't exist yet or user is not admin, redirect
  if (!profile || (profile as { role?: string }).role !== 'admin') {
    redirect('/chat')
  }

  return { supabase, user, profile: profile as { id: string; username: string | null; avatar_url: string | null; role: string } }
}
