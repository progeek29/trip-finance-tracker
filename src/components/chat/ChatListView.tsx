import React, { useEffect, useRef, useState } from 'react';
import { Search, X, Check, MessageCircle, UserPlus, ChevronRight, Users } from 'lucide-react';
import { MemberAvatar } from '../common/MemberAvatar';
import {
  searchPeople,
  sendRequest,
  acceptRequest,
  declineRequest,
  cancelRequest,
  unfriend,
  createGroup,
  dmRoomId,
  notifyRequestSent,
  type PublicPerson,
  type ChatRequest,
  type CoTraveler,
  type ChatGroup,
} from '../../utils/requests';
import { sendChatMessage } from '../../utils/chat';

export type ChatSeg = 'chats' | 'requests' | 'squad';

interface ChatListViewProps {
  myUid: string | null;
  myName: string;
  received: ChatRequest[];
  sent: ChatRequest[];
  friends: CoTraveler[];
  groups: ChatGroup[];
  /** Per-room unread (count + last preview), cleared on open. */
  dmUnread: Record<string, { count: number; preview: string; at: number }>;
  onOpenDM: (friend: CoTraveler) => void;
  onOpenGroupRoom: (group: ChatGroup) => void;
  onChanged: () => void;
  notify: (msg: string) => void;
}

/** Display names for group members (unknown uids stay generic — never email/phone). */
export function groupDisplayNames(group: ChatGroup, friends: CoTraveler[], myName: string): string {
  const known = new Map(friends.map((f) => [f.id, f.name]));
  const names = (group.memberUids || []).map((u) => known.get(u) || null);
  const shown = names.filter(Boolean) as string[];
  const unknown = names.length - shown.length;
  const firsts = shown.map((n) => n.split(' ')[0]);
  if (unknown > 0) firsts.push(`+${unknown}`);
  // "Me" first for the viewer
  firsts.sort((a, b) => (a === myName.split(' ')[0] ? -1 : b === myName.split(' ')[0] ? 1 : 0));
  return firsts.join(', ');
}

/** Gender glyph (no icon-font dependency): blue Mars, rose Venus, muted dash. */
export const GenderGlyph: React.FC<{ gender?: string }> = ({ gender }) => {
  if (gender === 'male') return <span className="text-[11px] font-extrabold text-sky-500 leading-none">♂</span>;
  if (gender === 'female') return <span className="text-[11px] font-extrabold text-rose-400 leading-none">♀</span>;
  return null;
};

function personStatus(
  id: string,
  friends: CoTraveler[],
  sent: ChatRequest[],
  received: ChatRequest[]
): { kind: 'friend' | 'sent' | 'received' | 'stranger'; reqId?: string } {
  if (friends.some((f) => f.id === id || (f as { uid?: string }).uid === id)) return { kind: 'friend' };
  const s = sent.find((r) => r.uid === id);
  if (s) return { kind: 'sent', reqId: s.id };
  const r = received.find((x) => x.uid === id);
  if (r) return { kind: 'received', reqId: r.id };
  return { kind: 'stranger' };
}

