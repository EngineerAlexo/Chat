'use client'

import { useEffect, useRef } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useCallStore } from '@/lib/stores/useCallStore'
import type { RealtimeChannel } from '@supabase/supabase-js'

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
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

export function useWebRTC(currentUserId: string) {
  const pcRef       = useRef<RTCPeerConnection | null>(null)
  const callChRef   = useRef<RealtimeChannel | null>(null)
  const iceQueue    = useRef<RTCIceCandidateInit[]>([])
  const remoteReady = useRef(false)
  const userIdRef   = useRef(currentUserId)
  // Guard: true while answerCall is in progress — blocks cleanup from firing
  const answeringRef = useRef(false)
  userIdRef.current  = currentUserId

  // ── cleanup — ONLY called on explicit hangup / remote end / irrecoverable fail
  function cleanup() {
    // Never run cleanup while we are in the middle of answering
    if (answeringRef.current) {
      log('cleanup suppressed — answer in progress')
      return
    }
    log('cleanup')
    const supabase = getSupabaseClient()

    // Close PC without triggering onconnectionstatechange → cleanup loop
    const pc = pcRef.current
    if (pc) {
      pc.onconnectionstatechange = null   // detach handler BEFORE closing
      pc.oniceconnectionstatechange = null
      pc.ontrack = null
      pc.onicecandidate = null
      pc.close()
      pcRef.current = null
    }

    remoteReady.current = false
    iceQueue.current = []

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
      catch (e) { log('ICE drain error', e) }
    }
  }

  // ── create a fresh RTCPeerConnection ──────────────────────────────────────
  // IMPORTANT: detach handlers on old PC before closing to prevent
  // the 'closed' state change from triggering cleanup()
  function createPC(): RTCPeerConnection {
    if (pcRef.current) {
      log('closing old PC')
      const old = pcRef.current
      old.onconnectionstatechange = null   // ← detach FIRST
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
      log('ontrack — kind:', e.track.kind, 'streams:', e.streams.length)
      const stream = e.streams[0] ?? new MediaStream([e.track])
      useCallStore.getState().setRemoteStream(stream)
    }

    pc.onconnectionstatechange = () => {
      log('connectionState:', pc.connectionState)
      if (pc.connectionState === 'connected') {
        useCallStore.getState().setConnected()
      }
      // Only clean up on hard failures — NOT on 'closed' (we close it ourselves)
      if (pc.connectionState === 'failed') {
        log('connection failed — cleaning up')
        cleanup()
      }
      // 'disconnected' can be transient — wait before giving up
      if (pc.connectionState === 'disconnected') {
        log('connection disconnected — waiting 5s before cleanup')
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

    return pc
  }

  // ── join the shared call channel ──────────────────────────────────────────
  async function joinCallChannel(remoteId: string): Promise<RealtimeChannel> {
    const supabase = getSupabaseClient()
    const name = callChannelName(userIdRef.current, remoteId)
    log('joining call channel:', name)

    // Remove stale channel only if it's a different channel name
    if (callChRef.current) {
      supabase.removeChannel(callChRef.current)
      callChRef.current = null
    }

    const ch = supabase.channel(name, { config: { broadcast: { ack: true } } })
    callChRef.current = ch

    // ── answer (caller receives this) ─────────────────────────────────────
    ch.on('broadcast', { event: 'call:answer' }, async ({ payload }) => {
      if (payload.from === userIdRef.current) return
      log('received answer from', payload.from)
      const pc = pcRef.current
      if (!pc) { log('no PC for answer — ignoring'); return }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
        remoteReady.current = true
        await drainIce(pc)
        log('answer applied ✓')
      } catch (e) { log('setRemoteDescription(answer) error:', e) }
    })

    // ── ICE candidates ────────────────────────────────────────────────────
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

    // ── remote ended call ─────────────────────────────────────────────────
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

  // ── INITIATE CALL (caller) ─────────────────────────────────────────────────
  async function initiateCall(
    remoteId: string,
    remoteUsername: string,
    remoteAvatar: string | null,
    convId: string,
    type: 'audio' | 'video',
  ) {
    log('initiating', type, 'call to', remoteId)

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video',
    })
    useCallStore.getState().setLocalStream(stream)
    log('local stream ready, tracks:', stream.getTracks().map(t => t.kind))

    // Join channel FIRST so we receive the answer
    const ch = await joinCallChannel(remoteId)

    // Create PC and add tracks BEFORE creating offer
    const pc = createPC()
    stream.getTracks().forEach((t) => pc.addTrack(t, stream))

    pc.onicecandidate = (e) => {
      if (!e.candidate) return
      ch.send({
        type: 'broadcast', event: 'call:ice',
        payload: { candidate: e.candidate.toJSON(), from: userIdRef.current },
      })
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    log('offer created ✓')

    // Ring receiver — embed offer SDP in the ring payload
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
        offerSdp: offer,   // ← receiver stores this, uses it on Accept
      },
    })
    supabase.removeChannel(ringCh)
    log('ring sent with embedded offer ✓')
  }

  // ── ANSWER CALL (callee) ───────────────────────────────────────────────────
  async function answerCall(
    remoteId: string,
    convId: string,
    type: 'audio' | 'video',
  ) {
    log('answerCall start — remoteId:', remoteId, 'type:', type)

    // Guard: prevent cleanup() from firing during this async flow
    answeringRef.current = true

    try {
      const pendingOffer = useCallStore.getState().pendingOffer
      if (!pendingOffer) {
        log('ERROR: no pending offer!')
        throw new Error('No pending offer')
      }
      log('pending offer found, sdp type:', pendingOffer.type)

      // Get media
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video',
      })
      useCallStore.getState().setLocalStream(stream)
      log('local stream ready, tracks:', stream.getTracks().map(t => t.kind))

      // Join call channel so caller receives our answer + ICE
      const ch = await joinCallChannel(remoteId)
      log('call channel joined ✓')

      // Create PC and add tracks BEFORE setRemoteDescription
      const pc = createPC()
      stream.getTracks().forEach((t) => pc.addTrack(t, stream))
      log('tracks added to PC ✓')

      // Wire ICE sending
      pc.onicecandidate = (e) => {
        if (!e.candidate) return
        log('sending ICE candidate')
        ch.send({
          type: 'broadcast', event: 'call:ice',
          payload: { candidate: e.candidate.toJSON(), from: userIdRef.current },
        })
      }

      // setRemoteDescription FIRST, then createAnswer
      log('setRemoteDescription(offer)...')
      await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer))
      remoteReady.current = true
      await drainIce(pc)
      log('remote description set ✓')

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      log('answer created and set ✓')

      await ch.send({
        type: 'broadcast', event: 'call:answer',
        payload: { sdp: answer, from: userIdRef.current },
      })
      log('answer sent ✓')

      useCallStore.getState().clearPendingOffer()
      log('answerCall complete ✓')
    } finally {
      // Always release the guard, even if something threw
      answeringRef.current = false
    }
  }

  // ── HANG UP ────────────────────────────────────────────────────────────────
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

  // ── REJECT ─────────────────────────────────────────────────────────────────
  async function rejectCall(remoteId: string) {
    log('rejectCall — remoteId:', remoteId)
    const supabase = getSupabaseClient()
    const name = callChannelName(userIdRef.current, remoteId)
    const ch = supabase.channel(name)
    await new Promise<void>((r) => ch.subscribe((s) => { if (s === 'SUBSCRIBED') r() }))
    await ch.send({
      type: 'broadcast', event: 'call:reject',
      payload: { from: userIdRef.current },
    })
    supabase.removeChannel(ch)
    useCallStore.getState().endCall()
  }

  // ── LISTEN FOR INCOMING CALLS ─────────────────────────────────────────────
  useEffect(() => {
    if (!currentUserId) return
    const supabase = getSupabaseClient()
    const name = ringChannelName(currentUserId)
    log('listening on ring channel:', name)

    const ch = supabase.channel(name)

    ch.on('broadcast', { event: 'call:incoming' }, ({ payload }) => {
      if (payload.from === currentUserId) return
      log('incoming call from', payload.from, '| type:', payload.callType, '| offer present:', !!payload.offerSdp)

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
    })

    ch.subscribe((status) => log('ring channel status:', status))

    return () => { supabase.removeChannel(ch) }
  }, [currentUserId])

  return { initiateCall, answerCall, hangUp, rejectCall }
}
