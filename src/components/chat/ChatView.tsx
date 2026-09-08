import React, { useEffect, useRef, useState } from 'react';
import { Send, MapPin, BellRing, X, Reply } from 'lucide-react';
import type { Trip, ChatMessage } from '../../types';
import {
  sendChatMessage,
  subscribeChat,
  ringSiren,
  subscribeSiren,
  subscribePresence,
  updatePresence,
  removePresence,
  announceJoinOnce,
} from '../../utils/chat';
import { sendPush } from '../../utils/push';
import { ringLocalSiren } from '../../utils/voice';
import { ensureCloudUser } from '../../utils/supabaseClient';
import { MemberAvatar } from '../common/MemberAvatar';

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

/** Render text with @mentions highlighted. */
function renderRichText(
  text: string,
  mentions: { id: string; name: string }[] | undefined,
  mine: boolean,
  mentionsMe: boolean
): React.ReactNode {
  const names = [...(mentions || []).map((m) => m.name), 'squad'];
  if (names.length === 0) return <>{text}</>;
  const parts = text.split(/(@[\w ]+?)(?=\s|$)/g);
  return (
    <>
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
    </>
  );
}

export const ChatView: React.FC<ChatViewProps> = ({ trip, myName, myUid, unreadIds }) => {
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<ChatMessage[]>(() => {
    try {
      const s = localStorage.getItem(`ws_chat_pending_${trip.id}`);
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<{ id: string; name: string }[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [armed, setArmed] = useState(false);
  const [ringFlash, setRingFlash] = useState<string | null>(null);
  const [locStatus, setLocStatus] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState(0);
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

  useEffect(() => {
    setMsgs([]);
    const off = subscribeChat(trip.id, (fresh) => {
      setMsgs(fresh);
      // Drop pending messages that Firestore has now confirmed
      setPending((old) => {
        const kept = old.filter((p) => !fresh.some((f) => f.id === p.id));
        if (kept.length < old.length) {
          try {
            if (kept.length > 0) localStorage.setItem(`ws_chat_pending_${trip.id}`, JSON.stringify(kept.slice(-50)));
            else localStorage.removeItem(`ws_chat_pending_${trip.id}`);
          } catch { /* quota */ }
        }
        return kept;
      });
    });
    return () => off();
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
    // Drop mentions whose @name was deleted
    setMentions((prev) => prev.filter((m) => v.includes(`@${m.name}`) || (m.id === '__squad__' && v.includes('@squad'))));
    // Detect @query at end for autocomplete
    const m = /@([\w ]*)$/.exec(v);
    setMentionQuery(m ? m[1] : null);
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

  const pickMention = (c: { id: string; name: string }) => {
    const tag = c.id === '__squad__' ? '@squad' : `@${c.name}`;
    const next = text.replace(/@[\w ]*$/, '') + tag + ' ';
    setText(next);
    setMentions((prev) => (prev.some((m) => m.id === c.id) ? prev : [...prev, { id: c.id, name: c.name }]));
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  const send = async () => {
    const t = text.trim();
    if (!t || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);

    const tempId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();

    const finalMentions = mentions.flatMap((m) =>
      m.id === '__squad__'
        ? trip.members.map((x) => ({ id: x.id, name: x.name.replace(/\(You\)/g, '').trim() }))
        : [m]
    );

    const optimistic: ChatMessage = {
      id: tempId,
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
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.overflowY = 'hidden';
    }
    setSending(false);
    sendingRef.current = false;

    // Fire-and-forget Firestore write — if it fails, message is still visible locally
    sendChatMessage(trip.id, myName || 'Friend', {
      type: 'text',
      text: t.slice(0, 500),
      mentions: finalMentions,
      replyTo: optimistic.replyTo,
    }).catch(() => {
      // Firestore write failed (quota, offline, etc.) — message stays in pending, still visible
    });
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
        try {
          await sendChatMessage(trip.id, myName || 'Friend', {
            type: 'location',
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        } catch {
          flashStatus('Could not send location. Check internet.');
        }
      },
      () => flashStatus('Location permission denied.'),
      { timeout: 15000 }
    );
  };

  const sirenTap = async () => {
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 5000);
      return;
    }
    setArmed(false);
    try {
      await ringSiren(trip.id, myName || 'Someone');
      // Closed apps too (no-op until push worker is deployed)
      await sendPush({
        tripId: trip.id,
        kind: 'siren',
        title: 'Siren',
        body: `${myName || 'Someone'} rang the siren`,
      });
    } catch {
      flashStatus('Could not ring. Check internet.');
    }
  };

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

  return (
    <div className="w-full flex-1 min-h-0 flex flex-col">
      {/* Header — selection mode replaces it */}
      {selected ? (
        <div className="flex items-center justify-between pb-1 flex-shrink-0">
          <span className="text-sm font-extrabold text-slate-900">{selected.length} selected</span>
          <div className="flex items-center gap-2">
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
          onClick={sirenTap}
          className={`w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-all ${
            armed ? 'bg-rose-600 text-white animate-pulse' : 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100'
          }`}
          title="Ring siren on all phones"
        >
          <BellRing size={16} />
        </button>
      </div>
      )}

      {ringFlash && (
        <div className="mb-2 p-2.5 rounded-2xl bg-rose-600 text-white text-xs font-bold text-center animate-pulse flex-shrink-0">
          {ringFlash}
        </div>
      )}

      {/* Messages — the ONLY scroller on this page */}
      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-0.5"
        style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
      >
        {(() => {
          const allMsgs = [...pending.filter((p) => !msgs.some((m) => m.id === p.id)), ...msgs];
          return allMsgs.map((m, idx) => {
          if (m.type === 'siren' || m.type === 'system') {
            return (
              <div key={m.id} className="flex justify-center">
                <span className="text-[11px] font-bold text-slate-500 bg-slate-100 border border-slate-200 px-3 py-1 rounded-full">
                  {m.text} • {fmtTime(m.createdAt)}
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
                  className={`max-w-[80%] rounded-2xl px-3 py-2 shadow-2xs ${isSelected ? 'ring-2 ring-indigo-500' : ''} ${mine ? 'bg-indigo-600 text-white rounded-br-md' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md'}`}
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
                    <span className="block text-[13px]">
                      <span className="flex items-center gap-1 font-bold">
                        <MapPin size={13} /> Shared location
                      </span>
                      <a
                        href={`https://maps.google.com/?q=${m.lat},${m.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className={`underline font-bold ${mine ? 'text-white' : 'text-indigo-600'}`}
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
                    <span className={`text-[10px] font-medium ${mine ? 'text-white/70' : 'text-slate-400'}`}>{fmtTime(m.createdAt)}</span>
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
          {(() => {
            const q = mentionQuery.trim().toLowerCase();
            const all = [
              { id: '__squad__', name: 'squad', sub: 'Tag everyone' },
              ...trip.members
                .filter((x) => !x.isCurrentUser)
                .map((x) => ({ id: x.id, name: x.name.replace(/\(You\)/g, '').trim() || 'Friend', sub: x.phone || 'Squad member' })),
            ].filter((c) => !q || c.name.toLowerCase().includes(q));
            if (all.length === 0) return <p className="text-[11px] text-slate-400 px-3 py-2">No match — keep typing or send as plain text.</p>;
            return all.slice(0, 6).map((c) => (
              <button
                key={c.id + c.name}
                type="button"
                onClick={() => pickMention(c)}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-indigo-50 cursor-pointer text-left"
              >
                <MemberAvatar name={c.name} memberId={c.id} size="xs" />
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-bold text-slate-800 truncate">@{c.name}</span>
                  <span className="block text-[10px] text-slate-400 truncate">{c.sub}</span>
                </span>
              </button>
            ));
          })()}
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
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Message the squad"
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
    </div>
  );
};
