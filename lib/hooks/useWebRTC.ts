'use client'

import { useEffect, useRef, useCallback } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useCallStore } from '@/lib/stores/useCallStore'
import type { RealtimeChannel } from '@supabase/supabase-js'

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

export function useWebRTC(currentUserId: string) {
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const { setLocalStream, setRemoteStream, setConnected, endCall, callType, remoteUserId, conversationId } = useCallStore()

  const getSignalingChannel = useCallback((convId: string) => {
    const supabase = getSupabaseClient()
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    const ch = supabase.channel(`call:${convId}`)
    channelRef.current = ch
    return ch
  }, [])

  const createPC = useCallback(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS)
    pcRef.current = pc

    pc.ontrack = (e) => {
      const [stream] = e.streams
      if (stream) setRemoteStream(stream)
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setConnected()
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) endCall()
    }

    return pc
  }, [setRemoteStream, setConnected, endCall])

  // Initiate a call
  const initiateCall = useCallback(async (convId: string, type: 'audio' | 'video') => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video',
    })
    setLocalStream(stream)

    const pc = createPC()
    stream.getTracks().forEach((t) => pc.addTrack(t, stream))

    const ch = getSignalingChannel(convId)

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        ch.send({ type: 'broadcast', event: 'ice', payload: { candidate: e.candidate, from: currentUserId } })
      }
    }

    ch.on('broadcast', { event: 'answer' }, async ({ payload }) => {
      if (payload.from === currentUserId) return
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
    })

    ch.on('broadcast', { event: 'ice' }, async ({ payload }) => {
      if (payload.from === currentUserId) return
      try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)) } catch {}
    })

    ch.on('broadcast', { event: 'end' }, () => { cleanup() })

    await ch.subscribe()

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    ch.send({
      type: 'broadcast',
      event: 'offer',
      payload: { sdp: offer, from: currentUserId, callType: type },
    })
  }, [currentUserId, createPC, getSignalingChannel, setLocalStream])

  // Answer an incoming call
  const answerCall = useCallback(async (convId: string, offerSdp: RTCSessionDescriptionInit, type: 'audio' | 'video') => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video',
    })
    setLocalStream(stream)

    const pc = createPC()
    stream.getTracks().forEach((t) => pc.addTrack(t, stream))

    const ch = getSignalingChannel(convId)

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        ch.send({ type: 'broadcast', event: 'ice', payload: { candidate: e.candidate, from: currentUserId } })
      }
    }

    ch.on('broadcast', { event: 'ice' }, async ({ payload }) => {
      if (payload.from === currentUserId) return
      try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)) } catch {}
    })

    ch.on('broadcast', { event: 'end' }, () => { cleanup() })

    await ch.subscribe()

    await pc.setRemoteDescription(new RTCSessionDescription(offerSdp))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    ch.send({
      type: 'broadcast',
      event: 'answer',
      payload: { sdp: answer, from: currentUserId },
    })
  }, [currentUserId, createPC, getSignalingChannel, setLocalStream])

  const hangUp = useCallback(() => {
    if (channelRef.current && conversationId) {
      channelRef.current.send({ type: 'broadcast', event: 'end', payload: { from: currentUserId } })
    }
    cleanup()
  }, [currentUserId, conversationId])

  function cleanup() {
    pcRef.current?.close()
    pcRef.current = null
    const supabase = getSupabaseClient()
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    endCall()
  }

  // Listen for incoming calls globally
  useEffect(() => {
    if (!currentUserId) return
    const supabase = getSupabaseClient()
    // We listen on all conversations the user is in via a global channel
    // The offer event carries the conversationId
    const globalCh = supabase.channel(`incoming:${currentUserId}`)

    globalCh.on('broadcast', { event: 'offer' }, ({ payload }) => {
      if (payload.from === currentUserId) return
      // Store offer for answering
      ;(window as Window & { __pendingOffer?: RTCSessionDescriptionInit }).__pendingOffer = payload.sdp
      useCallStore.getState().receiveCall({
        callType: payload.callType,
        remoteUserId: payload.from,
        remoteUsername: payload.username ?? 'Unknown',
        remoteAvatar: payload.avatar ?? null,
        conversationId: payload.conversationId,
      })
    })

    globalCh.subscribe()
    return () => { supabase.removeChannel(globalCh) }
  }, [currentUserId])

  return { initiateCall, answerCall, hangUp }
}
