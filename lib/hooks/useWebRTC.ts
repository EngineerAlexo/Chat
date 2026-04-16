'use client'

import { useEffect, useRef } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useCallStore } from '@/lib/stores/useCallStore'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ── ICE servers — multiple STUN for reliability ────────────────────────────
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
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

// ── Ringing tone via Web Audio API ────────────────────────────────────────
interface RingHandle { stop: () => void }
let _ring: RingHandle | null = null

function startRinging() {
  if (_ring) return
  try {
    const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    let active = true

    const beep = () => {
      if (!active) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 440
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.5)
      setTimeout(() => { if (active) beep() }, 1500)
    }

    beep()
    _ring = { stop: () => { active = false; ctx.close().catch(() => {}) } }
  } catch (e) {
    log('ring error:', e)
  }
}

function stopRinging() {
  _ring?.stop()
  _ring = null
}

// ── High-quality media constraints ────────────────────────────────────────
async function getMedia(type: 'audio' | 'video'): Promise<MediaStream> {
  // Audio constraints — production quality
  const audioConstraints: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  }

  // Video constraints — 720p HD preferred, fallback to 480p
  const videoConstraints: MediaTrackConstraints | false = type === 'video'
    ? {
        width:     { ideal: 1280, min: 640 },
        height:    { ideal: 720,  min: 480 },
        frameRate: { ideal: 30,   min: 15  },
        facingMode: 'user',
      }
    : false

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
      video: videoConstraints,
    })
    stream.getTracks().forEach((t) => {
      t.enabled = true
      log(`track acquired: ${t.kind} | label: ${t.label} | enabled: ${t.enabled}`)
    })
    return stream
  } catch (err) {
    log('getUserMedia failed:', err)
    // Fallback: try with relaxed constraints
    if (type === 'video') {
      log('retrying with relaxed video constraints...')
      const fallback = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: true,
      })
      fallback.getTracks().forEach((t) => { t.enabled = true })
      return fallback
    }
    throw err
  }
}