export const ChatListView: React.FC<ChatListViewProps> = ({
  myUid,
  myName,
  received,
  sent,
  friends,
  groups,
  dmUnread,
  onOpenDM,
  onOpenGroupRoom,
  onChanged,
  notify,
}) => {
  const [seg, setSeg] = useState<ChatSeg>('chats');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicPerson[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [profile, setProfile] = useState<PublicPerson | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Group composer: pick 2+ Co-Travelers → name modal → shared room.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [naming, setNaming] = useState(false);
  const [groupName, setGroupName] = useState('');
  const queryTimer = useRef<number | null>(null);

  // Debounced @handle search (2+ chars).
  useEffect(() => {
    if (queryTimer.current) window.clearTimeout(queryTimer.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    queryTimer.current = window.setTimeout(() => {
      searchPeople(q)
        .then((r) => {
          setResults(r);
          setSearchFailed(false);
        })
        .catch(() => {
          setResults([]);
          setSearchFailed(true);
        })
        .finally(() => setSearching(false));
    }, 350);
    return () => {
      if (queryTimer.current) window.clearTimeout(queryTimer.current);
    };
  }, [query]);

  const doSend = async (p: PublicPerson) => {
    setBusyId(p.id);
    try {
      await sendRequest(p.username);
      await notifyRequestSent(myName, p.username, myUid);
      notify(`Request sent to @${p.username}`);
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not send request');
    } finally {
      setBusyId(null);
    }
  };

  const doAccept = async (id: string, name: string) => {
    setBusyId(id);
    try {
      await acceptRequest(id);
      notify(`You are now connected with ${name} — say hi`);
      onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not accept');
    } finally {
      setBusyId(null);
    }
  };

  const doDecline = async (id: string) => {
    setBusyId(id);
    try {
      await declineRequest(id);
      onChanged();
    } catch {
      notify('Could not decline');
    } finally {
      setBusyId(null);
    }
  };

  const doCreateGroup = async () => {
    const ids = [...selected];
    const title = groupName.trim();
    if (ids.length < 2 || !title || busyId) return;
    setBusyId('__group__');
    try {
      const g = await createGroup(ids, title);
      // Timeline line, posted once: `"Admin" created this group on 18 Sep 2026`.
      try {
        const dateStr = new Date().toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
        await sendChatMessage(g.id, myName || 'Someone', {
          type: 'system',
          text: `"${myName || 'Someone'}" created this group on ${dateStr}`,
        });
      } catch { /* timeline line is best-effort — room still opens */ }
      setSelecting(false);
      setSelected(new Set());
      setNaming(false);
      setGroupName('');
      notify(`Group "${title}" created`);
      onChanged();
      onOpenGroupRoom(g);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not create group');
    } finally {
      setBusyId(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const doCancel = async (id: string, handle: string) => {
    setBusyId(id);
    try {
      await cancelRequest(id);
      notify(`Request to @${handle} withdrawn`);
      onChanged();
    } catch {
      notify('Could not withdraw');
    } finally {
      setBusyId(null);
    }
  };

  const actionFor = (p: PublicPerson) => {
    const st = personStatus(p.id, friends, sent, received);
    const busy = busyId === p.id;
    if (st.kind === 'friend') {
      const f = friends.find((x) => x.id === p.id || (x as { uid?: string }).uid === p.id)!;
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => onOpenDM(f)}
          className="px-3.5 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <MessageCircle size={13} /> Message
        </button>
      );
    }
    if (st.kind === 'sent') {
      return (
        <span className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-400">Pending</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => st.reqId && doCancel(st.reqId, p.username)}
            aria-label="Withdraw request"
            title="Withdraw request"
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </span>
      );
    }
    if (st.kind === 'received') {
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => setSeg('requests')}
          className="px-3.5 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold cursor-pointer"
        >
          Respond
        </button>
      );
    }
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => doSend(p)}
        className="px-3.5 h-9 rounded-xl border border-dashed border-slate-300 hover:border-indigo-400 text-slate-500 hover:text-indigo-600 text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
      >
        <UserPlus size={14} /> {busy ? 'Sending…' : 'Request'}
      </button>
    );
  };

  const row = (p: PublicPerson) => (
    <div key={p.id} className="flex items-center gap-3 px-3.5 py-2.5 border-b border-slate-50">
      <button type="button" onClick={() => setProfile(p)} className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer">
        <MemberAvatar name={p.name} memberId={p.id} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="block text-xs font-bold text-slate-900 truncate">{p.name}</span>
            <GenderGlyph gender={p.gender} />
          </span>
          <span className="block text-[11px] text-slate-400 font-medium truncate">@{p.username}</span>
        </span>
      </button>
      {actionFor(p)}
    </div>
  );

  const showResults = query.trim().length >= 2;

  return (
    <div className="max-w-2xl mx-auto w-full">
      {/* Search people */}
      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
            <Search size={16} />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people by @handle or name…"
            className="w-full h-11 pl-10 pr-9 rounded-2xl bg-white border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-300 hover:text-slate-500 cursor-pointer"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {showResults ? (
        <div className="mx-4 bg-white rounded-2xl border border-slate-200 overflow-hidden mb-4">
          {searching && results.length === 0 ? (
            <p className="text-[11px] text-slate-400 font-medium text-center py-6">Searching…</p>
          ) : searchFailed ? (
            <p className="text-[11px] text-rose-500 font-bold text-center py-6">
              Search failed — check internet and retry.
            </p>
          ) : results.length === 0 ? (
            <p className="text-[11px] text-slate-400 font-medium text-center py-6">
              No people found — check the @handle spelling.
            </p>
          ) : (
            results.map(row)
          )}
        </div>
      ) : (
        <>
          {/* Segments */}
          <div className="px-4 pt-1 pb-3 flex gap-2">
            {(
              [
                { id: 'chats', label: `Chats${friends.length ? ` (${friends.length})` : ''}` },
                { id: 'requests', label: `Requests${received.length ? ` (${received.length})` : ''}` },
                { id: 'squad', label: 'Squad' },
              ] as { id: ChatSeg; label: string }[]
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSeg(t.id)}
                className={`flex-1 h-9 rounded-xl text-[11px] font-bold transition-colors cursor-pointer ${
                  seg === t.id
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                    : 'bg-white border border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mx-4 bg-white rounded-2xl border border-slate-200 overflow-hidden mb-4">
            {seg === 'chats' && (
              friends.length === 0 && groups.length === 0 ? (
                <div className="text-center py-10 px-6">
                  <p className="text-xs font-bold text-slate-700">No conversations yet</p>
                  <p className="text-[11px] text-slate-400 font-medium mt-1">
                    Search above, send a request — chat opens on accept.
                  </p>
                </div>
              ) : (
                <>
                  {groups.map((g) => {
                    const un = dmUnread[g.id];
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => onOpenGroupRoom(g)}
                        className="w-full flex items-center gap-3 px-3.5 py-2.5 border-b border-slate-50 hover:bg-indigo-50/50 text-left cursor-pointer"
                      >
                        <span className="w-9 h-9 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0">
                          <Users size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-bold text-slate-900 truncate">
                            {g.name?.trim() || groupDisplayNames(g, friends, myName)}
                          </span>
                          <span className={`block text-[11px] font-medium truncate ${un ? 'text-slate-700 font-bold' : 'text-slate-400'}`}>
                            {un
                              ? un.preview
                              : `Group · ${(g.memberUids || []).length} members`}
                          </span>
                        </span>
                        {un && un.count > 0 && (
                          <span className="min-w-[20px] h-5 px-1 rounded-full bg-emerald-500 text-white text-[10px] font-extrabold flex items-center justify-center flex-shrink-0">
                            {un.count > 99 ? '99+' : un.count}
                          </span>
                        )}
                        <ChevronRight size={17} className="text-slate-300 flex-shrink-0" />
                      </button>
                    );
                  })}
                  {friends.map((f) => {
                    const un = myUid ? dmUnread[dmRoomId(myUid, f.id)] : undefined;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => onOpenDM(f)}
                        className="w-full flex items-center gap-3 px-3.5 py-2.5 border-b border-slate-50 hover:bg-indigo-50/50 text-left cursor-pointer"
                      >
                        <MemberAvatar name={f.name} memberId={f.id} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="block text-xs font-bold text-slate-900 truncate">{f.name}</span>
                            <GenderGlyph gender={f.gender} />
                          </span>
                          <span className={`block text-[11px] font-medium truncate ${un ? 'text-slate-700 font-bold' : 'text-slate-400'}`}>
                            {un ? un.preview : `@${f.username}`}
                          </span>
                        </span>
                        {un && un.count > 0 && (
                          <span className="min-w-[20px] h-5 px-1 rounded-full bg-emerald-500 text-white text-[10px] font-extrabold flex items-center justify-center flex-shrink-0">
                            {un.count > 99 ? '99+' : un.count}
                          </span>
                        )}
                        <ChevronRight size={17} className="text-slate-300 flex-shrink-0" />
                      </button>
                    );
                  })}
                </>
              )
            )}

            {seg === 'requests' && (
              <>
                {received.length === 0 && sent.length === 0 ? (
                  <div className="text-center py-10 px-6">
                    <p className="text-xs font-bold text-slate-700">No requests</p>
                    <p className="text-[11px] text-slate-400 font-medium mt-1">
                      Incoming invites land here. Sent ones wait for accept.
                    </p>
                  </div>
                ) : (
                  <>
                    {received.map((r) => (
                      <div key={r.id} className="flex items-center gap-3 px-3.5 py-2.5 border-b border-slate-50 bg-indigo-50/40">
                        <MemberAvatar name={r.name} memberId={r.uid} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="block text-xs font-bold text-slate-900 truncate">{r.name}</span>
                            <GenderGlyph gender={r.gender} />
                          </span>
                          <span className="block text-[11px] text-slate-400 font-medium truncate">
                            @{r.username} wants to chat
                          </span>
                        </span>
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => doAccept(r.id, r.name)}
                          aria-label="Accept"
                          title="Accept"
                          className="w-8 h-8 rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Check size={15} strokeWidth={3} />
                        </button>
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => doDecline(r.id)}
                          aria-label="Decline"
                          title="Decline (they are not told)"
                          className="w-8 h-8 rounded-full bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                    {sent.map((r) => (
                      <div key={r.id} className="flex items-center gap-3 px-3.5 py-2.5 border-b border-slate-50">
                        <MemberAvatar name={r.name} memberId={r.uid} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="block text-xs font-bold text-slate-900 truncate">{r.name}</span>
                            <GenderGlyph gender={r.gender} />
                          </span>
                          <span className="block text-[11px] text-slate-400 font-medium truncate">
                            @{r.username} · waiting
                          </span>
                        </span>
                        <span className="text-[11px] font-bold text-slate-400">Pending</span>
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => doCancel(r.id, r.username)}
                          aria-label="Withdraw request"
                          title="Withdraw request"
                          className="w-8 h-8 rounded-full bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}

            {seg === 'squad' && (
              friends.length === 0 ? (
                <div className="text-center py-10 px-6">
                  <p className="text-xs font-bold text-slate-700">No Co-Travelers yet</p>
                  <p className="text-[11px] text-slate-400 font-medium mt-1">
                    Accepted requests become your Squad — people you travel with.
                  </p>
                </div>
              ) : (
                <>
                  <div className="px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
                    <p className="text-[11px] font-extrabold text-slate-700 flex-1">
                      {selecting
                        ? `${selected.size} selected`
                        : `${friends.length} Co-Traveler${friends.length > 1 ? 's' : ''}`}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSelecting((v) => !v);
                        setSelected(new Set());
                      }}
                      className={`px-3 h-8 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                        selecting
                          ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          : 'bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                      }`}
                    >
                      {selecting ? 'Cancel' : 'New group'}
                    </button>
                  </div>
                  {friends.map((f) => {
                    const checked = selected.has(f.id);
                    return selecting ? (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => toggleSelect(f.id)}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 border-b border-slate-50 text-left cursor-pointer ${
                          checked ? 'bg-indigo-50/60' : ''
                        }`}
                      >
                        <span
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            checked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 text-transparent'
                          }`}
                        >
                          <Check size={12} strokeWidth={3.5} />
                        </span>
                        <MemberAvatar name={f.name} memberId={f.id} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="block text-xs font-bold text-slate-900 truncate">{f.name}</span>
                            <GenderGlyph gender={f.gender} />
                          </span>
                          <span className="block text-[11px] text-slate-400 font-medium truncate">@{f.username}</span>
                        </span>
                      </button>
                    ) : (
                      <div key={f.id} className="flex items-center gap-3 px-3.5 py-2.5 border-b border-slate-50">
                      <MemberAvatar name={f.name} memberId={f.id} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="block text-xs font-bold text-slate-900 truncate">{f.name}</span>
                          <GenderGlyph gender={f.gender} />
                        </span>
                        <span className="block text-[11px] text-slate-400 font-medium truncate">@{f.username}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenDM(f)}
                        className="px-3.5 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <MessageCircle size={13} /> Message
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Remove ${f.name} from Co-Travelers? Chats stay as history.`)) {
                            setBusyId(f.id);
                            unfriend(f.id)
                              .then(() => {
                                notify(`Removed ${f.name}`);
                                onChanged();
                              })
                              .catch(() => notify('Could not remove. Check internet.'))
                              .finally(() => setBusyId(null));
                          }
                        }}
                        aria-label={`Remove ${f.name}`}
                        title="Remove Co-Traveler"
                        className="w-8 h-8 rounded-full text-slate-300 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                  })}
                  {selecting && selected.size >= 2 && (
                    <div className="sticky bottom-0 bg-white border-t border-slate-100 p-3">
                      <button
                        type="button"
                        onClick={() => {
                          setGroupName('');
                          setNaming(true);
                        }}
                        className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all active:scale-[0.98] cursor-pointer"
                      >
                        Name group ({selected.size})
                      </button>
                    </div>
                  )}
                </>
              )
            )}
          </div>
        </>
      )}

      {/* Group name modal (WhatsApp-style: name BEFORE the room exists) */}
      {naming && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-slate-900/60" onClick={() => setNaming(false)}>
          <div
            className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-sm font-extrabold text-slate-900 text-center">Enter Group Name</h4>
            <p className="text-[11px] text-slate-400 font-medium text-center mt-1">
              {selected.size} members · anyone can rename it later
            </p>
            <input
              autoFocus
              value={groupName}
              onChange={(e) => setGroupName(e.target.value.slice(0, 60))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void doCreateGroup();
              }}
              placeholder="e.g. Goa Squad"
              className="mt-3 w-full h-11 px-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => setNaming(false)}
                className="flex-1 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-colors cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!groupName.trim() || busyId === '__group__'}
                onClick={() => void doCreateGroup()}
                className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold transition-all active:scale-[0.98] cursor-pointer"
              >
                {busyId === '__group__' ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile card */}
      {profile && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-slate-900/60" onClick={() => setProfile(null)}>
          <div
            className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <MemberAvatar name={profile.name} memberId={profile.id} size="lg" />
              <p className="mt-2.5 text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                {profile.name}
                <GenderGlyph gender={profile.gender} />
              </p>
              <p className="text-xs text-slate-400 font-medium">@{profile.username}</p>
              <div className="mt-4 w-full" onClick={(e) => e.stopPropagation()}>
                {actionFor(profile)}
              </div>
              <button
                type="button"
                onClick={() => setProfile(null)}
                className="mt-2 text-[11px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatListView;
