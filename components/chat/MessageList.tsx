'use client'

import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { AnimatePresence, motion } from 'framer-motion'
import type { Message } from '@/lib/types'
import { groupMessagesByDate } from '@/lib/utils/groupMessages'
import { shouldShowAvatar, shouldShowSenderName } from '@/lib/utils/groupMessages'
import MessageBubble from './MessageBubble'
import { Loader2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface Props {
  conversationId: string
  messages: Message[]
  currentUserId: string
  onLoadMore: () => void
  isLoadingMore: boolean
}

export default function MessageList({ conversationId, messages, currentUserId, onLoadMore, isLoadingMore }: Props) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const atBottomRef = useRef(true)
  const prevLengthRef = useRef(0)
  const isLoadingMoreRef = useRef(isLoadingMore)
  const initialScrollDone = useRef(false)
  isLoadingMoreRef.current = isLoadingMore

  // Memoize flat items — only recompute when messages array changes
  const flatItems = useMemo(() => {
    const groups = groupMessagesByDate(messages)
    const items: Array<
      | { type: 'date'; label: string }
      | { type: 'message'; message: Message; index: number; showAvatar: boolean; showName: boolean }
    > = []
    let msgIndex = 0
    for (const group of groups) {
      items.push({ type: 'date', label: group.date })
      for (const msg of group.messages) {
        const idx = msgIndex
        items.push({
          type: 'message',
          message: msg,
          index: idx,
          showAvatar: shouldShowAvatar(messages, idx),
          showName: msg.sender_id !== currentUserId && shouldShowSenderName(messages, idx),
        })
        msgIndex++
      }
    }
    return items
  }, [messages, currentUserId])

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => {
      const item = flatItems[i]
      if (!item) return 60
      if (item.type === 'date') return 36
      return item.message.media_type ? 220 : 72
    },
    overscan: 8,
  })

  // Initial scroll to bottom when conversation loads
  useEffect(() => {
    initialScrollDone.current = false
    prevLengthRef.current = 0
  }, [conversationId])

  useEffect(() => {
    if (!initialScrollDone.current && flatItems.length > 0) {
      initialScrollDone.current = true
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        const el = parentRef.current
        if (el) el.scrollTop = el.scrollHeight
      })
    }
  })

  // Auto-scroll to bottom on new messages (only if near bottom)
  useEffect(() => {
    const newLength = messages.length
    const prevLength = prevLengthRef.current
    prevLengthRef.current = newLength

    if (newLength > prevLength && atBottomRef.current && initialScrollDone.current) {
      requestAnimationFrame(() => {
        const el = parentRef.current
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      })
    }
  }, [messages.length])

  const handleScroll = useCallback(() => {
    const el = parentRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const isNearBottom = distFromBottom < 120
    atBottomRef.current = isNearBottom
    setShowScrollBtn(!isNearBottom)

    // Load more when near top
    if (el.scrollTop < 200 && !isLoadingMoreRef.current) {
      onLoadMore()
    }
  }, [onLoadMore])

  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  function scrollToBottom() {
    const el = parentRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      {/* Subtle chat background */}
      <div className="absolute inset-0 bg-tg-bg-secondary dark:bg-tg-bg-dark-tertiary pointer-events-none" />

      <div
        ref={parentRef}
        className="h-full overflow-y-auto px-4 py-2 relative"
      >
        {/* Loading more indicator */}
        <AnimatePresence>
          {isLoadingMore && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 40 }}
              exit={{ opacity: 0, height: 0 }}
              className="flex justify-center items-center"
            >
              <Loader2 className="w-5 h-5 animate-spin text-tg-blue" />
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = flatItems[virtualItem.index]
            if (!item) return null

            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {item.type === 'date' ? (
                  <DateDivider label={item.label} />
                ) : (
                  <MessageBubble
                    message={item.message}
                    showAvatar={item.showAvatar}
                    showName={item.showName}
                    currentUserId={currentUserId}
                    conversationId={conversationId}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Scroll to bottom button */}
      <AnimatePresence>
        {showScrollBtn && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={scrollToBottom}
            className="absolute bottom-4 right-4 w-10 h-10 bg-white dark:bg-tg-bg-dark-secondary rounded-full shadow-panel flex items-center justify-center text-tg-blue hover:bg-tg-bg-secondary dark:hover:bg-tg-bg-dark transition"
          >
            <ChevronDown className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-2">
      <span className="bg-black/10 dark:bg-white/10 text-gray-600 dark:text-gray-300 text-xs px-3 py-1 rounded-full backdrop-blur-sm">
        {label}
      </span>
    </div>
  )
}
