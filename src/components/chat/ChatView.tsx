import React, { useEffect, useRef, useState } from 'react';
import { Send, MapPin, BellRing, X, Reply, Pin, PinOff, Trash2, Info } from 'lucide-react';
import type { Trip, ChatMessage } from '../../types';
import {
  sendChatMessage,
  signalSiren,
  subscribeSiren,
  subscribePresence,
  updatePresence,
  removePresence,
  announceJoinOnce,
} from '../../utils/chat';
import {
  joinTripRoom,
  sendTyping,
  sendChatViaSocket,
  sendReadReceipt,
  pinChatMessage,
  deleteChatMessage,
} from '../../utils/socket';
import { supabase } from '../../utils/supabaseClient';
import { sendPush } from '../../utils/push';
import { ringLocalSiren } from '../../utils/voice';
import { playChime, startSirenLoop, stopSirenLoop, unlockAudio, playReceiverSiren } from '../../utils/chime';
import { ensureCloudUser } from '../../utils/supabaseClient';
import { MemberAvatar } from '../common/MemberAvatar';

type RichMsg = ChatMessage & { pinned?: boolean; _deleted?: boolean };

interface ChatViewProps {
  trip: Trip;
  myName: string;
  myUid: string | null;
  unreadIds: string[];
}

function fmtTime(createdAt: unknown): string {
  try {
    const d = (createdAt as { toDate?: () => Date })?.toDate?.();
    if (d) {
      let h = d.getHours();
      const suffix = h >= 12 ? 'pm' : 'am';
      h = h % 12 || 12;
      return `${h}:${String(d.getMinutes()).padStart(2, '0')}${suffix}`;
    }
    if (createdAt) {
      const raw = new Date(createdAt as string);
      if (!isNaN(raw.getTime())) {
        let h = raw.getHours();
        const suffix = h >= 12 ? 'pm' : 'am';
        h = h % 12 || 12;
        return `${h}:${String(raw.getMinutes()).padStart(2, '0')}${suffix}`;
      }
    }
  } catch { /* pending */ }
  // Fallback to local time while server timestamp is pending
  const d = new Date();
  let h = d.getHours();
  const suffix = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}${suffix}`;
}

function dateKey(createdAt: unknown): string | null {
  try {
    const d = (createdAt as { toDate?: () => Date })?.toDate?.();
    if (d) return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (createdAt) {
      const raw = new Date(createdAt as string);
      if (!isNaN(raw.getTime())) return `${raw.getFullYear()}-${raw.getMonth()}-${raw.getDate()}`;
    }
  } catch {
    return null;
  }
  return null;
}

function separatorLabel(createdAt: unknown): string {
  try {
    let d: Date | null = null;
    const td = (createdAt as { toDate?: () => Date })?.toDate?.();
    if (td) {
      d = td;
    } else if (createdAt) {
      const raw = new Date(createdAt as string);
      if (!isNaN(raw.getTime())) d = raw;
    }
    if (!d) return '';
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const isSame = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (isSame(d, today)) return 'Today';
    if (isSame(d, yesterday)) return 'Yesterday';
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

/** Render text with @mentions highlighted + tappable links. */
function renderRichText(
  text: string,
  mentions: { id: string; name: string }[] | undefined,
  mine: boolean,
  mentionsMe: boolean
): React.ReactNode {
  void mentionsMe;
  const names = [...(mentions || []).map((m) => m.name), 'squad'];
  // Split on URLs first, then @mentions inside each chunk
  const urlSplitRe = /(https?:\/\/[^\s]+)/g;
  const isUrl = (s: string) => /^https?:\/\/\S+$/.test(s);
  const chunks = text.split(urlSplitRe);
  return (
    <>
      {chunks.map((chunk, ci) => {
        if (isUrl(chunk)) {
          return (
            <a
              key={ci}
              href={chunk}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={`underline font-bold break-all ${mine ? 'text-white' : 'text-indigo-600'}`}
            >
              {chunk}
            </a>
          );
        }
        if (names.length === 0) return <span key={ci}>{chunk}</span>;
        const parts = chunk.split(/(@[\w ]+?)(?=\s|$)/g);
        return (
          <span key={ci}>
            {parts.map((p, i) => {
              if (!p.startsWith('@')) return <span key={i}>{p}</span>;
              const who = p.slice(1).trim().toLowerCase();
              const hit = names.some((n) => n.toLowerCase() === who || n.toLowerCase().startsWith(who));
              if (!hit) return <span key={i}>{p}</span>;
              return (
                <strong
                  key={i}
                  className={mine ? 'text-indigo-100 bg-white/15 px-1 rounded' : 'text-indigo-600 px-1 rounded'}
                >
                  {p}
                </strong>
              );
            })}
          </span>
        );
      })}
    </>
  );
}

export const ChatView: React.FC<ChatViewProps> = ({ trip, myName, myUid, unreadIds }) => {
  const [msgs, setMsgs] = useState<RichMsg[]>([]);
  const [pending, setPending] = useState<ChatMessage[]>(() => {
    try {
      const s = localStorage.getItem(`ws_chat_pending_${trip.id}`);
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<{ id: string; name: string }[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  // Mash-to-siren bell: fresh click-counter state (legacy arm logic removed)
  const [sirenActive, setSirenActive] = useState(false);
  const [swingKey, setSwingKey] = useState(0);
  const tapTimes = useRef<number[]>([]);
  const [ringFlash, setRingFlash] = useState<string | null>(null);
  const [locStatus, setLocStatus] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState(0);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [readCounts, setReadCounts] = useState<Record<string, number>>({});
  const typingTimers = useRef<Record<string, number>>({});
  const typingEmitAt = useRef(0);
  const typingIdleTimer = useRef<number | null>(null);
  // Snapshot of unread at open — divider stays put while reading
  const [entryUnread] = useState<string[]>(() => [...unreadIds]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Persist pending messages to localStorage so they survive refresh
  useEffect(() => {
    try {
      if (pending.length > 0) {
        localStorage.setItem(`ws_chat_pending_${trip.id}`, JSON.stringify(pending.slice(-50)));
      } else {
        localStorage.removeItem(`ws_chat_pending_${trip.id}`);
      }
    } catch { /* quota */ }
  }, [pending, trip.id]);
  const touchX = useRef<number | null>(null);
  const [slide, setSlide] = useState<{ id: string; dx: number } | null>(null);
  const [selected, setSelected] = useState<string[] | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const scrolledToUnread = useRef(false);

  // History (REST) + live room (WebSocket): incoming, typing, presence, reads
  useEffect(() => {
    setMsgs([]);
    setReadCounts({});
    unlockAudio();
    let cancelled = false;

    const loadHistory = async () => {
      try {
        const { data } = await supabase.from('chat_messages').select('*').eq('tripId', trip.id).order('createdAt', { ascending: true }).limit(200);
        if (cancelled) return;
        const rows = ((data || []) as RichMsg[]).filter((m) => !m._deleted);
        setMsgs(rows);
        // Drop pending messages the server has now confirmed
        setPending((old) => {
          const kept = old.filter((p) => !rows.some((f) => f.id === p.id));
          if (kept.length < old.length) {
            try {
              if (kept.length > 0) localStorage.setItem(`ws_chat_pending_${trip.id}`, JSON.stringify(kept.slice(-50)));
              else localStorage.removeItem(`ws_chat_pending_${trip.id}`);
            } catch { /* quota */ }
          }
          return kept;
        });
        // Read counts for Seen ticks
        try {
          const { data: reads } = await supabase.from('message_reads').select('*').eq('tripId', trip.id);
          if (!cancelled && Array.isArray(reads)) {
            const map: Record<string, number> = {};
            for (const r of reads as { messageId: string }[]) map[r.messageId] = (map[r.messageId] || 0) + 1;
            setReadCounts(map);
          }
        } catch { /* reads optional */ }
        // Mark latest as read
        if (!cancelled && rows.length > 0 && myUid) {
          const last = rows[rows.length - 1];
          if (last.senderId !== myUid) sendReadReceipt(trip.id, last.id, myUid);
        }
      } catch {
        if (!cancelled) setMsgs([]);
      }
    };
    loadHistory();

    const leave = joinTripRoom(
      trip.id,
      { uid: myUid, name: myName },
      {
        onMessage: (m) => {
          const rich = m as RichMsg;
          if (rich._deleted) {
            setMsgs((prev) => prev.filter((x) => x.id !== rich.id));
            return;
          }
          // Soft bell from a mate → gentle chime (no alarm loop)
          if (rich.type === 'bell' && rich.senderId !== myUid) {
            playChime();
          }
          // Incoming emergency siren → audible alarm on this device too + rings
          if (rich.type === 'siren' && rich.senderId !== myUid) {
            playReceiverSiren();
            window.dispatchEvent(new CustomEvent('ws_siren_overlay', { detail: { until: Date.now() + 8000 } }));
            setRingFlash(`${rich.senderName || 'Someone'} triggered the emergency siren`);
            window.setTimeout(() => setRingFlash(null), 4000);
          }
          setMsgs((prev) => {
            if (prev.some((x) => x.id === rich.id)) return prev;
            return [...prev, rich];
          });
          setPending((old) => (old.some((p) => p.id === rich.id) ? old.filter((p) => p.id !== rich.id) : old));
          // Live read receipt while watching
          if (rich.senderId !== myUid && myUid) sendReadReceipt(trip.id, rich.id, myUid);
        },
        onTyping: (t) => {
          if (myUid && t.uid === myUid) return;
          const name = t.name || 'Someone';
          setTypingNames((prev) => (t.typing ? (prev.includes(name) ? prev : [...prev, name]) : prev.filter((n) => n !== name)));
          if (t.typing) {
            if (typingTimers.current[name]) window.clearTimeout(typingTimers.current[name]);
            typingTimers.current[name] = window.setTimeout(() => {
              setTypingNames((prev) => prev.filter((n) => n !== name));
            }, 4000);
          }
        },
        onPresence: (p) => setOnline(p.count),
        onRead: (r) => setReadCounts((prev) => ({ ...prev, [r.messageId]: r.count })),
        onPin: (p) => {
          setMsgs((prev) =>
            prev.map((m) => (m.id === p.id ? { ...m, pinned: p.pinned } : p.pinned ? { ...m, pinned: false } : m))
          );
        },
        onDelete: (d) => {
          setMsgs((prev) => prev.filter((m) => m.id !== d.messageId));
        },
      }
    );
    const onFocus = () => loadHistory();
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      leave();
      stopSirenLoop();
      window.removeEventListener('focus', onFocus);
      if (typingIdleTimer.current) window.clearTimeout(typingIdleTimer.current);
      Object.values(typingTimers.current).forEach((t) => window.clearTimeout(t));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  useEffect(() => {
    const since = Date.now();
    const off = subscribeSiren(trip.id, since, (byName) => {
      ringLocalSiren();
      setRingFlash(`${byName} rang the siren`);
      setTimeout(() => setRingFlash(null), 4000);
    });
    return () => off();
  }, [trip.id]);

  // Presence: heartbeat while here + join/created line exactly once ever
  useEffect(() => {
    let stop = false;
    let timer: number | null = null;
    (async () => {
      try {
        const user = await ensureCloudUser();
        if (stop) return;
        await announceJoinOnce(trip.id, user.uid, myName || 'Someone');
        await updatePresence(trip.id, user.uid, myName || 'Someone');
        timer = window.setInterval(() => {
          updatePresence(trip.id, user.uid, myName || 'Someone');
        }, 30000);
      } catch { /* offline */ }
    })();
    const off = subscribePresence(trip.id, setOnline);
    return () => {
      stop = true;
      if (timer) window.clearInterval(timer);
      off();
      ensureCloudUser()
        .then((u) => removePresence(trip.id, u.uid))
        .catch(() => undefined);
    };
  }, [trip.id, myName]);

  // Jump to first unread on open
  useEffect(() => {
    if (scrolledToUnread.current || entryUnread.length === 0 || msgs.length === 0) return;
    if (msgs.some((m) => entryUnread.includes(m.id))) {
      scrolledToUnread.current = true;
      setTimeout(() => {
        const el = document.getElementById(`chatmsg-${entryUnread[0]}`);
        if (el && listRef.current) {
          const top = el.offsetTop - listRef.current.clientHeight / 2;
          listRef.current.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        }
      }, 300);
    }
  }, [msgs, entryUnread]);

  // Gentle auto-scroll only for live messages while near bottom
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [msgs.length]);

  // Reset textarea height when text is cleared (after send)
  useEffect(() => {
    if (!text && inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.overflowY = 'hidden';
    }
  }, [text]);

  const isMine = (m: ChatMessage) => (myUid ? m.senderId === myUid : m.senderName === myName);

  const mentionsMe = (m: ChatMessage) => {
    const me = trip.members.find((x) => x.isCurrentUser);
    return (m.mentions || []).some(
      (x) => x.id === '__squad__' || (me && (x.id === me.id || (me.name ? x.name === me.name : false)))
    );
  };

  const onTextChange = (v: string) => {
    setText(v);
    // Typing indicator (throttled emit + idle stop)
    const now = Date.now();
    if (now - typingEmitAt.current > 1500) {
      typingEmitAt.current = now;
      sendTyping(trip.id, { uid: myUid, name: myName }, true);
    }
    if (typingIdleTimer.current) window.clearTimeout(typingIdleTimer.current);
    typingIdleTimer.current = window.setTimeout(() => {
      sendTyping(trip.id, { uid: myUid, name: myName }, false);
    }, 2000);
    // Drop mentions whose @name was deleted
    setMentions((prev) => prev.filter((m) => v.includes(`@${m.name}`) || (m.id === '__squad__' && v.includes('@squad'))));
    // Token = non-space word right after @ (exact /@(\w*)$/).
    // Space closes the token → plain text, dropdown hides immediately.
    const m = /@(\w*)$/.exec(v);
    setMentionQuery(m ? m[1] : null);
    setHighlightIdx(0);
    const el = inputRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 110) + 'px';
      el.style.overflowY = el.scrollHeight > el.clientHeight + 2 ? 'auto' : 'hidden';
    }
  };

  const mentionCandidates = (() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.trim().toLowerCase();
    const all = [
      { id: '__squad__', name: 'squad', sub: 'Everyone in this trip' },
      ...trip.members
        .filter((x) => !x.isCurrentUser)
        .map((x) => ({ id: x.id, name: x.name.replace(/\(You\)/g, '').trim() || 'Friend', sub: x.phone || 'Squad member' })),
    ];
    return all.filter((c) => !q || c.name.toLowerCase().includes(q)).slice(0, 6);
  })();
  const dropdownOpen = mentionQuery !== null && mentionCandidates.length > 0;

  const pickGuard = useRef(0);
  const pickMention = (c: { id: string; name: string }) => {
    // mousedown + click can both fire for one tap — take the first only
    const now = Date.now();
    if (now - pickGuard.current < 600) return;
    pickGuard.current = now;
    const tag = c.id === '__squad__' ? '@squad' : `@${c.name}`;
    const next = text.replace(/@\w*$/, '') + tag + ' ';
    setText(next);
    setMentions((prev) => (prev.some((m) => m.id === c.id) ? prev : [...prev, { id: c.id, name: c.name }]));
    setMentionQuery(null);
    setHighlightIdx(0);
    inputRef.current?.focus();
  };

  // Desktop keyboard navigation while the dropdown is open
  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (dropdownOpen) {
      const last = mentionCandidates.length - 1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, last));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const c = mentionCandidates[Math.min(highlightIdx, last)];
        if (c) pickMention(c);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        setHighlightIdx(0);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const send = async () => {
    const t = text.trim();
    if (!t || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);

    const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();

    const finalMentions = mentions.flatMap((m) =>
      m.id === '__squad__'
        ? trip.members.map((x) => ({ id: x.id, name: x.name.replace(/\(You\)/g, '').trim() }))
        : [m]
    );

    const optimistic: ChatMessage = {
      id: msgId,
      type: 'text',
      text: t.slice(0, 500),
      mentions: finalMentions,
      replyTo: replyTo ? { id: replyTo.id, senderName: replyTo.senderName, text: (replyTo.text || '').slice(0, 120) } : undefined,
      senderId: myUid || 'local',
      senderName: myName || 'Friend',
      createdAt: now.toISOString(),
    };

    // Show instantly
    setPending((prev) => [...prev, optimistic]);
    setText('');
    setMentions([]);
    setMentionQuery(null);
    setReplyTo(null);
    sendTyping(trip.id, { uid: myUid, name: myName }, false);
    if (typingIdleTimer.current) window.clearTimeout(typingIdleTimer.current);
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.overflowY = 'hidden';
    }
    setSending(false);
    sendingRef.current = false;

    // Live send: server persists + broadcasts to the room (echo drops pending)
    try {
      await sendChatViaSocket({
        id: msgId,
        tripId: trip.id,
        type: 'text',
        text: t.slice(0, 500),
        mentions: finalMentions,
        replyTo: optimistic.replyTo,
        senderId: myUid || 'local',
        senderName: myName || 'Friend',
      });
    } catch {
      // Socket failed — REST fallback (visible to others on their next open/focus)
      sendChatMessage(trip.id, myName || 'Friend', {
        type: 'text',
        text: t.slice(0, 500),
        mentions: finalMentions,
        replyTo: optimistic.replyTo,
      }).catch(() => {
        // Offline — message stays in pending, still visible locally
      });
    }
  };

  const flashStatus = (msg: string) => {
    setLocStatus(msg);
    setTimeout(() => setLocStatus(null), 3000);
  };

  const sendLocation = () => {
    if (!window.isSecureContext) {
      flashStatus('Location needs a secure page — works in the installed app, not on this http link.');
      return;
    }
    if (!('geolocation' in navigator)) {
      flashStatus('Location is not available on this device.');
      return;
    }
    flashStatus('Fetching location…');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocStatus(null);
        const payload = {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          tripId: trip.id,
          type: 'location',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          senderId: myUid || 'local',
          senderName: myName || 'Friend',
        };
        try {
          await sendChatViaSocket(payload);
        } catch {
          try {
            await sendChatMessage(trip.id, myName || 'Friend', {
              type: 'location',
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            });
          } catch {
            flashStatus('Could not send location. Check internet.');
          }
        }
      },
      () => flashStatus('Location permission denied.'),
      { timeout: 15000 }
    );
  };

  // SINGLE-LAYER MASH-TO-SIREN BELL (no dropdowns, no arm window)
  // Single tap → local swing + chime AND soft broadcast (everyone sees "@X rang the bell").
  // 3+ taps within 1s → EMERGENCY: full alarm broadcast + rings on every screen
  // until tapped again.
  const handleBellTap = async () => {
    if (sirenActive) {
      // Deactivate: stop the local loop (delivered pushes can't be recalled)
      setSirenActive(false);
      stopSirenLoop();
      tapTimes.current = [];
      window.dispatchEvent(new CustomEvent('ws_siren_overlay', { detail: { until: 0 } }));
      return;
    }
    const now = Date.now();
    tapTimes.current = [...tapTimes.current.filter((t) => now - t < 1000), now];
    if (tapTimes.current.length >= 3) {
      tapTimes.current = [];
      setSirenActive(true);
      startSirenLoop();
      window.dispatchEvent(new CustomEvent('ws_siren_overlay', { detail: { until: Date.now() + 4000 } }));
      try {
        // Signal row (record) + socket broadcast (live — REST alone never reaches rooms)
        await signalSiren(trip.id, myName || 'Someone');
        await sendChatViaSocket({
          id: `msg_siren_${trip.id}_${Date.now()}`,
          tripId: trip.id,
          type: 'siren',
          text: `${myName || 'Someone'} rang the siren`,
          senderId: myUid || 'local',
          senderName: myName || 'Someone',
        });
        await sendPush({
          tripId: trip.id,
          kind: 'siren',
          title: 'CRITICAL ALERT',
          body: `${myName || 'Someone'} triggered the emergency siren`,
        });
      } catch {
        flashStatus('Could not broadcast. Check internet.');
      }
      return;
    }
    // Standard ring: visual swing (retriggered) + local chime + soft broadcast
    setSwingKey((k) => k + 1);
    playChime();
    flashStatus('Bell rang — squad notified');
    sendChatViaSocket({
      id: `msg_bell_${trip.id}_${Date.now()}`,
      tripId: trip.id,
      type: 'bell',
      text: `@${myName || 'Someone'} rang the bell`,
      senderId: myUid || 'local',
      senderName: myName || 'Someone',
    }).catch(() => {
      flashStatus('Bell rang locally — squad offline, will sync on reconnect');
    });
  };

  // Sender overlay heartbeat — rings stay till deactivation (never vanish mid-loop)
  useEffect(() => {
    if (!sirenActive) return;
    const timer = window.setInterval(() => {
      window.dispatchEvent(new CustomEvent('ws_siren_overlay', { detail: { until: Date.now() + 4000 } }));
    }, 3000);
    return () => window.clearInterval(timer);
  }, [sirenActive]);

  const jumpTo = (id: string) => {
    const el = document.getElementById(`chatmsg-${id}`);
    if (el && listRef.current) {
      const top = el.offsetTop - listRef.current.clientHeight / 2;
      listRef.current.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  };

  const onTouchStart = (m: ChatMessage) => (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX;
    if (selected) return;
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      justLongPressedRef.current = m.id;
      setSelected([m.id]);
      setSlide(null);
      setTimeout(() => { justLongPressedRef.current = null; }, 600);
    }, 500);
  };

  const onTouchMove = (m: ChatMessage) => (e: React.TouchEvent) => {
    if (touchX.current === null || selected) return;
    const dx = Math.min(90, Math.max(0, e.touches[0].clientX - touchX.current));
    if (dx > 8 && longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setSlide((s) => (s && s.id !== m.id ? s : { id: m.id, dx }));
  };

  const justLongPressedRef = React.useRef<string | null>(null);
  const onTouchEnd = (m: ChatMessage) => (e: React.TouchEvent) => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    // Ignore the lift that just created the selection (prevents instant auto-clear)
    if (justLongPressedRef.current === m.id) {
      justLongPressedRef.current = null;
      touchX.current = null;
      setSlide(null);
      return;
    }
    if (selected) {
      setSelected((prev) =>
        prev!.includes(m.id) ? (prev!.length === 1 ? null : prev!.filter((id) => id !== m.id)) : [...prev!, m.id]
      );
      touchX.current = null;
      setSlide(null);
      return;
    }
    if (touchX.current === null) {
      setSlide(null);
      return;
    }
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (dx > 55) setReplyTo(m);
    setSlide(null);
  };

  const copySelected = async () => {
    if (!selected || selected.length === 0) return;
    const lines = msgs
      .filter((m) => selected.includes(m.id))
      .map((m) =>
        m.type === 'location'
          ? `${m.senderName}: shared location (${m.lat},${m.lng})`
          : `${m.senderName}: ${m.text || ''}`
      )
      .join('\n');
    try {
      await navigator.clipboard.writeText(lines);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = lines;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setSelected(null);
    flashStatus(`${selected.length} message${selected.length > 1 ? 's' : ''} copied.`);
  };

  const firstUnreadId = entryUnread.length > 0 ? entryUnread[0] : null;
  const pinnedMsg = msgs.find((m) => m.pinned);
  const selectedMsgs = selected ? msgs.filter((m) => selected.includes(m.id)) : [];
  const canDeleteSelected = selectedMsgs.length > 0 && selectedMsgs.every((m) => isMine(m));

  const pinSelected = async () => {
    if (!selected || selected.length !== 1) return;
    try {
      await pinChatMessage(trip.id, selected[0], true);
      setSelected(null);
    } catch {
      flashStatus('Could not pin. Check internet.');
    }
  };

  const deleteSelected = async () => {
    if (!canDeleteSelected || !selected) return;
    try {
      await Promise.all(selected.map((id) => deleteChatMessage(trip.id, id)));
      setSelected(null);
    } catch {
      flashStatus('Could not delete. Check internet.');
    }
  };

  return (
    <div className="relative w-full flex-1 min-h-0 flex flex-col">
      {/* Header — selection mode replaces it */}
      {selected ? (
        <div className="flex items-center justify-between pb-1 flex-shrink-0">
          <span className="text-sm font-extrabold text-slate-900">{selected.length} selected</span>
          <div className="flex items-center gap-2">
            {selected.length === 1 && (
              <button
                onClick={pinSelected}
                className="w-8 h-8 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-200 flex items-center justify-center cursor-pointer"
                title="Pin message"
              >
                <Pin size={14} />
              </button>
            )}
            {canDeleteSelected && (
              <button
                onClick={deleteSelected}
                className="w-8 h-8 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 flex items-center justify-center cursor-pointer"
                title="Delete my message(s)"
              >
                <Trash2 size={14} />
              </button>
            )}
            <button
              onClick={copySelected}
              className="w-8 h-8 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 flex items-center justify-center cursor-pointer"
              title="Copy"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v3"/></svg>
            </button>
            <button onClick={() => setSelected(null)} className="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer" title="Close selection">
              <X size={16} />
            </button>
          </div>
        </div>
      ) : (
      <div className="flex items-center justify-between pb-1 flex-shrink-0">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900 font-display">Squadroom</h3>
          <p className="text-[11px] text-slate-500 font-medium">
            {online > 0 ? `${online} online` : `${trip.members.length} members`}
          </p>
        </div>
        <button
          type="button"
          onClick={handleBellTap}
          className={`w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-colors bg-transparent border-0 touch-manipulation select-none ${sirenActive ? 'text-[#ef4444]' : 'text-slate-600 hover:text-rose-600'}`}
          style={{ touchAction: 'manipulation' }}
          title={sirenActive ? 'Stop emergency siren' : 'Ring bell (tap 3x for emergency siren)'}
        >
          <span key={swingKey} className={`inline-flex ${sirenActive ? 'siren-shake' : swingKey > 0 ? 'bell-swing' : ''}`}>
            <BellRing size={18} fill={sirenActive ? '#ef4444' : 'none'} />
          </span>
        </button>
      </div>
      )}

      {ringFlash && (
        <div className="mb-2 p-2.5 rounded-2xl bg-rose-600 text-white text-xs font-bold text-center animate-pulse flex-shrink-0">
          {ringFlash}
        </div>
      )}

      {/* Pinned message */}
      {pinnedMsg && (
        <button
          onClick={() => jumpTo(pinnedMsg.id)}
          className="mb-2 p-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-left flex items-center gap-2 flex-shrink-0 cursor-pointer hover:bg-amber-100"
        >
          <Pin size={13} className="text-amber-600 flex-shrink-0" />
          <span className="flex-1 min-w-0 text-[11px] text-slate-700 font-medium truncate">
            <strong className="text-amber-700">{pinnedMsg.senderName}:</strong> {pinnedMsg.text || (pinnedMsg.type === 'location' ? 'Shared location' : 'message')}
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              pinChatMessage(trip.id, pinnedMsg.id, false).catch(() => flashStatus('Could not unpin. Check internet.'));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') pinChatMessage(trip.id, pinnedMsg.id, false).catch(() => undefined);
            }}
            className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
            title="Unpin"
          >
            <PinOff size={13} />
          </span>
        </button>
      )}

      {/* Typing indicator — floating bubble above the input */}
      {typingNames.length > 0 && (
        <div className="flex-shrink-0 mb-1 ml-1 inline-flex self-start items-center gap-2 bg-white border border-[#e2e8f0] rounded-full pl-3 pr-3.5 py-1.5 shadow-sm">
          <span className="text-[11px] text-slate-600 font-bold">
            {typingNames.join(', ')} {typingNames.length === 1 ? 'is' : 'are'} typing
          </span>
          <span className="flex items-center gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="typing-dot w-1.5 h-1.5 rounded-full bg-indigo-500"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </span>
        </div>
      )}

      {/* Messages — soft off-white canvas, the ONLY scroller on this page */}
      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-0.5 bg-[#f8fafc] rounded-2xl px-1 py-1"
        style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
      >
        {(() => {
          const allMsgs = [...pending.filter((p) => !msgs.some((m) => m.id === p.id)), ...msgs];
          return allMsgs.map((m, idx) => {
          if (m.type === 'siren' || m.type === 'system' || m.type === 'bell') {
            return (
              <div key={m.id} className="flex justify-center py-0.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#64748b]">
                  <Info size={11} className="flex-shrink-0" />
                  {m.text}
                </span>
              </div>
            );
          }
          const prevKey = idx > 0 ? dateKey(allMsgs[idx - 1].createdAt) : null;
          const currKey = dateKey(m.createdAt);
          const showDateSep = currKey && currKey !== prevKey;
          const mine = isMine(m);
          const meMentioned = !mine && mentionsMe(m);
          const showDivider = firstUnreadId === m.id;
          const isSelected = selected !== null && selected.includes(m.id);
          const slideDx = slide && slide.id === m.id ? slide.dx : 0;
          return (
            <div key={m.id}>
              {showDateSep && (
                <div className="flex items-center gap-3 my-2">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 bg-white border border-slate-200 px-2.5 py-0.5 rounded-full">
                    {separatorLabel(m.createdAt)}
                  </span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>
              )}
              {showDivider && (
                <div className="flex justify-center my-1">
                  <span className="text-[11px] font-extrabold text-white bg-indigo-600 px-3 py-1 rounded-full shadow-sm">
                    {entryUnread.length} unread message{entryUnread.length > 1 ? 's' : ''}
                  </span>
                </div>
              )}
              <div
                id={`chatmsg-${m.id}`}
                className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                onTouchStart={onTouchStart(m)}
                onTouchMove={onTouchMove(m)}
                onTouchEnd={onTouchEnd(m)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setSelected((prev) => (prev ? (prev.includes(m.id) ? prev : [...prev, m.id]) : [m.id]));
                }}
              >
                {isSelected && (
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white self-center flex items-center justify-center flex-shrink-0 mr-1">
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6.5L4.8 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                )}
                <div
                  className={`max-w-[80%] rounded-[16px] px-3 pt-2 pb-1.5 shadow-sm ${isSelected ? 'ring-2 ring-indigo-500' : ''} ${mine ? 'bg-[linear-gradient(135deg,#4f46e5,#4338ca)] text-white rounded-br-md' : 'bg-white border border-[#e2e8f0] text-slate-800 rounded-bl-md'}`}
                  style={slideDx > 0 && !isSelected ? { transform: `translateX(${slideDx}px)`, transition: slideDx === 0 ? 'transform 0.15s' : 'none' } : undefined}
                >
                  {!mine && <p className="text-[10px] font-extrabold text-indigo-600 mb-0.5">{m.senderName}</p>}
                  {m.replyTo && (
                    <button
                      onClick={() => jumpTo(m.replyTo!.id)}
                      className={`block w-full text-left text-[11px] rounded-lg px-2 py-1 mb-1 cursor-pointer ${mine ? 'bg-white/15' : 'bg-slate-100'}`}
                    >
                      <span className={`block font-extrabold ${mine ? 'text-indigo-100' : 'text-indigo-600'}`}>{m.replyTo.senderName}</span>
                      <span className={`block truncate ${mine ? 'text-white/90' : 'text-slate-600'}`}>{m.replyTo.text || 'message'}</span>
                    </button>
                  )}
                  {m.type === 'location' && m.lat !== undefined && m.lng !== undefined ? (
                    <span className="block min-w-[180px]">
                      <span className="relative block h-20 rounded-xl overflow-hidden mb-1.5 bg-gradient-to-br from-emerald-50 via-slate-100 to-indigo-50 border border-[#e2e8f0]">
                        <span className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(circle at 30% 40%, #c7d2fe 0, transparent 45%), radial-gradient(circle at 70% 65%, #a7f3d0 0, transparent 45%)' }} />
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center shadow ${mine ? 'bg-white/20 text-white' : 'bg-indigo-600 text-white'}`}>
                            <MapPin size={15} />
                          </span>
                        </span>
                      </span>
                      <span className="block text-[13px] font-bold mb-1">Shared location</span>
                      <a
                        href={`https://maps.google.com/?q=${m.lat},${m.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className={`block text-center text-[12px] font-bold rounded-xl px-3 py-1.5 ${mine ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                      >
                        Open in Maps
                      </a>
                    </span>
                  ) : (
                    <p className="text-[13px] font-medium whitespace-pre-wrap break-words">
                      {renderRichText(m.text || '', m.mentions, mine, meMentioned)}
                    </p>
                  )}
                  <span className="flex items-center justify-end gap-1.5 mt-0.5">
                    <span className={`text-[10px] font-medium ${mine ? 'text-[#c7d2fe]' : 'text-[#94a3b8]'}`}>{fmtTime(m.createdAt)}</span>
                    {mine && (readCounts[m.id] || 0) > 0 && (
                      <span className="text-[10px] font-bold text-white/80">· Seen</span>
                    )}
                    <button
                      onClick={() => setReplyTo(m)}
                      className={`p-0.5 rounded cursor-pointer ${mine ? 'text-white/70 hover:text-white' : 'text-slate-300 hover:text-indigo-500'}`}
                      title="Reply"
                    >
                      <Reply size={12} />
                    </button>
                  </span>
                </div>
              </div>
            </div>
          );
        });
        })()}
        {msgs.length === 0 && (
          <p className="text-[11px] text-slate-400 text-center py-8">No messages yet — say hi to the squad.</p>
        )}
      </div>

      {locStatus && (
        <p className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-1.5 font-medium text-center flex-shrink-0 mb-1">{locStatus}</p>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center justify-between gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-1.5 flex-shrink-0 mb-1">
          <span className="min-w-0 text-[11px] text-slate-600 truncate">
            <strong className="text-indigo-700">Replying to {replyTo.senderName}:</strong> {replyTo.text || 'message'}
          </span>
          <button type="button" onClick={() => setReplyTo(null)} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Mention autocomplete — every member, online or not */}
      {mentionQuery !== null && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden flex-shrink-0 max-h-36 overflow-y-auto mb-1">
          {mentionCandidates.length === 0 ? (
            <p className="text-[11px] text-slate-400 px-3 py-2">No match — keep typing or send as plain text.</p>
          ) : (
            mentionCandidates.map((c, idx) => (
              <button
                key={c.id + c.name}
                type="button"
                onMouseDown={(e) => {
                  // Desktop: select before blur closes the dropdown
                  e.preventDefault();
                  pickMention(c);
                }}
                onClick={() => pickMention(c)}
                onMouseEnter={() => setHighlightIdx(idx)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 cursor-pointer text-left ${idx === highlightIdx ? 'bg-indigo-100' : 'hover:bg-indigo-50'}`}
              >
                <MemberAvatar name={c.name} memberId={c.id} size="xs" />
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-bold text-slate-800 truncate">@{c.name}</span>
                  <span className="block text-[10px] text-slate-400 truncate">{c.sub}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Input pinned at bottom */}
      <div className="flex items-end gap-2 pt-1 pb-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={sendLocation}
          className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 flex items-center justify-center flex-shrink-0 self-end cursor-pointer"
          title="Share location"
        >
          <MapPin size={17} />
        </button>
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onFocus={() => {
            window.scrollTo(0, 0);
            setTimeout(() => {
              window.scrollTo(0, 0);
              if (listRef.current) {
                listRef.current.scrollTop = listRef.current.scrollHeight;
              }
            }, 80);
          }}
          onTouchStart={() => {
            if (window.scrollY !== 0) window.scrollTo(0, 0);
          }}
          onBlur={() => {
            // Outside tap closes the dropdown (candidate taps use onMouseDown/onClick first).
            // Delayed so a tap selection always lands before close.
            window.setTimeout(() => setMentionQuery((q) => (document.activeElement === inputRef.current ? q : null)), 150);
          }}
          onKeyDown={onInputKeyDown}
          placeholder="Message the squad (@ to mention)"
          className="flex-1 rounded-xl bg-white border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 placeholder-slate-400 resize-none"
          style={{ overflowY: 'hidden' }}
        />
        <button
          type="button"
          onClick={send}
          disabled={!text.trim() || sending}
          className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white flex items-center justify-center flex-shrink-0 self-end cursor-pointer"
          title="Send"
        >
          <Send size={16} />
        </button>
      </div>
      {/* Emergency rings live at App root (every screen) — nothing local here. */}
    </div>
  );
};
