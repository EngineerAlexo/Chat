'use client'

import { useState, useEffect, useRef } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { Sticker } from '@/lib/types'
import Image from 'next/image'
import { Loader2 } from 'lucide-react'

interface Props {
  onSelect: (imageUrl: string) => void
  onClose: () => void
}

// Default sticker packs using open-source stickers
const DEFAULT_STICKERS: Sticker[] = Array.from({ length: 12 }, (_, i) => ({
  id: `default-${i}`,
  name: `Sticker ${i + 1}`,
  image_url: `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${i}&size=80`,
  pack_id: 'default',
}))

export default function StickerPicker({ onSelect, onClose }: Props) {
  const [stickers, setStickers] = useState<Sticker[]>(DEFAULT_STICKERS)
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const supabase = getSupabaseClient()
      const { data } = await supabase.from('stickers').select('*').limit(40)
      if (data?.length) setStickers([...DEFAULT_STICKERS, ...data])
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="w-72 bg-white dark:bg-tg-bg-dark-secondary rounded-2xl shadow-modal border border-tg-border dark:border-tg-border-dark overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-tg-border dark:border-tg-border-dark">
        <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Stickers</h3>
      </div>
      <div className="p-3 grid grid-cols-4 gap-2 max-h-64 overflow-y-auto">
        {loading ? (
          <div className="col-span-4 flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-tg-blue" />
          </div>
        ) : (
          stickers.map((sticker) => (
            <button
              key={sticker.id}
              onClick={() => onSelect(sticker.image_url)}
              className="aspect-square rounded-xl hover:bg-tg-bg-secondary dark:hover:bg-tg-bg-dark p-1 transition"
            >
              <Image
                src={sticker.image_url}
                alt={sticker.name}
                width={60}
                height={60}
                className="w-full h-full object-contain"
                unoptimized
              />
            </button>
          ))
        )}
      </div>
    </div>
  )
}
