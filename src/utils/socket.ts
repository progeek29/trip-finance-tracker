import { io, type Socket } from 'socket.io-client';
import type { ChatMessage } from '../types';

function socketHost(): string {
  try {
    // Production override (Vercel): VITE_SOCKET_URL=https://<backend>
    const env = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SOCKET_URL;
    if (env) return env.replace(/\/$/, '');
  } catch { /* ignore */ }
  try {
    const h = typeof window !== 'undefined' ? window.location.hostname : '';
    if (h && h !== 'localhost' && h !== '127.0.0.1') return `http://${h}:3001`;
  } catch { /* SSR */ }
  return 'http://localhost:3001';
}

const SOCKET_URL = socketHost();

let socket: Socket | null = null;
let refCount = 0;
/** Rooms the app believes it is in — re-joined automatically on reconnect
 *  (server restarts wipe rooms; without this ALL realtime silently dies). */
const joinedRooms = new Map<string, { me: { uid?: string | null; name?: string }; count: number }>();

export interface TypingPayload {
  tripId: string;
  uid?: string;
  name?: string;
  typing: boolean;
}

export interface PresencePayload {
  tripId: string;
  online: { uid: string; name: string }[];
  count: number;
}

function ensureSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
    });
    socket.on('connect', () => {
      // Small delay: immediate room:join inside 'connect' never takes effect
      // (verified by probe) — 400ms later it lands reliably.
      window.setTimeout(() => {
        if (!socket?.connected) return;
        for (const [tripId, entry] of joinedRooms) {
          socket?.emit('room:join', { tripId, uid: entry.me.uid || undefined, name: entry.me.name || 'Friend' });
        }
      }, 400);
    });
  }
  if (!socket.connected) socket.connect();
  return socket;
}

/**
 * Join a trip room. Returns a leave function.
 * Socket is shared app-wide; underlying connection closes when nobody listens.
 */
export function joinTripRoom(
  tripId: string,
  me: { uid?: string | null; name?: string },
  handlers: {
    onMessage?: (msg: ChatMessage) => void;
    onTyping?: (t: TypingPayload) => void;
    onPresence?: (p: PresencePayload) => void;
    onRead?: (r: { tripId: string; messageId: string; count: number }) => void;
    onPin?: (p: { id: string; tripId: string; pinned: boolean }) => void;
    onDelete?: (d: { tripId: string; messageId: string }) => void;
    onBellRing?: (b: { tripId: string; uid?: string; name?: string }) => void;
    onVoiceBurst?: (v: { tripId: string; voiceUrl: string; senderId?: string; senderName?: string }) => void;
  }
): () => void {
  const s = ensureSocket();
  refCount += 1;
  const prev = joinedRooms.get(tripId);
  joinedRooms.set(tripId, { me, count: (prev?.count || 0) + 1 });
  s.emit('room:join', { tripId, uid: me.uid || undefined, name: me.name || 'Friend' });

  const msgFn = handlers.onMessage ? (m: ChatMessage) => handlers.onMessage!(m) : undefined;
  const typeFn = handlers.onTyping ? (t: TypingPayload) => handlers.onTyping!(t) : undefined;
  const presFn = handlers.onPresence ? (p: PresencePayload) => handlers.onPresence!(p) : undefined;
  const readFn = handlers.onRead ? (r: { tripId: string; messageId: string; count: number }) => handlers.onRead!(r) : undefined;
  const pinFn = handlers.onPin ? (p: { id: string; tripId: string; pinned: boolean }) => handlers.onPin!(p) : undefined;
  const delFn = handlers.onDelete ? (d: { tripId: string; messageId: string }) => handlers.onDelete!(d) : undefined;
  const bellFn = handlers.onBellRing ? (b: { tripId: string; uid?: string; name?: string }) => handlers.onBellRing!(b) : undefined;
  const voiceFn = handlers.onVoiceBurst ? (v: { tripId: string; voiceUrl: string; senderId?: string; senderName?: string }) => handlers.onVoiceBurst!(v) : undefined;

  if (msgFn) s.on('chat:new', msgFn);
  if (typeFn) s.on('chat:typing', typeFn);
  if (presFn) s.on('presence:online', presFn);
  if (readFn) s.on('chat:read', readFn);
  if (pinFn) s.on('chat:pin', pinFn);
  if (delFn) s.on('chat:delete', delFn);
  if (bellFn) s.on('bell:ring', bellFn);
  if (voiceFn) s.on('voice:burst', voiceFn);

  let left = false;
  return () => {
    if (left) return;
    left = true;
    if (msgFn) s.off('chat:new', msgFn);
    if (typeFn) s.off('chat:typing', typeFn);
    if (presFn) s.off('presence:online', presFn);
    if (readFn) s.off('chat:read', readFn);
    if (pinFn) s.off('chat:pin', pinFn);
    if (delFn) s.off('chat:delete', delFn);
    if (bellFn) s.off('bell:ring', bellFn);
    if (voiceFn) s.off('voice:burst', voiceFn);
    s.emit('room:leave', { tripId });
    refCount = Math.max(0, refCount - 1);
    const entry = joinedRooms.get(tripId);
    if (entry) {
      if (entry.count <= 1) joinedRooms.delete(tripId);
      else joinedRooms.set(tripId, { me: entry.me, count: entry.count - 1 });
    }
    if (refCount === 0) {
      window.setTimeout(() => {
        if (refCount === 0 && socket) {
          socket.disconnect();
          socket = null;
        }
      }, 5000);
    }
  };
}

