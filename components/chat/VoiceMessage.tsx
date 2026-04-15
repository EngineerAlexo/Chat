'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Howl } from 'howler'
import { Play, Pause } from 'lucide-react'
import { formatDuration } from '@/lib/utils/formatTime'
import { cn } from '@/lib/utils/cn'

interface Props {
  url: string
  isOwn: boolean
}

export default function VoiceMessage({ url, isOwn }: Props) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const howlRef = useRef<Howl | null>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const howl = new Howl({
      src: [url],
      html5: true,
      onload: () => setDuration(howl.duration()),
      onend: () => { setPlaying(false); setProgress(0); setCurrent(0) },
    })
    howlRef.current = howl
    return () => { howl.unload(); cancelAnimationFrame(rafRef.current) }
  }, [url])

  function tick() {
    const howl = howlRef.current
    if (!howl) return
    const seek = howl.seek() as number
    const dur = howl.duration()
    setCurrent(seek)
    setProgress(dur > 0 ? (seek / dur) * 100 : 0)
    if (howl.playing()) rafRef.current = requestAnimationFrame(tick)
  }

  function togglePlay() {
    const howl = howlRef.current
    if (!howl) return
    if (playing) {
      howl.pause()
      setPlaying(false)
      cancelAnimationFrame(rafRef.current)
    } else {
      howl.play()
      setPlaying(true)
      rafRef.current = requestAnimationFrame(tick)
    }
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const howl = howlRef.current
    if (!howl) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    howl.seek(pct * howl.duration())
    setProgress(pct * 100)
  }

  // Generate stable waveform bars seeded from URL
  const bars = useMemo(() => {
    let seed = 0
    for (let i = 0; i < url.length; i++) seed = (seed * 31 + url.charCodeAt(i)) & 0xffffffff
    return Array.from({ length: 30 }, (_, i) => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff
      const h = 4 + Math.abs(Math.sin(i * 0.8 + seed * 0.0001)) * 12 + (Math.abs(seed >> 16) % 6)
      return Math.max(4, Math.min(20, h))
    })
  }, [url])

  return (
    <div className="flex items-center gap-3 min-w-[200px] max-w-[280px]">
      <button
        onClick={togglePlay}
        className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition',
          isOwn ? 'bg-tg-blue/20 hover:bg-tg-blue/30 text-tg-blue' : 'bg-tg-blue hover:bg-tg-blue-dark text-white'
        )}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>

      <div className="flex-1">
        {/* Waveform */}
        <div
          className="flex items-center gap-[2px] h-6 cursor-pointer"
          onClick={handleSeek}
        >
          {bars.map((h, i) => (
            <div
              key={i}
              className={cn(
                'waveform-bar rounded-full transition-colors',
                (i / bars.length) * 100 <= progress
                  ? isOwn ? 'bg-tg-blue' : 'bg-tg-blue'
                  : isOwn ? 'bg-tg-blue/30' : 'bg-gray-300 dark:bg-gray-600'
              )}
              style={{ height: `${h}px` }}
            />
          ))}
        </div>
        <div className="flex justify-between mt-0.5">
          <span className="text-[10px] text-tg-text-secondary">{formatDuration(current)}</span>
          <span className="text-[10px] text-tg-text-secondary">{formatDuration(duration)}</span>
        </div>
      </div>
    </div>
  )
}
