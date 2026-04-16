export type UserRole = 'user' | 'admin' | 'moderator'
export type UserStatus = 'active' | 'suspended' | 'banned'

export interface AdminProfile {
  id: string
  username: string | null
  avatar_url: string | null
  bio: string | null
  last_seen: string | null
  online_status: boolean
  created_at: string
  role: UserRole
  status: UserStatus
  email?: string
  message_count?: number
}

export interface ActivityLog {
  id: string
  user_id: string
  action: string
  metadata: Record<string, unknown>
  ip_address: string | null
  created_at: string
  profile?: { username: string | null; avatar_url: string | null }
}

export interface AdminStats {
  total_users: number
  active_users: number
  total_messages: number
  total_conversations: number
  messages_today: number
  new_users_today: number
  online_now: number
}

export interface AdminMessage {
  id: string
  conversation_id: string
  sender_id: string | null
  content: string | null
  media_url: string | null
  media_type: string | null
  is_edited: boolean
  created_at: string
  sender?: { username: string | null; avatar_url: string | null }
  conversation?: { name: string | null; type: string }
}
