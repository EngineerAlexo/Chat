import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ChatWindow from '@/components/chat/ChatWindow'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ChatPage({ params }: Props) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Verify user is a participant of this conversation
  const { data: participant, error: partError } = await supabase
    .from('participants')
    .select('id, role')
    .eq('conversation_id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (partError) {
    console.error('[ChatPage] participant check error:', partError.message)
  }

  // If not a participant, redirect to chat home
  if (!participant) {
    console.warn('[ChatPage] user', user.id, 'is not a participant of', id, '— redirecting')
    redirect('/chat')
  }

  // Fetch conversation with all participants + their profiles
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('*, participants(*, profile:profiles(*))')
    .eq('id', id)
    .single()

  if (convError) {
    console.error('[ChatPage] conversation fetch error:', convError.message)
    redirect('/chat')
  }

  // Fetch initial messages (last 50, oldest first)
  const { data: messages, error: msgError } = await supabase
    .from('messages')
    .select('*, sender:profiles(*), reply_to:messages!reply_to_id(*), reactions(*)')
    .eq('conversation_id', id)
    .not('deleted_for', 'cs', `{${user.id}}`)
    .order('created_at', { ascending: true })
    .limit(50)

  if (msgError) {
    console.error('[ChatPage] messages fetch error:', msgError.message)
  }

  return (
    <ChatWindow
      conversationId={id}
      initialConversation={conversation}
      initialMessages={messages ?? []}
      currentUserId={user.id}
    />
  )
}
