import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PeopleClient from './PeopleClient'

export default async function PeoplePage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Fetch all profiles except current user
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .neq('id', user.id)
    .order('username', { ascending: true })
    .limit(100)

  return <PeopleClient profiles={profiles ?? []} currentUserId={user.id} />
}
