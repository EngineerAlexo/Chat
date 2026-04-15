'use client'

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCallStore } from '@/lib/stores/useCallStore'
import { useWebRTC } from '@/lib/hooks/useWebRTC'
import Avatar from '@/components/ui/Avatar'
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react'

interface Props { currentUserId: string }

export default function CallModal({ currentUserId }: Props) {
  const {
    state, callType, remoteUsername, remoteAvatar, conversationId,
    localStream, remoteStream, isMuted, isCameraOff,
    toggleMute, toggleCamera, endCall,
  } = useCallStore()

  const { initiateCall, answerCall, hangUp } = useWebRTC(currentUserId)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream
    }
  }, [remoteStream])

  // When state becomes 'calling', initiate WebRTC
  useEffect(() => {
    if (state === 'calling' && conversationId && callType) {
      initiateCall(conversationId, callType)
    }
  }, [state]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAccept() {
    if (!conversationId || !callType) return
    const pendingOffer = (window as Window & { __pendingOffer?: RTCSessionDescriptionInit }).__pendingOffer
    if (pendingOffer) {
      await answerCall(conversationId, pendingOffer, callType)
    }
  }

  function handleReject() {
    endCall()
  }

  if (state === 'idle') return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      >
        <div className="relative w-full max-w-sm mx-4 bg-gray-900 rounded-3xl overflow-hidden shadow-2xl">
          {/* Remote video (full background when video call) */}
          {callType === 'video' && state === 'connected' ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-96 object-cover"
            />
          ) : (
            <div className="h-72 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-gray-800 to-gray-900">
              <Avatar src={remoteAvatar} name={remoteUsername ?? 'U'} size={80} />
              <div className="text-center">
                <p className="text-white font-semibold text-lg">{remoteUsername}</p>
                <p className="text-gray-400 text-sm mt-1">
                  {state === 'calling' ? `Calling... (${callType})` :
                   state === 'receiving' ? `Incoming ${callType} call` :
                   'Connected'}
                </p>
              </div>
            </div>
          )}

          {/* Local video pip */}
          {callType === 'video' && localStream && (
            <div className="absolute top-4 right-4 w-24 h-32 rounded-xl overflow-hidden border-2 border-white/20">
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            </div>
          )}

          {/* Controls */}
          <div className="p-6">
            {state === 'receiving' ? (
              /* Incoming call — accept / reject */
              <div className="flex items-center justify-center gap-8">
                <button
                  onClick={handleReject}
                  className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition"
                >
                  <PhoneOff className="w-6 h-6 text-white" />
                </button>
                <button
                  onClick={handleAccept}
                  className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition"
                >
                  <Phone className="w-6 h-6 text-white" />
                </button>
              </div>
            ) : (
              /* Active call controls */
              <div className="flex items-center justify-center gap-4">
                <CallBtn
                  icon={isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  onClick={toggleMute}
                  active={isMuted}
                  label={isMuted ? 'Unmute' : 'Mute'}
                />
                {callType === 'video' && (
                  <CallBtn
                    icon={isCameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                    onClick={toggleCamera}
                    active={isCameraOff}
                    label={isCameraOff ? 'Camera on' : 'Camera off'}
                  />
                )}
                <button
                  onClick={hangUp}
                  className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition"
                >
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

function CallBtn({ icon, onClick, active, label }: { icon: React.ReactNode; onClick: () => void; active: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`w-12 h-12 rounded-full flex items-center justify-center transition ${
        active ? 'bg-white/20 text-white' : 'bg-white/10 text-gray-300 hover:bg-white/20'
      }`}
    >
      {icon}
    </button>
  )
}
