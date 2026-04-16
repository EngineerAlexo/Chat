'use client'

import { useEffect, useRef } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useCallStore } from '@/lib/stores/useCallStore'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ── STUN + TURN for better connectivity ───────────────────────────────────
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
}

function callChannelName(a: string, b: string) {
  return `call:${[a, b].sort().join(':')}`
}
function ringChannelName(userId: string) {
  return `ring:${userId}`
}
function log(...args: unknown[]) {
  console.log('[WebRTC]', new Date().toISOString().slice(11, 23), ...args)
}

// ── Ringing audio (base64 encoded short beep) ─────────────────────────────
// Generated inline so no external file needed
let _ringAudio: HTMLAudioElement | null = null

function startRinging() {
  try {
    if (_ringAudio) return
    // Use Web Audio API to generate a ring tone — works under Android autoplay policy
    // because it's triggered by a user gesture (incoming call notification)
    const ctx = new (window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!)()
    let playing = true

    const beep = () => {
      if (!playing) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 440
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.5)
      setTimeout(() => { if (playing) beep() }, 1500)
    }

    beep()
    // Store stop function
    ;(_ringAudio as unknown as { stop: () => void }) = { stop: () => { playing = false; ctx.close() } }
  } catch (e) {
    log('ring audio error:', e)
  }
}

function stopRinging() {
  try {
    if (_ringAudio && typeof (_ringAudio as unknown as { stop?: () => void }).stop === 'function') {
      ;(_ringAudio as unknown as { stop: () => void }).stop()
    }
  } catch {}
  _ringAudio = null
}

