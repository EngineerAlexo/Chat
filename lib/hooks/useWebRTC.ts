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
  // All mutable state in refs — never stale in callbacks
  const pcRef         = useRef<RTCPeerConnection | null>(null)
  const callChRef     = useRef<RealtimeChannel | null>(null)
  const iceQueue      = useRef<RTCIceCandidateInit[]>([])
  const remoteReady   = useRef(false)   // true after setRemoteDescription
  const userIdRef     = useRef(currentUserId)
  userIdRef.current   = currentUserId

  // ── cleanup ────────────────────────────────────────────────────────────────
  function cleanup() {
    log('cleanup')
    pcRef.current?.close()
    pcRef.current = null
    remoteReady.current = false
    iceQueue.current = []
    const supabase = getSupabaseClient()
    if (callChRef.current) {
      supabase.removeChannel(callChRef.current)
      callChRef.current = null
    }
    useCallStore.getState().endCall()
  }

  // ── drain queued ICE candidates ────────────────────────────────────────────
  async function drainIce(pc: RTCPeerConnection) {
    log('draining', iceQueue.current.length, 'queued ICE candidates')
    const queue = [...iceQueue.current]
    iceQueue.current = []
    for (const c of queue) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)) }
      catch (e) { log('ICE drain error', e) }
    }
  }

  // ── create RTCPeerConnection ───────────────────────────────────────────────
  function createPC(): RTCPeerConnection {
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    remoteReady.current = false
    iceQueue.current = []

    const pc = new RTCPeerConnection(ICE_SERVERS)
    pcRef.current = pc

    pc.ontrack = (e) => {
      log('ontrack — streams:', e.streams.length, 'track kind:', e.track.kind)
      const stream = e.streams[0] ?? new MediaStream([e.track])
      useCallStore.getState().setRemoteStream(stream)
    }

    pc.onconnectionstatechange = () => {
      log('connectionState:', pc.connectionState)
      if (pc.connectionState === 'connected') {
        useCallStore.getState().setConnected()
      }
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        cleanup()
      }
    }

    pc.oniceconnectionstatechange = () => {
      log('iceConnectionState:', pc.iceConnectionState)
    }

    return pc
  }

  // ── subscribe to shared call channel ──────────────────────────────────────
  // Returns when SUBSCRIBED. Registers answer + ICE + end handlers.
  async function joinCallChannel(remoteId: string): Promise<RealtimeChannel> {
    const supabase = getSupabaseClient()
    const name = callChannelName(userIdRef.current, remoteId)
    log('joining call channel:', name)

    // Remove any existing channel first
    if (callChRef.current) {
      supabase.removeChannel(callChRef.current)
      callChRef.current = null
    }

    const ch = supabase.channel(name, { config: { broadcast: { ack: true } } })
    callChRef.current = ch

    // Caller receives answer here
    ch.on('broadcast', { event: 'call:answer' }, async ({ payload }) => {
      if (payload.from === userIdRef.current) return
      log('received answer')
      const pc = pcRef.current
      if (!pc) { log('no PC for answer'); return }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
        remoteReady.current = true
        await drainIce(pc)
        log('answer applied, ICE drained')
      } catch (e) { log('setRemoteDescription(answer) error', e) }
    })

    // Both sides receive ICE candidates
    ch.on('broadcast', { event: 'call:ice' }, async ({ payload }) => {
      if (payload.from === userIdRef.current) return
      const pc = pcRef.current
      if (!pc) return
      if (remoteReady.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)) }
        catch (e) { log('addIceCandidate error', e) }
      } else {
        log('queuing ICE candidate')
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

    // Wait for subscription to be confirmed
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

    // 1. Get local media
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video',
    })
    useCallStore.getState().setLocalStream(stream)
    log('got local stream, tracks:', stream.getTracks().map(t => t.kind))

    // 2. Join shared call channel (so we receive the answer)
    const ch = await joinCallChannel(remoteId)

    // 3. Create PC and add tracks BEFORE creating offer
    const pc = createPC()
    stream.getTracks().forEach((t) => pc.addTrack(t, stream))
    log('tracks added to PC')

    // 4. Wire ICE sending
    pc.onicecandidate = (e) => {
      if (!e.candidate) return
      log('sending ICE candidate')
      ch.send({
        type: 'broadcast', event: 'call:ice',
        payload: { candidate: e.candidate.toJSON(), from: userIdRef.current },
      })
    }

    // 5. Create offer
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    log('offer created and set as local description')

    // 6. Ring the receiver — send incoming notification + offer SDP together
    const supabase = getSupabaseClient()
    const ringCh = supabase.channel(ringChannelName(remoteId))
    await new Promise<void>((resolve) => {
      ringCh.subscribe((s) => { if (s === 'SUBSCRIBED') resolve() })
    })

    const myName   = useCallStore.getState().currentUserName ?? userIdRef.current
    const myAvatar = useCallStore.getState().currentUserAvatar ?? null

    log('sending call:incoming to', remoteId)
    await ringCh.send({
      type: 'broadcast', event: 'call:incoming',
      payload: {
        from: userIdRef.current,
        callType: type,
        conversationId: convId,
        remoteUsername: myName,
        remoteAvatar: myAvatar,
        // Include offer SDP so receiver has it immediately when they accept
        offerSdp: offer,
      },
    })
    supabase.removeChannel(ringCh)
    log('ring sent, offer included in payload')
  }

  // ── ANSWER CALL (callee) ───────────────────────────────────────────────────
  async function answerCall(
    remoteId: string,
    convId: string,
    type: 'audio' | 'video',
  ) {
    log('answering call from', remoteId)

    // Get the pending offer — must exist
    const pendingOffer = useCallStore.getState().pendingOffer
    if (!pendingOffer) {
      log('ERROR: no pending offer in store!')
      throw new Error('No pending offer')
    }
    log('pending offer found, type:', pendingOffer.type)

    // 1. Get local media
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video',
    })
    useCallStore.getState().setLocalStream(stream)
    log('got local stream, tracks:', stream.getTracks().map(t => t.kind))

    // 2. Join shared call channel (so caller receives our answer)
    const ch = await joinCallChannel(remoteId)

    // 3. Create PC and add tracks BEFORE setRemoteDescription
    const pc = createPC()
    stream.getTracks().forEach((t) => pc.addTrack(t, stream))
    log('tracks added to PC')

    // 4. Wire ICE sending
    pc.onicecandidate = (e) => {
      if (!e.candidate) return
      log('sending ICE candidate')
      ch.send({
        type: 'broadcast', event: 'call:ice',
        payload: { candidate: e.candidate.toJSON(), from: userIdRef.current },
      })
    }

    // 5. Apply offer → create answer → send answer
    log('setting remote description (offer)')
    await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer))
    remoteReady.current = true
    await drainIce(pc)
    log('remote description set, ICE drained')

    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    log('answer created and set as local description')

    await ch.send({
      type: 'broadcast', event: 'call:answer',
      payload: { sdp: answer, from: userIdRef.current },
    })
    log('answer sent')

    useCallStore.getState().clearPendingOffer()
  }

  // ── HANG UP ────────────────────────────────────────────────────────────────
  function hangUp() {
    log('hanging up')
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
    log('rejecting call from', remoteId)
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

  // ── LISTEN FOR INCOMING CALLS (always active while logged in) ─────────────
  useEffect(() => {
    if (!currentUserId) return
    const supabase = getSupabaseClient()
    const name = ringChannelName(currentUserId)
    log('listening for incoming calls on channel:', name)

    const ch = supabase.channel(name)

    ch.on('broadcast', { event: 'call:incoming' }, ({ payload }) => {
      if (payload.from === currentUserId) return
      log('incoming call from', payload.from, 'type:', payload.callType)
      log('offer included in payload:', !!payload.offerSdp)

      // Store the offer immediately — available when user clicks Accept
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

    return () => {
      supabase.removeChannel(ch)
    }
  }, [currentUserId])

  return { initiateCall, answerCall, hangUp, rejectCall }
}
