import { create } from 'zustand'

export type CallState = 'idle' | 'calling' | 'receiving' | 'connected'
export type CallType = 'audio' | 'video'

interface CallStore {
  state: CallState
  callType: CallType | null
  remoteUserId: string | null
  remoteUsername: string | null
  remoteAvatar: string | null
  conversationId: string | null
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  isMuted: boolean
  isCameraOff: boolean

  startCall: (opts: { callType: CallType; remoteUserId: string; remoteUsername: string; remoteAvatar: string | null; conversationId: string }) => void
  receiveCall: (opts: { callType: CallType; remoteUserId: string; remoteUsername: string; remoteAvatar: string | null; conversationId: string }) => void
  setConnected: () => void
  setLocalStream: (s: MediaStream | null) => void
  setRemoteStream: (s: MediaStream | null) => void
  toggleMute: () => void
  toggleCamera: () => void
  endCall: () => void
}

export const useCallStore = create<CallStore>((set, get) => ({
  state: 'idle',
  callType: null,
  remoteUserId: null,
  remoteUsername: null,
  remoteAvatar: null,
  conversationId: null,
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isCameraOff: false,

  startCall: (opts) => set({ state: 'calling', ...opts }),
  receiveCall: (opts) => set({ state: 'receiving', ...opts }),
  setConnected: () => set({ state: 'connected' }),
  setLocalStream: (s) => set({ localStream: s }),
  setRemoteStream: (s) => set({ remoteStream: s }),

  toggleMute: () => {
    const { localStream, isMuted } = get()
    localStream?.getAudioTracks().forEach((t) => { t.enabled = isMuted })
    set({ isMuted: !isMuted })
  },
  toggleCamera: () => {
    const { localStream, isCameraOff } = get()
    localStream?.getVideoTracks().forEach((t) => { t.enabled = isCameraOff })
    set({ isCameraOff: !isCameraOff })
  },

  endCall: () => {
    const { localStream } = get()
    localStream?.getTracks().forEach((t) => t.stop())
    set({
      state: 'idle',
      callType: null,
      remoteUserId: null,
      remoteUsername: null,
      remoteAvatar: null,
      conversationId: null,
      localStream: null,
      remoteStream: null,
      isMuted: false,
      isCameraOff: false,
    })
  },
}))
