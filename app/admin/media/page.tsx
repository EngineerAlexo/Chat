import { requireAdmin } from '@/lib/supabase/admin'
import MediaClient from './MediaClient'

export default async function AdminMediaPage() {
  const { supabase } = await requireAdmin()

  const { data: media } = await supabase
    .from('messages')
    .select(`
      id, conversation_id, sender_id, media_url, media_type, created_at,
      sender:profiles(username, avatar_url)
    `)
    .not('media_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(200)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <MediaClient initialMedia={(media ?? []) as any} />
}
