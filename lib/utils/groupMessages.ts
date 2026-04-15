import type { Message, MessageGroup } from '@/lib/types'
import { formatDate } from './formatTime'

export function groupMessagesByDate(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = []
  let currentDate = ''
  let currentGroup: MessageGroup | null = null

  for (const msg of messages) {
    const date = formatDate(msg.created_at)
    if (date !== currentDate) {
      currentDate = date
      currentGroup = { date, messages: [] }
      groups.push(currentGroup)
    }
    currentGroup!.messages.push(msg)
  }

  return groups
}

export function shouldShowAvatar(messages: Message[], index: number): boolean {
  if (index === messages.length - 1) return true
  const current = messages[index]
  const next = messages[index + 1]
  return current.sender_id !== next.sender_id
}

export function shouldShowSenderName(messages: Message[], index: number): boolean {
  if (index === 0) return true
  const current = messages[index]
  const prev = messages[index - 1]
  return current.sender_id !== prev.sender_id
}

export function isSameMinute(a: string, b: string): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate() &&
    da.getHours() === db.getHours() &&
    da.getMinutes() === db.getMinutes()
  )
}
