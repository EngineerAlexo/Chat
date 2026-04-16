import { requireAdmin } from '@/lib/supabase/admin'
import UsersClient from './UsersClient'

export default async function AdminUsersPage() {
  const { supabase } = await requireAdmin()

  const { data: users } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, bio, role, status, online_status, last_seen, created_at')
    .order('created_at', { ascending: false })

  return <UsersClient initialUsers={users ?? []} />
}
