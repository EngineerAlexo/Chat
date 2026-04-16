'use client'

import { useEffect, useRef, useCallback } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useCallStore } from '@/lib/stores/useCallStore'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ─── STUN servers ─────────────────────────────────────────────────────────────
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
}

// ─── Shared call channel name (both peers join the same channel) ──────────────
// Format: call:<smaller-uid>:<larger-uid>  — deterministic, same for both peers
function callChannelName(a: string, b: string) {
  return `call:${[a, b].sort().join(':')}`
}

// ─── Personal notification channel (only this user listens) ──────────────────
function incomingChannelName(userId: string) {
  return `ring:${userId}`
}

export function useWebRTC(currentUserId: string) {
  const pcRef           = useRef<RTCPeerConnection | null>(null)
  const callChRef       = useRef<RealtimeChannel | null>(null)   // shared signaling channel
  const ringChRef       = useRef<RealtimeChannel | null>(null)   // personal incoming channel
  const iceCandidates   = useRef<RTCIceCandidateInit[]>([])      // queue before remote desc
  const remoteDescSet   = useRef(false)

  const {
    setLocalStream, setRemoteStream, setConnected, endCall,
  } = useCallStore()

  // ── Helpers ────────────────────────────────────────────────────────────────

  function log(...args: unknown[]) {
    console.log('[WebRTC]', ...args)
  }

  function createPC(): RTCPeerConnection {
    const pc = new RTCPeerConnection(ICE_SERVERS)
    pcRef.current = pc
    remoteDescSet.current = false
    iceCandidates.current = []

    pc.ontrack = (e) => {
      log('ontrack fired, streams:', e.streams.length)
      const stream = e.streams[0] ?? new MediaStream([e.track])
      setRemoteStream(stream)
    }

    pc.onconnectionstatechange = () => {
      log('connectionState:', pc.connectionState)
      if (pc.connectionState === 'connected') setConnected()
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        cleanup()
      }
    }

    pc.oniceconnectionstatechange = () => {
      log('iceConnectionState:', pc.iceConnectionState)
    }

    return pc
  }

  async function drainIceCandidates(pc: RTCPeerConnection) {
    log('draining', iceCandidates.current.length, 'queued ICE candidates')
    for (const c of iceCandidates.current) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)) } catch (e) { log('ICE add error', e) }
    }
    iceCandidates.current = []
  }

  function cleanup() {
    log('cleanup')
    const supabase = getSupabaseClient()
    pcRef.current?.close()
    pcRef.current = null
    remoteDescSet.current = false
    iceCandidates.current = []
    if (callChRef.current) { supabase.removeChannel(callChRef.current); callChRef.current = null }
    endCall()
  }

  // ── Subscribe to the shared call channel ──────────────────────────────────
  async function subscribeCallChannel(remoteId: string): Promise<RealtimeChannel> {
    const supabase = getSupabaseClient()
    const name = callChannelName(currentUserId, remoteId)
    log('subscribing to call channel:', name)

    if (callChRef.current) supabase.removeChannel(callChRef.current)

    const ch = supabase.channel(name, { config: { broadcast: { ack: true } } })
    callChRef.current = ch

    // ── answer handler (caller listens) ──────────────────────────────────────
    ch.on('broadcast', { event: 'call:answer' }, async ({ payload }) => {
      if (payload.from === currentUserId) return
      log('received answer from', payload.from)
      const pc = pcRef.current
      if (!pc) return
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
      remoteDescSet.current = true
      await drainIceCandidates(pc)
    })

    // ── offer handler (callee listens after accepting) ────────────────────────
    ch.on('broadcast', { event: 'call:offer' }, async ({ payload }) => {
      if (payload.from === currentUserId) return
      log('received offer from', payload.from)
      // Store offer in store for answerCall to use
      useCallStore.getState().setPendingOffer(payload.sdp)
    })

    // ── ICE candidates ────────────────────────────────────────────────────────
    ch.on('broadcast', { event: 'call:ice' }, async ({ payload }) => {
      if (payload.from === currentUserId) return
      const pc = pcRef.current
      if (!pc) return
      if (remoteDescSet.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)) } catch {}
      } else {
        iceCandidates.current.push(payload.candidate)
      }
    })

    // ── end / reject ──────────────────────────────────────────────────────────
    ch.on('broadcast', { event: 'call:end' }, ({ payload }) => {
      if (payload.from === currentUserId) return
      log('call ended by remote')
      cleanup()
    })

    ch.on('broadcast', { event: 'call:reject' }, ({ payload }) => {
      if (payload.from === currentUserId) return
      log('call rejected by remote')
      cleanup()
    })

    await new Promise<void>((resolve) => {
      ch.subscribe((status) => {
        log('call channel status:', status)
        if (status === 'SUBSCRIBED') resolve()
      })
    })

    return ch
  }

  // ── INITIATE CALL (caller side) ────────────────────────────────────────────
  const initiateCall = useCallback(async (
    remoteId: string,
    remoteUsername: string,
    remoteAvatar: string | null,
    convId: string,
    type: 'audio' | 'video',
  ) => {
    log('initiating', type, 'call to', remoteId)

    // 1. Get media first
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video',
    })
    setLocalStream(stream)

    // 2. Subscribe to shared call channel
    const ch = await subscribeCallChannel(remoteId)

    // 3. Create peer connection and add tracks
    const pc = createPC()
    stream.getTracks().forEach((t) => pc.addTrack(t, stream))

    // 4. Wire ICE candidate sending
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        log('sending ICE candidate')
        ch.send({
          type: 'broadcast', event: 'call:ice',
          payload: { candidate: e.candidate.toJSON(), from: currentUserId },
        })
      }
    }

    // 5. Send ring notification to receiver's personal channel FIRST
    const supabase = getSupabaseClient()
    const ringCh = supabase.channel(incomingChannelName(remoteId))
    await new Promise<void>((resolve) => {
      ringCh.subscribe((status) => { if (status === 'SUBSCRIBED') resolve() })
    })

    log('sending call:incoming to', remoteId)
    await ringCh.send({
      type: 'broadcast', event: 'call:incoming',
      payload: {
        from: currentUserId,
        callType: type,
        conversationId: convId,
        remoteUsername: useCallStore.getState().currentUserName ?? currentUserId,
        remoteAvatar: useCallStore.getState().currentUserAvatar ?? null,
      },
    })
    supabase.removeChannel(ringCh)

    // 6. Create and send offer
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    log('sending offer')

    await ch.send({
      type: 'broadcast', event: 'call:offer',
      payload: { sdp: offer, from: currentUserId, callType: type, conversationId: convId },
    })
  }, [currentUserId, setLocalStream]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── ANSWER CALL (callee side) ──────────────────────────────────────────────
  const answerCall = useCallback(async (
    remoteId: string,
    convId: string,
    type: 'audio' | 'video',
  ) => {
    log('answering call from', remoteId)

    const pendingOffer = useCallStore.getState().pendingOffer
    if (!pendingOffer) { log('no pending offer!'); return }

    // 1. Get media
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video',
    })
    setLocalStream(stream)

    // 2. Subscribe to shared call channel
    const ch = await subscribeCallChannel(remoteId)

    // 3. Create peer connection and add tracks
    const pc = createPC()
    stream.getTracks().forEach((t) => pc.addTrack(t, stream))

    // 4. Wire ICE candidate sending
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        log('sending ICE candidate')
        ch.send({
          type: 'broadcast', event: 'call:ice',
          payload: { candidate: e.candidate.toJSON(), from: currentUserId },
        })
      }
    }

    // 5. Set remote description (the offer)
    await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer))
    remoteDescSet.current = true
    await drainIceCandidates(pc)

    // 6. Create and send answer
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    log('sending answer')

    await ch.send({
      type: 'broadcast', event: 'call:answer',
      payload: { sdp: answer, from: currentUserId },
    })

    useCallStore.getState().clearPendingOffer()
  }, [currentUserId, setLocalStream]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── HANG UP ────────────────────────────────────────────────────────────────
  const hangUp = useCallback(() => {
    log('hanging up')
    const { remoteUserId } = useCallStore.getState()
    if (callChRef.current && remoteUserId) {
      callChRef.current.send({
        type: 'broadcast', event: 'call:end',
        payload: { from: currentUserId },
      })
    }
    cleanup()
  }, [currentUserId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── REJECT (callee declines) ───────────────────────────────────────────────
  const rejectCall = useCallback(async (remoteId: string) => {
    log('rejecting call from', remoteId)
    const supabase = getSupabaseClient()
    const name = callChannelName(currentUserId, remoteId)
    const ch = supabase.channel(name)
    await new Promise<void>((r) => ch.subscribe((s) => { if (s === 'SUBSCRIBED') r() }))
    await ch.send({
      type: 'broadcast', event: 'call:reject',
      payload: { from: currentUserId },
    })
    supabase.removeChannel(ch)
    useCallStore.getState().endCall()
  }, [currentUserId])

  // ── LISTEN FOR INCOMING CALLS (always active) ─────────────────────────────
  useEffect(() => {
    if (!currentUserId) return
    const supabase = getSupabaseClient()
    const name = incomingChannelName(currentUserId)
    log('listening for incoming calls on', name)

    const ch = supabase.channel(name)
    ringChRef.current = ch

    ch.on('broadcast', { event: 'call:incoming' }, ({ payload }) => {
      if (payload.from === currentUserId) return
      log('incoming call from', payload.from, 'type:', payload.callType)

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
      ringChRef.current = null
    }
  }, [currentUserId])

  return { initiateCall, answerCall, hangUp, rejectCall }
}
