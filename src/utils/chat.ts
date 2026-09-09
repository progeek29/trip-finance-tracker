import { supabase, ensureCloudUser } from './supabaseClient';
import type { ChatMessage } from '../types';

/**
 * Squad chat + siren signals (Supabase Realtime).
 */

export async function sendChatMessage(
  tripId: string,
  senderName: string,
  msg: Pick<ChatMessage, 'type'> & Partial<Pick<ChatMessage, 'text' | 'lat' | 'lng' | 'replyTo' | 'mentions'>>
): Promise<void> {
  const user = await ensureCloudUser();
  const { error } = await supabase.from('chat_messages').insert({
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    tripId,
    type: msg.type,
    text: msg.text || '',
    lat: msg.lat ?? null,
    lng: msg.lng ?? null,
    replyTo: msg.replyTo || null,
    mentions: msg.mentions || [],
    senderId: user.uid,
    senderName,
  });
  if (error) console.error('chat send error:', error);
}

export function subscribeChat(tripId: string, cb: (msgs: ChatMessage[]) => void): () => void {
  let msgs: ChatMessage[] = [];
  let loaded = false;
  let cancelled = false;

  // Initial load
  (async () => {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('tripId', tripId)
        .order('createdAt', { ascending: true })
        .limit(200);
      if (cancelled) return;
      if (error) {
        console.error('chat load error:', error);
        cb([]);
        return;
      }
      msgs = (data || []) as ChatMessage[];
      loaded = true;
      cb([...msgs]);
    } catch (e) {
      console.error('chat load exception:', e);
      if (!cancelled) cb([]);
    }
  })();

  // Realtime subscription — append only
  let sub: ReturnType<typeof supabase.channel> | null = null;
  try {
    sub = supabase
      .channel(`chat:${tripId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `tripId=eq.${tripId}`,
      }, (payload) => {
        if (!loaded || cancelled) return;
        const newMsg = payload.new as ChatMessage;
        if (msgs.some((m) => m.id === newMsg.id)) return;
        msgs = [...msgs, newMsg];
        cb([...msgs]);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('chat realtime channel error for trip:', tripId);
        }
      });
  } catch (e) {
    console.error('chat subscribe error:', e);
  }

  return () => {
    cancelled = true;
    sub?.unsubscribe();
  };
}

/** Siren signal row only (history line is broadcast separately via socket). */
export async function signalSiren(tripId: string, byName: string): Promise<void> {
  const user = await ensureCloudUser();
  await supabase.from('signals').upsert({
    id: `siren_${tripId}`,
    tripId,
    byName,
    at: Date.now(),
  });
  void user;
}

/** Siren: signal + history line in chat. */
export async function ringSiren(tripId: string, byName: string): Promise<void> {
  try {
    await ensureCloudUser();
    await supabase.from('signals').upsert({
      id: `siren_${tripId}`,
      tripId,
      byName,
      at: Date.now(),
    });
    await sendChatMessage(tripId, byName, { type: 'siren', text: `${byName} rang the siren` });
  } catch (e) {
    console.error('siren error:', e);
  }
}

export function subscribeSiren(tripId: string, since: number, cb: (byName: string) => void): () => void {
  let sub: ReturnType<typeof supabase.channel> | null = null;
  try {
    sub = supabase
      .channel(`siren:${tripId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'signals',
        filter: `id=eq.siren_${tripId}`,
      }, (payload) => {
        const d = payload.new as { byName?: string; at?: number } | undefined;
        if (d && d.at && d.at > since && d.byName) cb(d.byName);
      })
      .subscribe();
  } catch (e) {
    console.error('siren subscribe error:', e);
  }
  return () => sub?.unsubscribe();
}

/** Presence heartbeat: who is online right now (stale after 90s). */
export async function updatePresence(tripId: string, uid: string, name: string): Promise<void> {
  try {
    await supabase.from('presence').upsert({
      id: `${tripId}_${uid}`,
      tripId,
      uid,
      name,
      at: Date.now(),
    });
  } catch { /* offline */ }
}

export async function removePresence(tripId: string, uid: string): Promise<void> {
  try {
    await supabase.from('presence').delete().eq('id', `${tripId}_${uid}`);
  } catch { /* best effort */ }
}

export function subscribePresence(tripId: string, cb: (count: number) => void): () => void {
  const STALE_MS = 90_000;
  let cancelled = false;

  const check = async () => {
    if (cancelled) return;
    try {
      const { data } = await supabase
        .from('presence')
        .select('at')
        .eq('tripId', tripId);
      if (cancelled) return;
      const now = Date.now();
      const online = (data || []).filter((r: any) => now - r.at < STALE_MS).length;
      cb(online);
    } catch { /* ignore */ }
  };

  check();
  const interval = setInterval(check, 15_000);

  let sub: ReturnType<typeof supabase.channel> | null = null;
  try {
    sub = supabase
      .channel(`presence:${tripId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'presence',
        filter: `tripId=eq.${tripId}`,
      }, () => check())
      .subscribe();
  } catch { /* ignore */ }

  return () => {
    cancelled = true;
    sub?.unsubscribe();
    clearInterval(interval);
  };
}

/** Announce join once per session (system message + presence). */
export async function announceJoinOnce(tripId: string, myUid: string, myName: string, tripTitle?: string): Promise<boolean> {
  try {
    const { data: existing } = await supabase
      .from('members_joined')
      .select('id')
      .eq('id', `${tripId}_${myUid}`)
      .maybeSingle();

    if (existing) return false;

    await supabase.from('members_joined').insert({
      id: `${tripId}_${myUid}`,
      tripId,
      uid: myUid,
    });
    await updatePresence(tripId, myUid, myName);
    const squad = (tripTitle || 'the trip').trim().slice(0, 40);
    await sendChatMessage(tripId, 'system', {
      type: 'system',
      text: `${myName} joined the ${squad} trip squad`,
    });
    return true;
  } catch (e) {
    console.error('announceJoinOnce error:', e);
    return false;
  }
}