export function useWebRTC(currentUserId: string) {
  const pcRef        = useRef<RTCPeerConnection | null>(null)
  const callChRef    = useRef<RealtimeChannel | null>(null)
  const iceQueue     = useRef<RTCIceCandidateInit[]>([])
  const remoteReady  = useRef(false)
  const answeringRef = useRef(false)
  const userIdRef    = useRef(currentUserId)
  userIdRef.current  = currentUserId

  // ── cleanup ────────────────────────────────────────────────────────────
  function cleanup() {
    if (answeringRef.current) {
      log('cleanup suppressed — answer in progress')
      return
    }
    log('cleanup')
    stopRinging()

    const pc = pcRef.current
    if (pc) {
      pc.onconnectionstatechange = null
      pc.oniceconnectionstatechange = null
      pc.ontrack = null
      pc.onicecandidate = null
      pc.close()
      pcRef.current = null
    }

    remoteReady.current = false
    iceQueue.current = []

    const supabase = getSupabaseClient()
    if (callChRef.current) {
      supabase.removeChannel(callChRef.current)
      callChRef.current = null
    }

    useCallStore.getState().endCall()
  }

  async function drainIce(pc: RTCPeerConnection) {
    log('draining', iceQueue.current.length, 'queued ICE candidates')
    const queue = [...iceQueue.current]
    iceQueue.current = []
    for (const c of queue) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)) }
      catch (e) { log('ICE drain error:', e) }
    }
  }

  // ── create RTCPeerConnection ───────────────────────────────────────────
  function createPC(): RTCPeerConnection {
    if (pcRef.current) {
      const old = pcRef.current
      old.onconnectionstatechange = null
      old.oniceconnectionstatechange = null
      old.ontrack = null
      old.onicecandidate = null
      old.close()
      pcRef.current = null
    }
    remoteReady.current = false
    iceQueue.current = []

    const pc = new RTCPeerConnection(ICE_SERVERS)
    pcRef.current = pc

    pc.ontrack = (e) => {
      log('ontrack — kind:', e.track.kind, 'streams:', e.streams.length, 'readyState:', e.track.readyState)
      // Ensure track is enabled
      e.track.enabled = true
      const stream = e.streams[0] ?? new MediaStream([e.track])
      useCallStore.getState().setRemoteStream(stream)
    }

    pc.onconnectionstatechange = () => {
      log('connectionState:', pc.connectionState)
      if (pc.connectionState === 'connected') {
        useCallStore.getState().setConnected()
      }
      if (pc.connectionState === 'failed') {
        log('connection failed')
        cleanup()
      }
      if (pc.connectionState === 'disconnected') {
        setTimeout(() => {
          if (pcRef.current?.connectionState === 'disconnected') cleanup()
        }, 5000)
      }
    }

    pc.oniceconnectionstatechange = () => {
      log('iceConnectionState:', pc.iceConnectionState)
    }

    pc.onsignalingstatechange = () => {
      log('signalingState:', pc.signalingState)
    }

    return pc
  }

  // ── get user media with proper constraints for Android ─────────────────
  async function getMedia(type: 'audio' | 'video'): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        // Android Chrome needs these explicit
        sampleRate: 48000,
        channelCount: 1,
      },
      video: type === 'video' ? {
        width: { ideal: 640, max: 1280 },
        height: { ideal: 480, max: 720 },
        frameRate: { ideal: 24, max: 30 },
        facingMode: 'user',
      } : false,
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      // Ensure all tracks are enabled
      stream.getTracks().forEach((t) => {
        t.enabled = true
        log('track acquired:', t.kind, 'enabled:', t.enabled, 'readyState:', t.readyState)
      })
      return stream
    } catch (e) {
      log('getUserMedia error:', e)
      throw e
    }
  }

  // ── join shared call channel ───────────────────────────────────────────
  async function joinCallChannel(remoteId: string): Promise<RealtimeChannel> {
    const supabase = getSupabaseClient()
    const name = callChannelName(userIdRef.current, remoteId)
    log('joining call channel:', name)

    if (callChRef.current) {
      supabase.removeChannel(callChRef.current)
      callChRef.current = null
    }

    const ch = supabase.channel(name, { config: { broadcast: { ack: true } } })
    callChRef.current = ch

    ch.on('broadcast', { event: 'call:answer' }, async ({ payload }) => {
      if (payload.from === userIdRef.current) return
      log('received answer')
      const pc = pcRef.current
      if (!pc) return
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
        remoteReady.current = true
        await drainIce(pc)
        log('answer applied ✓')
      } catch (e) { log('setRemoteDescription(answer) error:', e) }
    })

    ch.on('broadcast', { event: 'call:ice' }, async ({ payload }) => {
      if (payload.from === userIdRef.current) return
      const pc = pcRef.current
      if (!pc) return
      if (remoteReady.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)) }
        catch (e) { log('addIceCandidate error:', e) }
      } else {
        iceQueue.current.push(payload.candidate)
      }
    })

    ch.on('broadcast', { event: 'call:end' }, ({ payload }) => {
      if (payload.from === userIdRef.current) return
      log('remote ended call')
      cleanup()
    })

    ch.on('broadcast', { event: 'call:reject' }, ({ payload }) => {
      if (payload.from === userIdRef.current) return
      log('remote rejected call')
      cleanup()
    })

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('channel subscribe timeout')), 8000)
      ch.subscribe((status) => {
        log('call channel status:', status)
        if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve() }
        if (status === 'CHANNEL_ERROR') { clearTimeout(timer); reject(new Error('channel error')) }
      })
    })

    return ch
  }

  // ── INITIATE CALL ──────────────────────────────────────────────────────
  async function initiateCall(
    remoteId: string,
    remoteUsername: string,
    remoteAvatar: string | null,
    convId: string,
    type: 'audio' | 'video',
  ) {
    log('initiating', type, 'call to', remoteId)

    const stream = await getMedia(type)
    useCallStore.getState().setLocalStream(stream)

    const ch = await joinCallChannel(remoteId)

    const pc = createPC()
    stream.getTracks().forEach((t) => pc.addTrack(t, stream))
    log('tracks added to PC:', stream.getTracks().map(t => `${t.kind}(${t.enabled})`))

    pc.onicecandidate = (e) => {
      if (!e.candidate) return
      ch.send({
        type: 'broadcast', event: 'call:ice',
        payload: { candidate: e.candidate.toJSON(), from: userIdRef.current },
      })
    }

    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: type === 'video',
    })
    await pc.setLocalDescription(offer)
    log('offer created ✓')

    // Ring receiver with embedded offer
    const supabase = getSupabaseClient()
    const ringCh = supabase.channel(ringChannelName(remoteId))
    await new Promise<void>((resolve) => {
      ringCh.subscribe((s) => { if (s === 'SUBSCRIBED') resolve() })
    })

    await ringCh.send({
      type: 'broadcast', event: 'call:incoming',
      payload: {
        from: userIdRef.current,
        callType: type,
        conversationId: convId,
        remoteUsername: useCallStore.getState().currentUserName ?? userIdRef.current,
        remoteAvatar: useCallStore.getState().currentUserAvatar ?? null,
        offerSdp: offer,
      },
    })
    supabase.removeChannel(ringCh)
    log('ring sent with embedded offer ✓')
  }

  // ── ANSWER CALL ────────────────────────────────────────────────────────
  async function answerCall(
    remoteId: string,
    convId: string,
    type: 'audio' | 'video',
  ) {
    log('answerCall — remoteId:', remoteId, 'type:', type)
    answeringRef.current = true
    stopRinging()

    try {
      const pendingOffer = useCallStore.getState().pendingOffer
      if (!pendingOffer) throw new Error('No pending offer')
      log('pending offer found, type:', pendingOffer.type)

      const stream = await getMedia(type)
      useCallStore.getState().setLocalStream(stream)

      const ch = await joinCallChannel(remoteId)
      log('call channel joined ✓')

      const pc = createPC()
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))
      log('tracks added:', stream.getTracks().map(t => `${t.kind}(${t.enabled})`))

      pc.onicecandidate = (e) => {
        if (!e.candidate) return
        ch.send({
          type: 'broadcast', event: 'call:ice',
          payload: { candidate: e.candidate.toJSON(), from: userIdRef.current },
        })
      }

      await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer))
      remoteReady.current = true
      await drainIce(pc)
      log('remote description set ✓')

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      log('answer created ✓')

      await ch.send({
        type: 'broadcast', event: 'call:answer',
        payload: { sdp: answer, from: userIdRef.current },
      })
      log('answer sent ✓')

      useCallStore.getState().clearPendingOffer()
    } finally {
      answeringRef.current = false
    }
  }

  // ── HANG UP ────────────────────────────────────────────────────────────
  function hangUp() {
    log('hangUp')
    if (callChRef.current) {
      callChRef.current.send({
        type: 'broadcast', event: 'call:end',
        payload: { from: userIdRef.current },
      })
    }
    cleanup()
  }

  // ── REJECT ─────────────────────────────────────────────────────────────
  async function rejectCall(remoteId: string) {
    log('rejectCall')
    stopRinging()
    const supabase = getSupabaseClient()
    const ch = supabase.channel(callChannelName(userIdRef.current, remoteId))
    await new Promise<void>((r) => ch.subscribe((s) => { if (s === 'SUBSCRIBED') r() }))
    await ch.send({
      type: 'broadcast', event: 'call:reject',
      payload: { from: userIdRef.current },
    })
    supabase.removeChannel(ch)
    useCallStore.getState().endCall()
  }

  // ── LISTEN FOR INCOMING CALLS ──────────────────────────────────────────
  useEffect(() => {
    if (!currentUserId) return
    const supabase = getSupabaseClient()
    const name = ringChannelName(currentUserId)
    log('listening on ring channel:', name)

    const ch = supabase.channel(name)

    ch.on('broadcast', { event: 'call:incoming' }, ({ payload }) => {
      if (payload.from === currentUserId) return
      log('incoming call from', payload.from, '| type:', payload.callType, '| offer:', !!payload.offerSdp)

      if (payload.offerSdp) {
        useCallStore.getState().setPendingOffer(payload.offerSdp)
      }

      useCallStore.getState().receiveCall({
        callType: payload.callType,
        remoteUserId: payload.from,
        remoteUsername: payload.remoteUsername ?? 'Unknown',
        remoteAvatar: payload.remoteAvatar ?? null,
        conversationId: payload.conversationId,
      })

      // Start ringing — triggered by incoming event (user interaction context)
      startRinging()
    })

    ch.subscribe((status) => log('ring channel status:', status))
    return () => { supabase.removeChannel(ch) }
  }, [currentUserId])

  return { initiateCall, answerCall, hangUp, rejectCall }
}
