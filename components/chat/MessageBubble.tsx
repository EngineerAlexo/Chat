'use client'

import { useState, useRef, memo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useChatStore } from '@/lib/stores/useChatStore'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { Message } from '@/lib/types'
import { formatTime } from '@/lib/utils/formatTime'
import { cn } from '@/lib/utils/cn'
import Avatar from '@/components/ui/Avatar'
import VoiceMessage from './VoiceMessage'
import MediaMessage from './MediaMessage'
import {
  Reply, Forward, Edit2, Trash2, Copy, Check, CheckCheck,
  MoreHorizontal, Pin, Smile
} from 'lucide-react'

interface Props {
  message: Message
  showAvatar: boolean
  showName: boolean
  currentUserId: string
  conversationId: string
  isNew?: boolean  // only animate brand-new messages
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥']

// Stable spring config — defined outside component, not recreated per render
const BUBBLE_SPRING = { type: 'spring', stiffness: 500, damping: 30, mass: 0.8 } as const

const MessageBubble = memo(function MessageBubble({
  message, showAvatar, showName, currentUserId, conversationId, isNew = false
}: Props) {
  // Granular store selectors — only re-render when these specific values change
  const setReplyTo      = useChatStore((s) => s.setReplyTo)
  const setEditingMsg   = useChatStore((s) => s.setEditingMessage)
  const updateMessage   = useChatStore((s) => s.updateMessage)
  const removeMessage   = useChatStore((s) => s.removeMessage)

  const [showActions, setShowActions]     = useState(false)
  const [showEmojiQuick, setShowEmojiQuick] = useState(false)
  const [contextMenu, setContextMenu]     = useState<{ x: number; y: number } | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isOwn    = message.sender_id === currentUserId
  const isDeleted = message.deleted_for?.includes(currentUserId)

  if (isDeleted) return null

  // Stable handlers — useCallback prevents child re-renders
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleLongPress = useCallback(() => {
    longPressTimer.current = setTimeout(() => setShowActions(true), 500)
  }, [])

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
  }, [])

  const handleDoubleClick = useCallback(() => {
    setShowEmojiQuick(true)
    setTimeout(() => setShowEmojiQuick(false), 3000)
  }, [])

  const handleMouseEnter = useCallback(() => setShowActions(true), [])
  const handleMouseLeave = useCallback(() => {
    setShowActions(false)
    setShowEmojiQuick(false)
  }, [])

  const addReaction = useCallback(async (emoji: string) => {
    const supabase = getSupabaseClient()
    setShowEmojiQuick(false)
    const existing = message.reactions?.find((r) => r.user_id === currentUserId && r.emoji === emoji)
    if (existing) {
      await supabase.from('reactions').delete().eq('id', existing.id)
    } else {
      await supabase.from('reactions').insert({ message_id: message.id, user_id: currentUserId, emoji })
    }
  }, [message.reactions, message.id, currentUserId])

  const handleDelete = useCallback(async (forEveryone: boolean) => {
    setContextMenu(null)
    const supabase = getSupabaseClient()
    if (forEveryone && isOwn) {
      await supabase.from('messages').delete().eq('id', message.id)
      removeMessage(conversationId, message.id)
    } else {
      const newDeletedFor = [...(message.deleted_for ?? []), currentUserId]
      await supabase.from('messages').update({ deleted_for: newDeletedFor }).eq('id', message.id)
      updateMessage(conversationId, message.id, { deleted_for: newDeletedFor })
    }
  }, [isOwn, message.id, message.deleted_for, currentUserId, conversationId, removeMessage, updateMessage])

  const handleCopy = useCallback(async () => {
    if (message.content) await navigator.clipboard.writeText(message.content)
    setContextMenu(null)
  }, [message.content])

  const reactionGroups = message.reactions?.reduce<Record<string, number>>((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1
    return acc
  }, {}) ?? {}

  // Only animate new messages — old ones render instantly (no animation cost)
  const bubbleAnimation = isNew
    ? {
        initial: { opacity: 0, y: 6, scale: 0.97 },
        animate: { opacity: 1, y: 0, scale: 1 },
        transition: BUBBLE_SPRING,
      }
    : {}

