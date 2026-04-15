'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDropzone } from 'react-dropzone'
import { useChatStore } from '@/lib/stores/useChatStore'
import { getSupabaseClient } from '@/lib/supabase/client'
import { broadcastTyping } from '@/lib/supabase/realtime'
import { uploadFile, compressImage, getMediaType } from '@/lib/utils/upload'
import type { Message } from '@/lib/types'
import { cn } from '@/lib/utils/cn'
import EmojiPickerPanel from '@/components/ui/EmojiPickerPanel'
import StickerPicker from '@/components/ui/StickerPicker'
import {
  Smile, Paperclip, Mic, Send, X, Image as ImageIcon,
  Sticker, StopCircle, Loader2
} from 'lucide-react'

interface Props {
  conversationId: string
  currentUserId: string
}

export default function MessageInput({ conversationId, currentUserId }: Props) {
  const { replyTo, setReplyTo, editingMessage, setEditingMessage, addMessage, updateMessage, currentUser } = useChatStore()
  const [text, setText] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [showSticker, setShowSticker] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [mediaPreview, setMediaPreview] = useState<{ file: File; url: string } | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastTypingSentRef = useRef<number>(0)

  // Trigger layout recalc on mount — fixes thin input on first render (Android)
  useEffect(() => {
    window.dispatchEvent(new Event('resize'))
  }, [])

  // Populate input when editing
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.content ?? '')
      textareaRef.current?.focus()
    }
  }, [editingMessage])

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }, [text])

  // Debounced typing broadcast — max once per 500ms, works on Android
  const handleTyping = useCallback(() => {
    if (!currentUser) return
    const now = Date.now()
    // Throttle: only send if 500ms have passed since last send
    if (now - lastTypingSentRef.current > 500) {
      lastTypingSentRef.current = now
      broadcastTyping(conversationId, {
        user_id: currentUser.id,
        username: currentUser.username,
        avatar_url: currentUser.avatar_url,
      })
    }
    // Reset the stop-typing timer
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => {
      // Typing stopped — nothing to broadcast (server clears after 3s)
      typingTimerRef.current = null
    }, 2000)
  }, [conversationId, currentUser])

  async function sendMessage() {
    const content = text.trim()
    if (!content && !mediaPreview) return
    if (editingMessage) {
      await handleEdit(content)
      return
    }

    const supabase = getSupabaseClient()
    const optimisticId = `opt-${Date.now()}`

    // Optimistic message
    const optimistic: Message = {
      id: optimisticId,
      conversation_id: conversationId,
      sender_id: currentUserId,
      content: content || null,
      media_url: null,
      media_type: null,
      reply_to_id: replyTo?.id ?? null,
      forwarded_from: null,
      is_edited: false,
      deleted_for: [],
      created_at: new Date().toISOString(),
      status: 'sending',
      optimistic: true,
      sender: currentUser ?? undefined,
      reply_to: replyTo ?? null,
    }

    addMessage(conversationId, optimistic)
    setText('')
    setReplyTo(null)

    try {
      let mediaUrl: string | null = null
      let mediaType = null

      if (mediaPreview) {
        setUploading(true)
        const compressed = await compressImage(mediaPreview.file)
        const path = `${currentUserId}/${Date.now()}-${mediaPreview.file.name}`
        mediaUrl = await uploadFile(compressed, 'media', path, setUploadProgress)
        mediaType = getMediaType(mediaPreview.file)
        setMediaPreview(null)
        setUploading(false)
      }

      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: currentUserId,
          content: content || null,
          media_url: mediaUrl,
          media_type: mediaType,
          reply_to_id: replyTo?.id ?? null,
        })
        .select('*, sender:profiles(*), reply_to:messages!reply_to_id(*)')
        .single()

      if (error) throw error

      updateMessage(conversationId, optimisticId, { ...data, optimistic: false, status: 'sent' })
    } catch {
      updateMessage(conversationId, optimisticId, { status: 'failed' })
    }
  }

  async function handleEdit(content: string) {
    if (!editingMessage || !content.trim()) return
    const supabase = getSupabaseClient()
    setEditingMessage(null)
    setText('')

    await supabase
      .from('messages')
      .update({ content, is_edited: true })
      .eq('id', editingMessage.id)

    updateMessage(conversationId, editingMessage.id, { content, is_edited: true })
  }

  async function sendSticker(imageUrl: string) {
    setShowSticker(false)
    const supabase = getSupabaseClient()
    const optimisticId = `opt-${Date.now()}`
    const optimistic: Message = {
      id: optimisticId,
      conversation_id: conversationId,
      sender_id: currentUserId,
      content: null,
      media_url: imageUrl,
      media_type: 'sticker',
      reply_to_id: null,
      forwarded_from: null,
      is_edited: false,
      deleted_for: [],
      created_at: new Date().toISOString(),
      status: 'sending',
      optimistic: true,
      sender: currentUser ?? undefined,
    }
    addMessage(conversationId, optimistic)

    const { data } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, sender_id: currentUserId, media_url: imageUrl, media_type: 'sticker' })
      .select()
      .single()

    if (data) updateMessage(conversationId, optimisticId, { ...data, optimistic: false, status: 'sent' })
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []
      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data)
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' })
        await sendVoiceMessage(file)
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
      setRecordingTime(0)
      recordingTimerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000)
    } catch {
      alert('Microphone access denied')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setRecording(false)
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
  }

  async function sendVoiceMessage(file: File) {
    const supabase = getSupabaseClient()
    const optimisticId = `opt-${Date.now()}`
    const localUrl = URL.createObjectURL(file)

    const optimistic: Message = {
      id: optimisticId,
      conversation_id: conversationId,
      sender_id: currentUserId,
      content: null,
      media_url: localUrl,
      media_type: 'voice',
      reply_to_id: null,
      forwarded_from: null,
      is_edited: false,
      deleted_for: [],
      created_at: new Date().toISOString(),
      status: 'sending',
      optimistic: true,
      sender: currentUser ?? undefined,
    }
    addMessage(conversationId, optimistic)

    try {
      const path = `${currentUserId}/voice-${Date.now()}.webm`
      const url = await uploadFile(file, 'media', path)
      const { data } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, sender_id: currentUserId, media_url: url, media_type: 'voice' })
        .select()
        .single()
      if (data) updateMessage(conversationId, optimisticId, { ...data, media_url: url, optimistic: false, status: 'sent' })
    } catch {
      updateMessage(conversationId, optimisticId, { status: 'failed' })
    }
  }

  const onDrop = useCallback((files: File[]) => {
    const file = files[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setMediaPreview({ file, url })
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    accept: { 'image/*': [], 'video/*': [], 'audio/*': [], 'application/*': [] },
  })

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
    if (e.key === 'Escape') {
      setReplyTo(null)
      setEditingMessage(null)
      setText('')
    }
  }

  const canSend = text.trim().length > 0 || !!mediaPreview

  return (
    <div {...getRootProps()} className="relative flex-shrink-0 w-full">
      <input {...getInputProps()} />

      {/* Drag overlay */}
      <AnimatePresence>
        {isDragActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 bg-tg-blue/10 border-2 border-dashed border-tg-blue rounded-xl flex items-center justify-center"
          >
            <p className="text-tg-blue font-medium">Drop files to send</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Emoji picker */}
      <AnimatePresence>
        {showEmoji && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-full left-0 mb-2 z-20"
          >
            <EmojiPickerPanel
              onSelect={(emoji) => { setText((t) => t + emoji); setShowEmoji(false); textareaRef.current?.focus() }}
              onClose={() => setShowEmoji(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sticker picker */}
      <AnimatePresence>
        {showSticker && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-full right-0 mb-2 z-20"
          >
            <StickerPicker onSelect={sendSticker} onClose={() => setShowSticker(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="border-t border-tg-border dark:border-tg-border-dark glass px-2 md:px-3 py-2 w-full input-bar">
        {/* Reply/Edit bar */}
        <AnimatePresence>
          {(replyTo || editingMessage) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 mb-2 pl-3 border-l-2 border-tg-blue"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-tg-blue">
                  {editingMessage ? 'Edit Message' : `Reply to ${replyTo?.sender?.username ?? 'message'}`}
                </p>
                <p className="text-xs text-tg-text-secondary truncate">
                  {editingMessage?.content ?? replyTo?.content ?? '📎 Media'}
                </p>
              </div>
              <button
                onClick={() => { setReplyTo(null); setEditingMessage(null); setText('') }}
                className="text-tg-text-secondary hover:text-gray-700 dark:hover:text-gray-300"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Media preview */}
        <AnimatePresence>
          {mediaPreview && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-2 relative inline-block"
            >
              {mediaPreview.file.type.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaPreview.url} alt="Preview" className="h-20 rounded-lg object-cover" />
              ) : (
                <div className="flex items-center gap-2 bg-tg-bg-secondary dark:bg-tg-bg-dark rounded-lg px-3 py-2">
                  <ImageIcon className="w-4 h-4 text-tg-blue" />
                  <span className="text-sm truncate max-w-[200px]">{mediaPreview.file.name}</span>
                </div>
              )}
              <button
                onClick={() => setMediaPreview(null)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white"
              >
                <X className="w-3 h-3" />
              </button>
              {uploading && (
                <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                  <span className="text-white text-xs font-medium">{uploadProgress}%</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recording UI */}
        <AnimatePresence>
          {recording && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3 py-2"
            >
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm text-red-500 font-medium">
                {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
              </span>
              <span className="text-sm text-tg-text-secondary flex-1">Recording voice message...</span>
              <button onClick={stopRecording} className="text-red-500 hover:text-red-600">
                <StopCircle className="w-6 h-6" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {!recording && (
          <div className="flex items-end gap-2">
            <button
              onClick={() => { setShowEmoji(!showEmoji); setShowSticker(false) }}
              className={cn('flex-shrink-0 text-tg-text-secondary hover:text-tg-blue transition p-1', showEmoji && 'text-tg-blue')}
            >
              <Smile className="w-5 h-5" />
            </button>

            <label className="flex-shrink-0 text-tg-text-secondary hover:text-tg-blue transition p-1 cursor-pointer">
              <Paperclip className="w-5 h-5" />
              <input
                type="file"
                className="hidden"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.zip"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) { const url = URL.createObjectURL(file); setMediaPreview({ file, url }) }
                  e.target.value = ''
                }}
              />
            </label>

            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => { setText(e.target.value); handleTyping() }}
              onInput={handleTyping}
              onKeyDown={handleKeyDown}
              placeholder={editingMessage ? 'Edit message...' : 'Message'}
              rows={1}
              className="flex-1 min-w-0 resize-none bg-tg-bg-secondary dark:bg-tg-bg-dark rounded-2xl px-3 py-2 md:px-4 md:py-2.5 text-sm text-gray-900 dark:text-white placeholder-tg-text-secondary focus:outline-none focus:ring-2 focus:ring-tg-blue/50 transition textarea-smooth max-h-32 md:max-h-40 leading-relaxed"
            />

            <button
              onClick={() => { setShowSticker(!showSticker); setShowEmoji(false) }}
              className={cn('flex-shrink-0 text-tg-text-secondary hover:text-tg-blue transition p-1', showSticker && 'text-tg-blue')}
            >
              <Sticker className="w-5 h-5" />
            </button>

            {canSend ? (
              <motion.button
                key="send"
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                onClick={sendMessage}
                disabled={uploading}
                className="flex-shrink-0 w-9 h-9 rounded-full bg-tg-blue hover:bg-tg-blue-dark text-white flex items-center justify-center transition touch-feedback active:scale-90"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </motion.button>
            ) : (
              <motion.button
                key="mic"
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                onClick={startRecording}
                className="flex-shrink-0 w-9 h-9 rounded-full bg-tg-blue hover:bg-tg-blue-dark text-white flex items-center justify-center transition touch-feedback active:scale-90"
              >
                <Mic className="w-4 h-4" />
              </motion.button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
