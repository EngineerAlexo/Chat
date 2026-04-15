'use client'

import { useEffect, useRef } from 'react'
import EmojiPicker, { Theme, EmojiClickData } from 'emoji-picker-react'
import { useChatStore } from '@/lib/stores/useChatStore'

interface Props {
  onSelect: (emoji: string) => void
  onClose: () => void
}

export default function EmojiPickerPanel({ onSelect, onClose }: Props) {
  const { theme } = useChatStore()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  function handleEmojiClick(data: EmojiClickData) {
    onSelect(data.emoji)
  }

  return (
    <div ref={ref}>
      <EmojiPicker
        onEmojiClick={handleEmojiClick}
        theme={theme === 'dark' ? Theme.DARK : Theme.LIGHT}
        width={320}
        height={380}
        searchPlaceholder="Search emoji..."
        lazyLoadEmojis
      />
    </div>
  )
}
