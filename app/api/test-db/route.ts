import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'not authenticated' }, { status: 401 })

  const results: Record<string, unknown> = { userId: user.id }

  // Test 1: read profiles
  const { data: profiles, error: pe } = await supabase.from('profiles').select('id, username').limit(5)
  results.profiles = pe ? `ERROR: ${pe.message}` : profiles

  // Test 2: read conversations
  const { data: convs, error: ce } = await supabase.from('conversations').select('id, type').limit(5)
  results.conversations = ce ? `ERROR: ${ce.message}` : convs

  // Test 3: read participants
  const { data: parts, error: pre } = await supabase.from('participants').select('conversation_id, user_id').limit(5)
  results.participants = pre ? `ERROR: ${pre.message}` : parts

  // Test 4: try inserting a conversation
  const { data: newConv, error: nie } = await supabase
    .from('conversations')
    .insert({ type: 'saved', name: '__test__' })
    .select('id')
    .single()

  if (nie) {
    results.insertConversation = `ERROR: ${nie.message}`
  } else {
    results.insertConversation = `OK: ${newConv.id}`
    // Clean up
    await supabase.from('conversations').delete().eq('id', newConv.id)
  }

  return NextResponse.json(results, { status: 200 })
}
