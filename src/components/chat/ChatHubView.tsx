import React, { useMemo, useState } from 'react';
import { Search, Plus, Users, Phone, Heart, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { Trip } from '../../types';
import { MemberAvatar } from '../common/MemberAvatar';
import {
  getGroupName,
  loadCustomGroups,
  loadContacts,
  loadFavourites,
  loadGroupNames,
  loadRequests,
  saveCustomGroups,
  setGroupName,
  toggleFavourite,
  ui,
  type ChatRequest,
  type CustomChatGroup,
} from './chatStore';
import { CallsPage } from './CallsPage';
import { FavouritesPage, type FavEntry } from './FavouritesPage';
import { NewChatPage, type ChatPerson } from './NewChatPage';
import { NewGroupPage } from './NewGroupPage';
import { ChatThreadPage } from './ChatThreadPage';
import { GroupMembersPage } from './GroupMembersPage';

type HubPage = 'list' | 'calls' | 'favs' | 'newChat' | 'newGroup' | 'thread' | 'members';

interface Selected {
  kind: 'trip' | 'group' | 'person';
  id: string;
}

interface ChatHubViewProps {
  trips: Trip[];
  myUid?: string | null;
  myName?: string;
  unreadByTrip?: Record<string, number>;
  /** Trip rows open in-hub; header tap jumps to the full trip dashboard. */
  onOpenTripChat?: (trip: Trip) => void;
  onDummyAction: (msg: string) => void;
}

const PAGE_TITLE: Record<Exclude<HubPage, 'list'>, string> = {
  calls: 'Calls',
  favs: 'Favourites',
  newChat: 'New chat',
  newGroup: 'New group',
  thread: 'Chat',
  members: 'Group info',
};

/**
 * My Trips → Chat hub: ONE unified list (trip groups carry a TRIP tag),
 * header = search + calls + favourites. Every conversation opens as a
 * full page; group info opens from the chat header, never from the list.
 */
export const ChatHubView: React.FC<ChatHubViewProps> = ({
  trips,
  myUid,
  myName,
  unreadByTrip,
  onOpenTripChat,
  onDummyAction,
}) => {
  const [page, setPage] = useState<HubPage>('list');
  const [selected, setSelected] = useState<Selected | null>(null);
  const [query, setQuery] = useState('');
  const [groupNames, setGroupNamesState] = useState(loadGroupNames);
  const [customGroups, setCustomGroups] = useState<CustomChatGroup[]>(loadCustomGroups);
  const [favs, setFavs] = useState<string[]>(loadFavourites);
  const [requests, setRequests] = useState<ChatRequest[]>(loadRequests);

  const nameOf = (trip: Trip) => groupNames[trip.id]?.trim() || trip.title || getGroupName(trip.id, trip.title);

  const people = useMemo<ChatPerson[]>(() => {
    const map = new Map<string, ChatPerson & { avatar: string }>();
    for (const t of trips) {
      for (const m of t.members) {
        if (myUid && (m.uid === myUid || m.id === myUid)) continue;
        const key = m.uid || m.id;
        if (!map.has(key)) map.set(key, { id: key, name: m.name, avatar: m.avatar });
      }
    }
    return [...map.values()];
  }, [trips, myUid]);

  const strangers = useMemo(
    () => loadContacts().map((c) => ({ id: c.id, name: c.name, avatar: '' })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [requests]
  );

  interface Entry {
    id: string;
    kind: 'trip' | 'group' | 'person';
    refId: string;
    title: string;
    subtitle: string;
    tag?: string;
    unread?: number;
  }

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [
      ...trips.map((t) => ({
        id: `trip:${t.id}`,
        kind: 'trip' as const,
        refId: t.id,
        title: nameOf(t),
        subtitle: `${t.members.length} members`,
        tag: 'TRIP',
        unread: unreadByTrip?.[t.id] ?? 0,
      })),
      ...customGroups.map((g) => ({
        id: `group:${g.id}`,
        kind: 'group' as const,
        refId: g.id,
        title: g.name,
        subtitle: `${g.memberIds.length} members`,
        tag: 'GROUP',
      })),
      ...people.map((p) => ({ id: `person:${p.id}`, kind: 'person' as const, refId: p.id, title: p.name, subtitle: '1:1 chat' })),
    ];
    const q = query.trim().toLowerCase();
    return q ? list.filter((e) => e.title.toLowerCase().includes(q) || e.subtitle.toLowerCase().includes(q)) : list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips, customGroups, people, query, groupNames, unreadByTrip]);

  const favEntries = useMemo<FavEntry[]>(
    () =>
      favs
        .map((id) => entries.find((e) => e.id === id))
        .filter((e): e is Entry => !!e)
        .map((e) => ({ id: e.id, title: e.title, subtitle: e.subtitle, tag: e.tag })),
    [favs, entries]
  );

  const openEntry = (entry: Entry) => {
    if (entry.kind === 'person') {
      const isStranger = strangers.some((s) => s.id === entry.refId);
      const status = requests.find((r) => r.personId === entry.refId)?.status;
      if (isStranger && status !== 'accepted') {
        setPage('newChat');
        return;
      }
    }
    setSelected({ kind: entry.kind, id: entry.refId });
    setPage('thread');
  };

  const openFav = (id: string) => {
    const entry = entries.find((e) => e.id === id);
    if (entry) openEntry(entry);
    else setPage('list');
  };

  const go = (p: HubPage) => setPage(p);
  const backToList = () => {
    setPage('list');
    setSelected(null);
  };

  const persistGroups = (next: CustomChatGroup[]) => {
    setCustomGroups(next);
    saveCustomGroups(next);
  };

  const selectedTrip = selected?.kind === 'trip' ? trips.find((t) => t.id === selected.id) : undefined;
  const selectedGroup = selected?.kind === 'group' ? customGroups.find((g) => g.id === selected.id) : undefined;
  const selectedPerson =
    selected?.kind === 'person'
      ? people.find((p) => p.id === selected.id) ?? strangers.find((s) => s.id === selected.id)
      : undefined;

  const memberNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of trips) for (const m of t.members) map.set(m.uid || m.id, m.name);
    for (const c of loadContacts()) map.set(c.id, c.name);
    return map;
  }, [trips]);

  const threadTitle =
    selectedTrip ? nameOf(selectedTrip) : selectedGroup ? selectedGroup.name : selectedPerson?.name ?? 'Chat';
  const threadSubtitle =
    selectedTrip
      ? `${selectedTrip.members.length} members · tap header for trip`
      : selectedGroup
        ? `${selectedGroup.memberIds.length} members · tap header for info`
        : '1:1 chat';

  const renderList = () => (
    <div>
      {/* Header: title + calls + favourites */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">Chats</h2>
          <p className="text-xs text-slate-500 font-medium">All conversations in one list</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => go('calls')} aria-label="Calls" title="Calls" className={`${ui.iconBtn} bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-300`}>
            <Phone size={17} />
          </button>
          <button onClick={() => go('favs')} aria-label="Favourites" title="Favourites" className={`${ui.iconBtn} bg-white border border-slate-200 text-slate-500 hover:text-rose-500 hover:border-rose-300`}>
            <Heart size={17} />
          </button>
          <button onClick={() => go('newChat')} className="flex items-center gap-1.5 px-3 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm shadow-indigo-200 transition-all active:scale-95 cursor-pointer">
            <Plus size={15} strokeWidth={2.5} /> New
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats…"
          className={`${ui.input} pl-9 pr-9`}
        />
        {query && (
          <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer">
            <X size={15} />
          </button>
        )}
      </div>

      {/* Pending requests strip */}
      {requests.some((r) => r.status === 'pending') && (
        <button onClick={() => go('newChat')} className="w-full text-left px-4 h-11 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold mb-3 cursor-pointer">
          {requests.filter((r) => r.status === 'pending').length} chat request(s) pending — review
        </button>
      )}

      {/* Unified list */}
      <div className="space-y-2">
        {entries.map((e) => {
          const fav = favs.includes(e.id);
          return (
            <div key={e.id} className={ui.row}>
              <button onClick={() => openEntry(e)} className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer">
                <span className="relative flex-shrink-0">
                  <span className={`w-11 h-11 rounded-full flex items-center justify-center text-base font-extrabold ${e.kind === 'person' ? 'bg-slate-200 text-slate-600' : e.kind === 'group' ? 'bg-violet-600 text-white' : 'bg-indigo-600 text-white'}`}>
                    {e.kind === 'group' ? <Users size={18} /> : e.title.trim().charAt(0).toUpperCase() || 'C'}
                  </span>
                  {(e.unread ?? 0) > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 border-2 border-white text-white text-[9px] font-extrabold flex items-center justify-center">
                      {(e.unread ?? 0) > 99 ? '99+' : e.unread}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className={`${ui.title} flex-shrink truncate`}>{e.title}</span>
                    {e.tag && <span className={ui.tag}>{e.tag}</span>}
                  </span>
                  <span className={ui.sub}>{e.subtitle}</span>
                </span>
                <ChevronRight size={18} className="text-slate-300 flex-shrink-0" />
              </button>
              <button
                onClick={() => setFavs(toggleFavourite(e.id))}
                aria-label="Toggle favourite"
                title="Favourite"
                className={`${ui.iconBtn} ${fav ? 'text-rose-500' : 'text-slate-300 hover:text-rose-400'}`}
              >
                <Heart size={17} fill={fav ? 'currentColor' : 'none'} />
              </button>
            </div>
          );
        })}
        {entries.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-8">No chats match "{query}"</p>
        )}
      </div>

      <button onClick={() => go('newGroup')} className="mt-4 w-full h-11 rounded-2xl bg-white border border-dashed border-slate-300 hover:border-indigo-400 text-slate-500 hover:text-indigo-600 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer">
        <Users size={15} /> New group (from 1:1 people)
      </button>
    </div>
  );

  const renderPage = () => {
    switch (page) {
      case 'calls':
        return <CallsPage people={people} onDummyAction={onDummyAction} />;
      case 'favs':
        return <FavouritesPage entries={favEntries} onOpen={openFav} onUnfavourite={(id) => setFavs(toggleFavourite(id))} />;
      case 'newChat':
        return (
          <NewChatPage
            people={people}
            requests={requests}
            onRequestsChange={setRequests}
            onOpenThread={(personId) => {
              const all = [...people, ...strangers];
              const p = all.find((x) => x.id === personId);
              if (!p) return;
              setSelected({ kind: 'person', id: personId });
              setPage('thread');
            }}
            onDummyAction={onDummyAction}
          />
        );
      case 'newGroup':
        return (
          <NewGroupPage
            trips={trips}
            people={people}
            myUid={myUid}
            onCreate={(g) => {
              persistGroups([g, ...customGroups]);
              setSelected({ kind: 'group', id: g.id });
              setPage('thread');
            }}
          />
        );
      case 'thread': {
        const groupForMembers = selectedGroup;
        return (
          <ChatThreadPage
            trip={selectedTrip}
            threadId={selected ? `${selected.kind}:${selected.id}` : 'chat:none'}
            title={threadTitle}
            subtitle={threadSubtitle}
            myName={myName || 'Me'}
            myUid={myUid}
            onHeaderClick={
              groupForMembers
                ? () => setPage('members')
                : selectedTrip && onOpenTripChat
                  ? () => onOpenTripChat(selectedTrip)
                  : undefined
            }
            onDummyAction={onDummyAction}
          />
        );
      }
      case 'members': {
        if (!selectedGroup) return null;
        const trip = trips.find((t) => t.id === selectedGroup.tripId);
        const isCreator = !selectedGroup.creatorUid || selectedGroup.creatorUid === myUid;
        const groupCandidates = trip
          ? people.filter((p) => (trip.members.map((m) => m.uid || m.id) as string[]).includes(p.id))
          : people;
        return (
          <GroupMembersPage
            group={selectedGroup}
            tripTitle={trip?.title ?? 'Trip'}
            memberNames={memberNames}
            candidates={groupCandidates}
            isCreator={isCreator}
            onRename={(name) => persistGroups(customGroups.map((g) => (g.id === selectedGroup.id ? { ...g, name } : g)))}
            onAddMembers={(ids) =>
              persistGroups(
                customGroups.map((g) =>
                  g.id === selectedGroup.id ? { ...g, memberIds: [...g.memberIds, ...ids.filter((x) => !g.memberIds.includes(x))] } : g
                )
              )
            }
            onRemoveMember={(id) =>
              persistGroups(
                customGroups.map((g) => (g.id === selectedGroup.id ? { ...g, memberIds: g.memberIds.filter((x) => x !== id) } : g))
              )
            }
            onLeave={() => {
              if (!myUid) {
                onDummyAction('Sign in to leave groups');
                return;
              }
              persistGroups(
                customGroups.map((g) =>
                  g.id === selectedGroup.id ? { ...g, memberIds: g.memberIds.filter((x) => x !== myUid) } : g
                )
              );
              backToList();
            }}
            onDelete={() => {
              persistGroups(customGroups.filter((g) => g.id !== selectedGroup.id));
              backToList();
            }}
            onDummyAction={onDummyAction}
          />
        );
      }
      default:
        return renderList();
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-5 pb-32">
      {page !== 'list' && (
        <button onClick={() => (page === 'members' ? setPage('thread') : page === 'thread' ? backToList() : setPage('list'))} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-indigo-600 mb-3 cursor-pointer">
          <ChevronLeft size={16} /> {page === 'thread' ? 'Chats' : page === 'members' ? 'Back to chat' : 'Chats'}
        </button>
      )}
      {page !== 'list' && page !== 'thread' && page !== 'members' && (
        <h2 className="text-lg font-extrabold text-slate-900 tracking-tight mb-3">{PAGE_TITLE[page]}</h2>
      )}
      {renderPage()}
    </div>
  );
};
