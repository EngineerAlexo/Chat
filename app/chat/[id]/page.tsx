import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ChatWindow from '@/components/chat/ChatWindow'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ChatPage({ params }: Props) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  // Only auth check server-side — fast, single query
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Lightweight participant check — just id, no joins
  const { data: participant } = await supabase
    .from('participants')
    .select('id')
    .eq('conversation_id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!participant) redirect('/chat')

  // Render shell immediately — ChatWindow fetches data client-side
  return (
    <ChatWindow
      conversationId={id}
      currentUserId={user.id}
    />
  )
}
