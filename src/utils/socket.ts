import { io, type Socket } from 'socket.io-client';
import type { ChatMessage } from '../types';

const SOCKET_URL = 'http://localhost:3001';

let socket: Socket | null = null;
let refCount = 0;

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
  }
): () => void {
  const s = ensureSocket();
  refCount += 1;
  s.emit('room:join', { tripId, uid: me.uid || undefined, name: me.name || 'Friend' });

  const msgFn = handlers.onMessage ? (m: ChatMessage) => handlers.onMessage!(m) : undefined;
  const typeFn = handlers.onTyping ? (t: TypingPayload) => handlers.onTyping!(t) : undefined;
  const presFn = handlers.onPresence ? (p: PresencePayload) => handlers.onPresence!(p) : undefined;
  const readFn = handlers.onRead ? (r: { tripId: string; messageId: string; count: number }) => handlers.onRead!(r) : undefined;
  const pinFn = handlers.onPin ? (p: { id: string; tripId: string; pinned: boolean }) => handlers.onPin!(p) : undefined;
  const delFn = handlers.onDelete ? (d: { tripId: string; messageId: string }) => handlers.onDelete!(d) : undefined;

  if (msgFn) s.on('chat:new', msgFn);
  if (typeFn) s.on('chat:typing', typeFn);
  if (presFn) s.on('presence:online', presFn);
  if (readFn) s.on('chat:read', readFn);
  if (pinFn) s.on('chat:pin', pinFn);
  if (delFn) s.on('chat:delete', delFn);

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
    s.emit('room:leave', { tripId });
    refCount = Math.max(0, refCount - 1);
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
