import { emitCallSignal, getSocketId, joinTripRoom, onCallSignal } from './socket';

/**
 * WebRTC groundwork: 1:1 / group real-time peer-to-peer channels.
 * Signaling rides the existing socket rooms (server only relays SDP + ICE,
 * see `call:offer|answer|ice|hangup` in server/index.cjs). Media/data never
 * touches the server afterwards.
 *
 * Default ICE = free Google STUN (no account, works on most home/mobile
 * networks). Symmetric NATs need TURN (not free) — add `turn:` entries to
 * ICE_SERVERS when that day comes; the rest of this file stays unchanged.
 *
 * Flow (both sides run the same code — fully symmetric, no caller/callee
 * roles in the UI layer):
 *   const call = joinCall(roomId, myUid, handlers); // joins room + listens
 *   call.sendData('ping');        // data channel (works today, no mic needed)
 *   call.startMedia(true);        // mic+camera, renegotiates with all peers
 *   call.hangup();                // leave + close peers
 */

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export type CallState = 'idle' | 'calling' | 'ringing' | 'live' | 'ended';

interface PeerHandlers {
  onState?: (s: CallState) => void;
  onDataMessage?: (text: string, fromSocket: string) => void;
  onRemoteStream?: (stream: MediaStream, fromSocket: string) => void;
  onPeerUp?: (peerSocketId: string) => void;
  onPeerDown?: (peerSocketId: string) => void;
}

