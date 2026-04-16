'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCallStore } from '@/lib/stores/useCallStore'
import { useWebRTC } from '@/lib/hooks/useWebRTC'
import Avatar from '@/components/ui/Avatar'
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react'

interface Props { currentUserId: string }

export default function CallModal({ currentUserId }: Props) {
  const {
    state, callType, remoteUsername, remoteAvatar, remoteUserId, conversationId,
    localStream, remoteStream, isMuted, isCameraOff, toggleMute, toggleCamera,
  } = useCallStore()

  const { initiateCall, answerCall, hangUp, rejectCall } = useWebRTC(currentUserId)

  const localVideoRef  = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  const didInitiate    = useRef(false)
  const [callSeconds, setCallSeconds] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Attach local stream ────────────────────────────────────────────────
  useEffect(() => {
    const el = localVideoRef.current
    if (!el || !localStream) return
    el.srcObject = localStream
    // Android requires explicit play() call
    el.play().catch(() => {})
  }, [localStream])

  // ── Attach remote stream ───────────────────────────────────────────────
  useEffect(() => {
    if (!remoteStream) return

    // Audio call — use audio element
    const audioEl = remoteAudioRef.current
    if (audioEl) {
      audioEl.srcObject = remoteStream
      audioEl.volume = 1.0
      audioEl.play().catch((e) => console.warn('[CallModal] audio play failed:', e))
    }

    // Video call — use video element
    const videoEl = remoteVideoRef.current
    if (videoEl) {
      videoEl.srcObject = remoteStream
      videoEl.play().catch((e) => console.warn('[CallModal] video play failed:', e))
    }
  }, [remoteStream])

  // ── Call timer — starts when connected ────────────────────────────────
  useEffect(() => {
    if (state === 'connected') {
      setCallSeconds(0)
      timerRef.current = setInterval(() => setCallSeconds((s) => s + 1), 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      if (state === 'idle') setCallSeconds(0)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [state])

  // ── Initiate call when state → 'calling' ──────────────────────────────
  useEffect(() => {
    if (state !== 'calling') return
    if (didInitiate.current) return
    if (!conversationId || !callType || !remoteUserId) return

    didInitiate.current = true
    initiateCall(remoteUserId, remoteUsername ?? 'Unknown', remoteAvatar ?? null, conversationId, callType)
      .catch((err) => {
        console.error('[CallModal] initiateCall failed:', err)
        useCallStore.getState().endCall()
      })
  }, [state]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state === 'idle') didInitiate.current = false
  }, [state])

  async function handleAccept() {
    if (!conversationId || !callType || !remoteUserId) return
    try {
      await answerCall(remoteUserId, conversationId, callType)
    } catch (err) {
      console.error('[CallModal] answerCall failed:', err)
      useCallStore.getState().endCall()
    }
  }

  function handleReject() {
    if (remoteUserId) rejectCall(remoteUserId).catch(console.error)
    else useCallStore.getState().endCall()
  }

  if (state === 'idle') return null

  const statusText =
    state === 'calling'   ? `Calling... (${callType})` :
    state === 'receiving' ? `Incoming ${callType} call` :
    formatDuration(callSeconds)

  return (
    <AnimatePresence>
      <motion.div
        key="call-modal"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80"
      >
        {/* Hidden audio element for remote audio — always present */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

        <div className="relative w-full max-w-sm mx-4 bg-gray-900 rounded-3xl overflow-hidden shadow-2xl">

          {/* Remote video */}
          {callType === 'video' && state === 'connected' && remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-96 object-cover bg-black"
            />
          ) : (
            <div className="h-72 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-gray-800 to-gray-900">
              <Avatar src={remoteAvatar} name={remoteUsername ?? 'U'} size={80} />
              <div className="text-center">
                <p className="text-white font-semibold text-lg">{remoteUsername}</p>
                <p className="text-gray-400 text-sm mt-1">{statusText}</p>
              </div>
            </div>
          )}

          {/* Local video PiP */}
          {callType === 'video' && localStream && (
            <div className="absolute top-4 right-4 w-24 h-32 rounded-xl overflow-hidden border-2 border-white/20 bg-black">
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            </div>
          )}

          {/* Controls */}
          <div className="p-6">
            {state === 'receiving' ? (
              <div className="flex items-center justify-center gap-8">
                <button onClick={handleReject}
                  className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition active:scale-95">
                  <PhoneOff className="w-6 h-6 text-white" />
                </button>
                <button onClick={handleAccept}
                  className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition active:scale-95">
                  <Phone className="w-6 h-6 text-white" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-4">
                <CallBtn
                  icon={isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  onClick={toggleMute} active={isMuted} label={isMuted ? 'Unmute' : 'Mute'}
                />
                {callType === 'video' && (
                  <CallBtn
                    icon={isCameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                    onClick={toggleCamera} active={isCameraOff} label={isCameraOff ? 'Camera on' : 'Camera off'}
                  />
                )}
                <button onClick={hangUp}
                  className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition active:scale-95">
                  <PhoneOff className="w-6 h-6 text-white" />
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

function CallBtn({ icon, onClick, active, label }: {
  icon: React.ReactNode; onClick: () => void; active: boolean; label: string
}) {
  return (
    <button onClick={onClick} title={label}
      className={`w-12 h-12 rounded-full flex items-center justify-center transition active:scale-95 ${
        active ? 'bg-white/20 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
      }`}>
      {icon}
    </button>
  )
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