  return (
    <>
      <motion.div
        {...bubbleAnimation}
        className={cn('flex items-end gap-1 md:gap-2 mb-1 group', isOwn ? 'flex-row-reverse' : 'flex-row')}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleDoubleClick}
        onMouseDown={handleLongPress}
        onMouseUp={handleLongPressEnd}
        onTouchStart={handleLongPress}
        onTouchEnd={handleLongPressEnd}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Avatar */}
        <div className="w-6 md:w-8 flex-shrink-0">
          {!isOwn && showAvatar && (
            <Avatar src={message.sender?.avatar_url} name={message.sender?.username ?? 'U'} size={24} className="md:!w-8 md:!h-8" />
          )}
        </div>

        <div className={cn('flex flex-col max-w-[82%] md:max-w-[70%] relative', isOwn ? 'items-end' : 'items-start')}>
          {showName && (
            <span className="text-xs font-medium text-tg-blue mb-1 ml-3">
              {message.sender?.username}
            </span>
          )}

          {message.reply_to && (
            <div className={cn(
              'flex items-start gap-2 px-3 py-1.5 rounded-t-xl mb-0.5 border-l-2 border-tg-blue text-xs max-w-full',
              isOwn ? 'bg-tg-bubble/80 dark:bg-tg-bubble-dark/80' : 'bg-gray-100 dark:bg-tg-bg-dark'
            )}>
              <div className="min-w-0">
                <p className="text-tg-blue font-medium truncate">{message.reply_to.sender?.username ?? 'Unknown'}</p>
                <p className="text-tg-text-secondary truncate">{message.reply_to.content ?? '📎 Media'}</p>
              </div>
            </div>
          )}

          <div className={cn(
            'relative px-3 py-2 rounded-2xl shadow-bubble max-w-full',
            isOwn
              ? 'bg-tg-bubble dark:bg-tg-bubble-dark text-gray-900 dark:text-white rounded-br-sm'
              : 'bg-tg-bubble-in dark:bg-tg-bubble-in-dark text-gray-900 dark:text-white rounded-bl-sm',
            message.optimistic && 'opacity-70',
            message.status === 'failed' && 'border border-red-400'
          )}>
            {message.forwarded_from && (
              <p className="text-xs text-tg-blue font-medium mb-1">Forwarded</p>
            )}

            {message.media_type && message.media_url && (
              <div className="mb-1">
                {message.media_type === 'voice' ? (
                  <VoiceMessage url={message.media_url} isOwn={isOwn} />
                ) : (
                  <MediaMessage url={message.media_url} type={message.media_type} />
                )}
              </div>
            )}

            {message.content && (
              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                {message.content}
                {message.is_edited && (
                  <span className="text-xs text-tg-text-secondary ml-1">(edited)</span>
                )}
              </p>
            )}

            <div className="flex items-center gap-1 mt-1 justify-end">
              <span className="text-[10px] text-tg-text-secondary">{formatTime(message.created_at)}</span>
              {isOwn && <MessageStatus status={message.status} />}
            </div>
          </div>

          {Object.keys(reactionGroups).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(reactionGroups).map(([emoji, count]) => {
                const myReaction = message.reactions?.find((r) => r.user_id === currentUserId && r.emoji === emoji)
                return (
                  <button
                    key={emoji}
                    onClick={() => addReaction(emoji)}
                    className={cn(
                      'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition touch-feedback',
                      myReaction
                        ? 'bg-tg-blue/20 border border-tg-blue text-tg-blue'
                        : 'bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20'
                    )}
                  >
                    <span>{emoji}</span>
                    {count > 1 && <span>{count}</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <AnimatePresence>
          {showActions && (
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={BUBBLE_SPRING}
              className={cn('flex items-center gap-1 self-center', isOwn ? 'flex-row-reverse mr-1' : 'ml-1')}
            >
              <ActionBtn icon={<Reply className="w-3.5 h-3.5" />} onClick={() => setReplyTo(message)} title="Reply" />
              <ActionBtn icon={<Smile className="w-3.5 h-3.5" />} onClick={() => setShowEmojiQuick(true)} title="React" />
              {isOwn && <ActionBtn icon={<Edit2 className="w-3.5 h-3.5" />} onClick={() => setEditingMsg(message)} title="Edit" />}
              <ActionBtn icon={<MoreHorizontal className="w-3.5 h-3.5" />} onClick={(e) => setContextMenu({ x: e.clientX, y: e.clientY })} title="More" />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showEmojiQuick && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.88 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.88 }}
              transition={BUBBLE_SPRING}
              className={cn(
                'absolute z-20 flex items-center gap-1 bg-white dark:bg-tg-bg-dark-secondary rounded-full shadow-modal px-2 py-1.5 border border-tg-border dark:border-tg-border-dark',
                isOwn ? 'right-0 bottom-full mb-2' : 'left-0 bottom-full mb-2'
              )}
              style={{ position: 'absolute' }}
            >
              {QUICK_EMOJIS.map((emoji) => (
                <button key={emoji} onClick={() => addReaction(emoji)} className="text-lg hover:scale-125 transition-transform touch-feedback">
                  {emoji}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {contextMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.93 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.93 }}
              transition={BUBBLE_SPRING}
              className="fixed z-50 bg-white dark:bg-tg-bg-dark-secondary rounded-xl shadow-modal border border-tg-border dark:border-tg-border-dark py-1 w-48"
              style={{ left: Math.min(contextMenu.x, window.innerWidth - 200), top: Math.min(contextMenu.y, window.innerHeight - 250) }}
            >
              <ContextItem icon={<Reply className="w-4 h-4" />} label="Reply" onClick={() => { setReplyTo(message); setContextMenu(null) }} />
              {message.content && <ContextItem icon={<Copy className="w-4 h-4" />} label="Copy" onClick={handleCopy} />}
              {isOwn && <ContextItem icon={<Edit2 className="w-4 h-4" />} label="Edit" onClick={() => { setEditingMsg(message); setContextMenu(null) }} />}
              <ContextItem icon={<Forward className="w-4 h-4" />} label="Forward" onClick={() => setContextMenu(null)} />
              <ContextItem icon={<Pin className="w-4 h-4" />} label="Pin" onClick={() => setContextMenu(null)} />
              <hr className="my-1 border-tg-border dark:border-tg-border-dark" />
              <ContextItem icon={<Trash2 className="w-4 h-4" />} label="Delete for me" onClick={() => handleDelete(false)} danger />
              {isOwn && <ContextItem icon={<Trash2 className="w-4 h-4" />} label="Delete for everyone" onClick={() => handleDelete(true)} danger />}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
})

export default MessageBubble

function ActionBtn({ icon, onClick, title }: { icon: React.ReactNode; onClick: (e: React.MouseEvent) => void; title: string }) {
  return (
    <button title={title} onClick={onClick}
      className="w-7 h-7 rounded-full bg-white dark:bg-tg-bg-dark-secondary shadow-bubble flex items-center justify-center text-tg-text-secondary hover:text-tg-blue transition touch-feedback">
      {icon}
    </button>
  )
}

function ContextItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={cn('flex items-center gap-3 w-full px-4 py-2.5 text-sm transition touch-feedback',
        danger ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-gray-700 dark:text-gray-200 hover:bg-tg-bg-secondary dark:hover:bg-tg-bg-dark')}>
      {icon} {label}
    </button>
  )
}

function MessageStatus({ status }: { status?: string }) {
  if (status === 'sending') return <div className="w-3 h-3 rounded-full border-2 border-tg-text-secondary border-t-transparent animate-spin" />
  if (status === 'failed')  return <span className="text-red-500 text-xs">!</span>
  if (status === 'read')    return <CheckCheck className="w-3.5 h-3.5 text-tg-blue" />
  if (status === 'delivered') return <CheckCheck className="w-3.5 h-3.5 text-tg-text-secondary" />
  return <Check className="w-3.5 h-3.5 text-tg-text-secondary" />
}
