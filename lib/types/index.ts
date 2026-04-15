export type ConversationType = 'private' | 'group' | 'channel' | 'saved'
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
export type MediaType = 'image' | 'video' | 'audio' | 'voice' | 'file' | 'sticker' | 'gif'
export type ParticipantRole = 'owner' | 'admin' | 'member'

export interface Profile {
  id: string
  username: string | null
  avatar_url: string | null
  bio: string | null
  last_seen: string | null
  online_status: boolean
  created_at: string
}

export interface Conversation {
  id: string
  name: string | null
  type: ConversationType
  avatar_url?: string | null
  created_at: string
  // joined from participants + profiles
  participants?: Participant[]
  last_message?: Message | null
  unread_count?: number
}

export interface Participant {
  id: string
  conversation_id: string
  user_id: string
  role: ParticipantRole
  profile?: Profile
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string | null
  content: string | null
  media_url: string | null
  media_type: MediaType | null
  reply_to_id: string | null
  forwarded_from: string | null
  is_edited: boolean
  deleted_for: string[]
  created_at: string
  // client-side only
  status?: MessageStatus
  optimistic?: boolean
  // joined
  sender?: Profile
  reply_to?: Message | null
  reactions?: Reaction[]
}

export interface Reaction {
  id: string
  message_id: string
  user_id: string
  emoji: string
  profile?: Profile
}

export interface Sticker {
  id: string
  name: string
  image_url: string
  pack_id: string
}

export interface TypingUser {
  user_id: string
  username: string | null
  avatar_url: string | null
}

export interface PresenceState {
  [key: string]: { user_id: string; online_at: string }[]
}

export interface UploadProgress {
  file: File
  progress: number
  url?: string
  error?: string
}

export interface MessageGroup {
  date: string
  messages: Message[]
}