export function joinCall(
  roomId: string,
  myUid: string | null,
  handlers: PeerHandlers = {},
  displayName = 'Friend'
) {
  const peers = new Map<string, RTCPeerConnection>();
  const dataChannels = new Map<string, RTCDataChannel>();
  let localStream: MediaStream | null = null;
  let live = true;
  let state: CallState = 'idle';
  const offs: (() => void)[] = [];
  const setState = (s: CallState) => {
    state = s;
    handlers.onState?.(s);
  };

  // Room must be joined for relayed signaling to reach us.
  // displayName keeps presence lists clean (never a placeholder).
  const leaveRoom = joinTripRoom(roomId, { uid: myUid, name: displayName }, {});

  const makePeer = (peerSocketId: string, initiator: boolean): RTCPeerConnection => {
    const existing = peers.get(peerSocketId);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peers.set(peerSocketId, pc);

    if (localStream) {
      for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
    }

    if (initiator) {
      const dc = pc.createDataChannel('chat');
      wireDataChannel(peerSocketId, dc);
    }
    pc.ondatachannel = (ev) => wireDataChannel(peerSocketId, ev.channel);

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        emitCallSignal('call:ice', {
          tripId: roomId,
          to: peerSocketId,
          from: myUid,
          candidate: ev.candidate.toJSON(),
        });
      }
    };
    pc.ontrack = (ev) => {
      const [stream] = ev.streams;
      if (stream) handlers.onRemoteStream?.(stream, peerSocketId);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        handlers.onPeerUp?.(peerSocketId);
        setState('live');
      }
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        peers.delete(peerSocketId);
        dataChannels.delete(peerSocketId);
        handlers.onPeerDown?.(peerSocketId);
        if (peers.size === 0 && live) setState('idle');
      }
    };
    return pc;
  };

  const wireDataChannel = (peerSocketId: string, dc: RTCDataChannel) => {
    dataChannels.set(peerSocketId, dc);
    dc.onmessage = (ev) => {
      try {
        handlers.onDataMessage?.(String(ev.data), peerSocketId);
      } catch { /* ignore malformed */ }
    };
  };

  const isForMe = (p: Record<string, unknown>): p is Record<string, unknown> & { fromSocket: string } => {
    const mine = getSocketId();
    return (
      typeof p?.fromSocket === 'string' &&
      p.fromSocket !== mine &&
      (!p.to || p.to === mine)
    );
  };

  // --- Inbound signaling -------------------------------------------------
  // Mesh formation: knock() broadcasts hello → every OTHER socket builds a
  // peer and offers back → offer/answer/ICE complete the mesh. No central
  // peer list needed (works for DMs and groups alike).
  offs.push(
    onCallSignal('call:hello', async (p) => {
      if (!isForMe(p) || !live) return;
      try {
        const pc = makePeer(p.fromSocket, true);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        emitCallSignal('call:offer', { tripId: roomId, to: p.fromSocket, from: myUid, sdp: offer });
      } catch { /* incompatible peer — ignore */ }
    })
  );
  offs.push(
    onCallSignal('call:offer', async (p) => {
      if (!isForMe(p) || !live) return;
      try {
        setState('ringing');
        const pc = makePeer(p.fromSocket, false);
        await pc.setRemoteDescription(new RTCSessionDescription(p.sdp as RTCSessionDescriptionInit));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        emitCallSignal('call:answer', { tripId: roomId, to: p.fromSocket, from: myUid, sdp: answer });
      } catch { /* incompatible peer — ignore */ }
    })
  );
  offs.push(
    onCallSignal('call:answer', async (p) => {
      if (!isForMe(p) || !live) return;
      try {
        const pc = peers.get(p.fromSocket);
        if (pc && pc.signalingState !== 'stable') {
          await pc.setRemoteDescription(new RTCSessionDescription(p.sdp as RTCSessionDescriptionInit));
        }
      } catch { /* late/duplicate answer — ignore */ }
    })
  );
  offs.push(
    onCallSignal('call:ice', async (p) => {
      if (!isForMe(p) || !live) return;
      try {
        const pc = peers.get(p.fromSocket);
        if (pc && p.candidate) await pc.addIceCandidate(new RTCIceCandidate(p.candidate as RTCIceCandidateInit));
      } catch { /* trickle race — ignore */ }
    })
  );
  offs.push(
    onCallSignal('call:hangup', (p) => {
      if (!isForMe(p)) return;
      const pc = peers.get(p.fromSocket as string);
      try {
        pc?.close();
      } catch { /* ignore */ }
      peers.delete(p.fromSocket as string);
      dataChannels.delete(p.fromSocket as string);
      handlers.onPeerDown?.(p.fromSocket as string);
      if (peers.size === 0 && live) setState('idle');
    })
  );

  return {
    get state() {
      return state;
    },
    /**
     * Knock: broadcast hello — every other socket builds a peer and offers
     * back, forming the mesh. Call once when the user taps "call".
     */
    async knock() {
      if (!live) return;
      setState('calling');
      emitCallSignal('call:hello', { tripId: roomId, from: myUid });
    },
    /** Broadcast a text ping to every connected peer (data channel). */
    sendData(text: string) {
      for (const dc of dataChannels.values()) {
        try {
          if (dc.readyState === 'open') dc.send(text);
        } catch { /* peer gone */ }
      }
    },
    /** Attach mic (+camera) and renegotiate with all peers. Call on tap
     *  (getUserMedia needs a user gesture). */
    async startMedia(video: boolean): Promise<MediaStream | null> {
      try {
        setState('calling');
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
        for (const [, pc] of peers) {
          for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
        }
        return localStream;
      } catch {
        setState('idle');
        return null;
      }
    },
    stopMedia() {
      try {
        localStream?.getTracks().forEach((t) => t.stop());
      } catch { /* ignore */ }
      localStream = null;
    },
    hangup() {
      live = false;
      emitCallSignal('call:hangup', { tripId: roomId, from: myUid });
      try {
        leaveRoom();
      } catch { /* ignore */ }
      offs.forEach((off) => {
        try {
          off();
        } catch { /* ignore */ }
      });
      for (const pc of peers.values()) {
        try {
          pc.close();
        } catch { /* ignore */ }
      }
      peers.clear();
      dataChannels.clear();
      setState('ended');
    },
  };
}

export type CallSession = ReturnType<typeof joinCall>;
