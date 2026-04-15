'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils/cn'

interface Props {
  src?: string | null
  name: string
  size?: number
  online?: boolean
  className?: string
}

const COLORS = [
  'bg-red-400', 'bg-orange-400', 'bg-amber-400', 'bg-green-400',
  'bg-teal-400', 'bg-blue-400', 'bg-indigo-400', 'bg-purple-400', 'bg-pink-400',
]

function getColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return COLORS[Math.abs(hash) % COLORS.length]
}

export default function Avatar({ src, name, size = 40, online, className }: Props) {
  const initials = name
    .split(/[\s_]/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  const fontSize = size < 32 ? 10 : size < 48 ? 14 : 18

  return (
    <div
      className={cn('relative flex-shrink-0', className)}
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image
          src={src}
          alt={name}
          width={size}
          height={size}
          className="rounded-full object-cover w-full h-full"
          unoptimized={src.includes('dicebear')}
        />
      ) : (
        <div
          className={cn('rounded-full flex items-center justify-center text-white font-semibold select-none', getColor(name))}
          style={{ width: size, height: size, fontSize }}
        >
          {initials || '?'}
        </div>
      )}

      {online !== undefined && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full border-2 border-white dark:border-tg-bg-dark-secondary',
            online ? 'bg-tg-green' : 'bg-gray-400'
          )}
          style={{ width: size * 0.28, height: size * 0.28 }}
        />
      )}
    </div>
  )
}