export function sendTyping(tripId: string, me: { uid?: string | null; name?: string }, typing: boolean): void {
  try {
    ensureSocket().emit('chat:typing', { tripId, uid: me.uid || undefined, name: me.name, typing });
  } catch { /* offline */ }
}

/** Send via socket (server persists + broadcasts). Resolves with saved row. */
export function sendChatViaSocket(msg: {
  id: string;
  tripId: string;
  type: string;
  text?: string;
  lat?: number | null;
  lng?: number | null;
  replyTo?: { id: string; senderName: string; text: string };
  mentions?: { id: string; name: string }[];
  senderId?: string;
  senderName?: string;
}): Promise<ChatMessage> {
  return new Promise((resolve, reject) => {
    try {
      ensureSocket().emit('chat:send', msg, (res: { ok?: boolean; message?: ChatMessage; error?: string }) => {
        if (res?.ok) resolve(res.message as ChatMessage);
        else reject(new Error(res?.error || 'send failed'));
      });
      window.setTimeout(() => reject(new Error('send timeout')), 12000);
    } catch (e) {
      reject(e instanceof Error ? e : new Error('send failed'));
    }
  });
}

/** Soft bell ping — ephemeral, no DB row, no timeline log. */
export function emitBellRing(tripId: string, me: { uid?: string | null; name?: string }): void {
  try {
    ensureSocket().emit('bell:ring', { tripId, uid: me.uid || undefined, name: me.name || 'Someone' });
  } catch { /* offline */ }
}

/** Walkie-talkie burst — audio rides the socket live, nothing stored. */
export function emitVoiceBurst(
  tripId: string,
  payload: { voiceUrl: string; senderId?: string; senderName?: string; clipId?: string; apiBase?: string }
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      ensureSocket().emit('voice:burst', { tripId, ...payload }, (res: { ok?: boolean; error?: string }) => {
        if (res?.ok) resolve();
        else reject(new Error(res?.error || 'voice send failed'));
      });
      window.setTimeout(() => reject(new Error('voice send timeout')), 15000);
    } catch (e) {
      reject(e instanceof Error ? e : new Error('voice send failed'));
    }
  });
}

export function sendReadReceipt(tripId: string, messageId: string, uid: string): void {
  try {
    ensureSocket().emit('chat:read', { tripId, messageId, uid });
  } catch { /* offline */ }
}

/** Pin/unpin (server unpins others first). Resolves when broadcast done. */
export function pinChatMessage(tripId: string, messageId: string, pinned: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      ensureSocket().emit('chat:pin', { tripId, messageId, pinned }, (res: { ok?: boolean; error?: string }) => {
        if (res?.ok) resolve();
        else reject(new Error(res?.error || 'pin failed'));
      });
      window.setTimeout(() => reject(new Error('pin timeout')), 10000);
    } catch (e) {
      reject(e instanceof Error ? e : new Error('pin failed'));
    }
  });
}

/** Delete own message everywhere (tombstone + broadcast). */
export function deleteChatMessage(tripId: string, messageId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      ensureSocket().emit('chat:delete', { tripId, messageId }, (res: { ok?: boolean; error?: string }) => {
        if (res?.ok) resolve();
        else reject(new Error(res?.error || 'delete failed'));
      });
      window.setTimeout(() => reject(new Error('delete timeout')), 10000);
    } catch (e) {
      reject(e instanceof Error ? e : new Error('delete failed'));
    }
  });
}
