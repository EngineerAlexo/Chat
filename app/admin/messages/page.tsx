import { requireAdmin } from '@/lib/supabase/admin'
import MessagesClient from './MessagesClient'

export default async function AdminMessagesPage() {
  const { supabase } = await requireAdmin()

  const { data: messages } = await supabase
    .from('messages')
    .select(`
      id, conversation_id, sender_id, content, media_url, media_type,
      is_edited, created_at,
      sender:profiles(username, avatar_url),
      conversation:conversations(name, type)
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <MessagesClient initialMessages={(messages ?? []) as any} />
}
