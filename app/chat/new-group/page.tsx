import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NewGroupClient from './NewGroupClient'

export default async function NewGroupPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .neq('id', user.id)
    .order('username')
    .limit(200)

  return <NewGroupClient profiles={profiles ?? []} currentUserId={user.id} />
}
