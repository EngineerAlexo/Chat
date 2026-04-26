'use client'

import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { AnimatePresence, motion } from 'framer-motion'
import type { Message } from '@/lib/types'
import { groupMessagesByDate, shouldShowAvatar, shouldShowSenderName } from '@/lib/utils/groupMessages'
import MessageBubble from './MessageBubble'
import { Loader2, ChevronDown } from 'lucide-react'

interface Props {
  conversationId: string
  messages: Message[]
  currentUserId: string
  onLoadMore: () => void
  isLoadingMore: boolean
}

export default function MessageList({ conversationId, messages, currentUserId, onLoadMore, isLoadingMore }: Props) {
  const parentRef        = useRef<HTMLDivElement>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const atBottomRef      = useRef(true)
  const prevLengthRef    = useRef(0)
  const isLoadingMoreRef = useRef(isLoadingMore)
  const scrolledInitially = useRef(false)
  // Track IDs of messages that existed before this render — new ones get animation
  const knownIdsRef      = useRef<Set<string>>(new Set())

  isLoadingMoreRef.current = isLoadingMore

  // Reset on conversation change
  useEffect(() => {
    scrolledInitially.current = false
    prevLengthRef.current = 0
    knownIdsRef.current = new Set()
  }, [conversationId])

  // Memoized flat list — only recomputes when messages change
  const flatItems = useMemo(() => {
    const groups = groupMessagesByDate(messages)
    const items: Array<
      | { type: 'date'; key: string; label: string }
      | { type: 'message'; key: string; message: Message; index: number; showAvatar: boolean; showName: boolean; isNew: boolean }
    > = []
    let idx = 0
    for (const group of groups) {
      items.push({ type: 'date', key: `d:${group.date}`, label: group.date })
      for (const msg of group.messages) {
        const i = idx
        const isNew = !knownIdsRef.current.has(msg.id)
        items.push({
          type: 'message',
          key: `m:${msg.id}`,
          message: msg,
          index: i,
          showAvatar: shouldShowAvatar(messages, i),
          showName: msg.sender_id !== currentUserId && shouldShowSenderName(messages, i),
          isNew,
        })
        idx++
      }
    }
    messages.forEach((m) => knownIdsRef.current.add(m.id))
    return items
  }, [messages, currentUserId])

  const flatItemsRef = useRef(flatItems)
  flatItemsRef.current = flatItems

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => flatItemsRef.current[index]?.key ?? index,
    estimateSize: (i) => {
      const item = flatItemsRef.current[i]
      if (!item) return 60
      if (item.type === 'date') return 36
      return item.message.media_type ? 220 : 72
    },
    overscan: 8,
  })

  // Scroll to bottom on initial load — runs once per conversation
  useEffect(() => {
    if (scrolledInitially.current || flatItems.length === 0) return
    scrolledInitially.current = true
    requestAnimationFrame(() => {
      const el = parentRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [flatItems.length])

  // Auto-scroll on new messages (only if already at bottom)
  useEffect(() => {
    const newLen = messages.length
    const prevLen = prevLengthRef.current
    prevLengthRef.current = newLen
    if (newLen > prevLen && atBottomRef.current && scrolledInitially.current) {
      requestAnimationFrame(() => {
        const el = parentRef.current
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      })
    }
  }, [messages.length])

  const handleScroll = useCallback(() => {
    const el = parentRef.current
    if (!el) return
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight
    atBottomRef.current = dist < 120
    setShowScrollBtn(dist > 200)
    if (el.scrollTop < 200 && !isLoadingMoreRef.current) onLoadMore()
  }, [onLoadMore])

  useEffect(() => {
    const el = parentRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  return (
    <div className="relative flex-1 overflow-hidden">
      <div className="absolute inset-0 bg-tg-bg-secondary dark:bg-tg-bg-dark-tertiary pointer-events-none" />

      <div ref={parentRef} className="h-full overflow-y-auto px-2 md:px-4 py-2 relative overflow-x-hidden">
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
          {virtualizer.getVirtualItems().map((vItem) => {
            const item = flatItems[vItem.index]
            if (!item) return null
            return (
              <div
                key={vItem.key}
                data-index={vItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0, left: 0, width: '100%',
                  transform: `translateY(${vItem.start}px)`,
                  willChange: 'transform',
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
                    isNew={item.isNew}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <AnimatePresence>
        {showScrollBtn && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => parentRef.current?.scrollTo({ top: parentRef.current.scrollHeight, behavior: 'smooth' })}
            className="absolute bottom-4 right-4 w-10 h-10 bg-white dark:bg-tg-bg-dark-secondary rounded-full shadow-panel flex items-center justify-center text-tg-blue hover:bg-tg-bg-secondary dark:hover:bg-tg-bg-dark transition touch-feedback"
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
