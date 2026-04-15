'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import type { MediaType } from '@/lib/types'
import { formatFileSize } from '@/lib/utils/formatTime'
import { FileText, Download, Play, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface Props {
  url: string
  type: MediaType
  fileName?: string
  fileSize?: number
}

export default function MediaMessage({ url, type, fileName, fileSize }: Props) {
  const [lightbox, setLightbox] = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false)

  if (type === 'image' || type === 'gif') {
    return (
      <>
        <div
          className="relative rounded-xl overflow-hidden cursor-pointer max-w-[280px]"
          onClick={() => setLightbox(true)}
        >
          <Image
            src={url}
            alt="Image"
            width={280}
            height={200}
            className="object-cover w-full max-h-[280px] hover:brightness-95 transition"
            unoptimized={type === 'gif'}
          />
          {type === 'gif' && (
            <span className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">GIF</span>
          )}
        </div>

        <AnimatePresence>
          {lightbox && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
              onClick={() => setLightbox(false)}
            >
              <button className="absolute top-4 right-4 text-white hover:text-gray-300">
                <X className="w-6 h-6" />
              </button>
              <motion.img
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                src={url}
                alt="Full size"
                className="max-w-full max-h-full object-contain rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </>
    )
  }

  if (type === 'video') {
    return (
      <div className="relative rounded-xl overflow-hidden max-w-[280px] bg-black">
        <video
          src={url}
          className="w-full max-h-[280px] object-cover"
          controls={videoPlaying}
          onClick={() => setVideoPlaying(true)}
        />
        {!videoPlaying && (
          <button
            onClick={() => setVideoPlaying(true)}
            className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition"
          >
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
              <Play className="w-5 h-5 text-gray-900 ml-0.5" />
            </div>
          </button>
        )}
      </div>
    )
  }

  if (type === 'sticker') {
    return (
      <Image
        src={url}
        alt="Sticker"
        width={160}
        height={160}
        className="object-contain"
        unoptimized
      />
    )
  }

  // File
  return (
    <a
      href={url}
      download={fileName}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl transition',
        'bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15',
        'min-w-[200px] max-w-[280px]'
      )}
    >
      <div className="w-10 h-10 rounded-xl bg-tg-blue/20 flex items-center justify-center flex-shrink-0">
        <FileText className="w-5 h-5 text-tg-blue" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{fileName ?? 'File'}</p>
        {fileSize && <p className="text-xs text-tg-text-secondary">{formatFileSize(fileSize)}</p>}
      </div>
      <Download className="w-4 h-4 text-tg-text-secondary flex-shrink-0" />
    </a>
  )
}