// ── Apply SDP bandwidth limits for quality control ────────────────────────
function applyBandwidthToSdp(sdp: string, audioBps: number, videoBps: number): string {
  // Set audio bitrate
  sdp = sdp.replace(
    /a=mid:audio\r\n/g,
    `a=mid:audio\r\nb=AS:${Math.floor(audioBps / 1000)}\r\n`
  )
  // Set video bitrate
  sdp = sdp.replace(
    /a=mid:video\r\n/g,
    `a=mid:video\r\nb=AS:${Math.floor(videoBps / 1000)}\r\n`
  )
  return sdp
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
      pc.onsignalingstatechange = null
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
      old.onsignalingstatechange = null
      old.ontrack = null
      old.onicecandidate = null
      old.close()
      pcRef.current = null
    }
    remoteReady.current = false
    iceQueue.current = []

    const pc = new RTCPeerConnection(ICE_SERVERS)
    pcRef.current = pc

    // ── ontrack: accumulate tracks into a single stream ──────────────────
    // Using a Map to deduplicate tracks by kind — prevents partial stream overwrites
    const trackMap = new Map<string, MediaStreamTrack>()

    pc.ontrack = (e) => {
      log(`ontrack: kind=${e.track.kind} readyState=${e.track.readyState} streams=${e.streams.length}`)
      e.track.enabled = true

      // Update track map
      trackMap.set(e.track.kind, e.track)

      // Build a complete stream from all received tracks
      const stream = new MediaStream(Array.from(trackMap.values()))
      useCallStore.getState().setRemoteStream(stream)
      log(`remote stream updated: ${stream.getTracks().map(t => t.kind).join(', ')}`)
    }

    pc.onconnectionstatechange = () => {
      log('connectionState:', pc.connectionState)
      if (pc.connectionState === 'connected') {
        useCallStore.getState().setConnected()
      }
      if (pc.connectionState === 'failed') {
        log('connection failed — cleaning up')
        cleanup()
      }
      if (pc.connectionState === 'disconnected') {
        setTimeout(() => {
          if (pcRef.current?.connectionState === 'disconnected') {
            log('still disconnected after 5s — cleaning up')
            cleanup()
          }
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
      log('received answer from', payload.from)
      const pc = pcRef.current
      if (!pc) { log('no PC for answer'); return }
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

  // ── INITIATE CALL (caller) ─────────────────────────────────────────────
  async function initiateCall(
    remoteId: string,
    remoteUsername: string,
    remoteAvatar: string | null,
    convId: string,
    type: 'audio' | 'video',
  ) {
    log(`initiating ${type} call to ${remoteId}`)

    // 1. Get media FIRST
    const stream = await getMedia(type)
    useCallStore.getState().setLocalStream(stream)
    log('local stream ready:', stream.getTracks().map(t => `${t.kind}(${t.enabled})`))

    // 2. Join signaling channel
    const ch = await joinCallChannel(remoteId)

    // 3. Create PC and add ALL tracks before creating offer
    const pc = createPC()
    stream.getTracks().forEach((t) => {
      pc.addTrack(t, stream)
      log(`addTrack: ${t.kind}`)
    })

    // 4. Wire ICE sending
    pc.onicecandidate = (e) => {
      if (!e.candidate) return
      log('sending ICE candidate')
      ch.send({
        type: 'broadcast', event: 'call:ice',
        payload: { candidate: e.candidate.toJSON(), from: userIdRef.current },
      })
    }

    // 5. Create offer with explicit receive directions
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: type === 'video',
    })

    // Apply bandwidth limits for quality
    const sdpWithBw = applyBandwidthToSdp(
      offer.sdp ?? '',
      128_000,   // 128 kbps audio
      2_000_000, // 2 Mbps video
    )
    const finalOffer: RTCSessionDescriptionInit = { type: offer.type, sdp: sdpWithBw }

    await pc.setLocalDescription(finalOffer)
    log('offer created and set ✓')

    // 6. Ring receiver — embed offer SDP so they have it immediately on Accept
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
        offerSdp: finalOffer,
      },
    })
    supabase.removeChannel(ringCh)
    log('ring sent with embedded offer ✓')
  }

  // ── ANSWER CALL (callee) ───────────────────────────────────────────────
  async function answerCall(
    remoteId: string,
    convId: string,
    type: 'audio' | 'video',
  ) {
    log(`answerCall: remoteId=${remoteId} type=${type}`)
    answeringRef.current = true
    stopRinging()

    try {
      const pendingOffer = useCallStore.getState().pendingOffer
      if (!pendingOffer) throw new Error('No pending offer')
      log('pending offer found, sdp type:', pendingOffer.type)

      // 1. Get media FIRST — before creating PC
      const stream = await getMedia(type)
      useCallStore.getState().setLocalStream(stream)
      log('local stream ready:', stream.getTracks().map(t => `${t.kind}(${t.enabled})`))

      // 2. Join signaling channel
      const ch = await joinCallChannel(remoteId)
      log('call channel joined ✓')

      // 3. Create PC and add ALL tracks before setRemoteDescription
      const pc = createPC()
      stream.getTracks().forEach((t) => {
        pc.addTrack(t, stream)
        log(`addTrack: ${t.kind}`)
      })

      // 4. Wire ICE sending
      pc.onicecandidate = (e) => {
        if (!e.candidate) return
        log('sending ICE candidate')
        ch.send({
          type: 'broadcast', event: 'call:ice',
          payload: { candidate: e.candidate.toJSON(), from: userIdRef.current },
        })
      }

      // 5. setRemoteDescription FIRST (strict WebRTC order)
      log('setRemoteDescription(offer)...')
      await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer))
      remoteReady.current = true
      await drainIce(pc)
      log('remote description set ✓')

      // 6. createAnswer
      const answer = await pc.createAnswer()

      // Apply bandwidth limits
      const sdpWithBw = applyBandwidthToSdp(
        answer.sdp ?? '',
        128_000,
        2_000_000,
      )
      const finalAnswer: RTCSessionDescriptionInit = { type: answer.type, sdp: sdpWithBw }

      await pc.setLocalDescription(finalAnswer)
      log('answer created and set ✓')

      // 7. Send answer
      await ch.send({
        type: 'broadcast', event: 'call:answer',
        payload: { sdp: finalAnswer, from: userIdRef.current },
      })
      log('answer sent ✓')

      useCallStore.getState().clearPendingOffer()
      log('answerCall complete ✓')
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
      log(`incoming call from ${payload.from} | type: ${payload.callType} | offer: ${!!payload.offerSdp}`)

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

      startRinging()
    })

    ch.subscribe((status) => log('ring channel status:', status))
    return () => { supabase.removeChannel(ch) }
  }, [currentUserId])

  return { initiateCall, answerCall, hangUp, rejectCall }
}
