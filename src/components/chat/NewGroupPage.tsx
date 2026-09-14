import React, { useMemo, useState } from 'react';
import { Search, X, Check } from 'lucide-react';
import { MemberAvatar } from '../common/MemberAvatar';
import type { Trip } from '../../types';
import { ui, type CustomChatGroup } from './chatStore';
import type { ChatPerson } from './NewChatPage';

interface NewGroupPageProps {
  trips: Trip[];
  people: ChatPerson[];
  myUid?: string | null;
  onCreate: (group: CustomChatGroup) => void;
}

/**
 * New group page (not a popup): pick a trip, then pick 1:1 people from
 * that trip. Existing groups can never spawn groups — people only.
 */
export const NewGroupPage: React.FC<NewGroupPageProps> = ({ trips, people, myUid, onCreate }) => {
  const [tripId, setTripId] = useState(trips[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  const trip = trips.find((t) => t.id === tripId) ?? trips[0];
  const q = query.trim().toLowerCase();
  const candidates = useMemo(() => {
    if (!trip) return [];
    const ids = new Set(trip.members.map((m) => m.uid || m.id));
    const list = people.filter((p) => ids.has(p.id));
    return q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list;
  }, [people, trip, q]);

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const create = () => {
    if (!trip || picked.length === 0) return;
    onCreate({
      id: `g_${Date.now()}`,
      // Default group name = trip name; rename later from the group page.
      name: name.trim() || trip.title,
      tripId: trip.id,
      memberIds: picked,
      createdAt: Date.now(),
      creatorUid: myUid ?? null,
    });
  };

  return (
    <div>
      <p className={ui.section}>From trip</p>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
        {trips.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTripId(t.id); setPicked([]); }}
            className={`flex-shrink-0 px-4 h-10 rounded-full text-xs font-bold border transition-all active:scale-95 cursor-pointer ${
              t.id === tripId
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200'
                : 'bg-white border-slate-200 text-slate-600'
            }`}
          >
            {t.title}
          </button>
        ))}
      </div>

      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search members…"
          className={`${ui.input} pl-9 pr-9`}
        />
        {query && (
          <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer">
            <X size={15} />
          </button>
        )}
      </div>

      <p className={ui.section}>Members — {picked.length} picked</p>
      <div className="space-y-2 mb-4">
        {candidates.map((p) => {
          const on = picked.includes(p.id);
          return (
            <button key={p.id} onClick={() => toggle(p.id)} className={`${ui.row} w-full text-left cursor-pointer ${on ? 'border-indigo-400 ring-2 ring-indigo-100' : ''}`}>
              <MemberAvatar name={p.name} avatar={p.avatar} memberId={p.id} index={0} size="md" />
              <span className="min-w-0 flex-1">
                <span className={ui.title}>{p.name}</span>
                <span className={ui.sub}>{trip?.title}</span>
              </span>
              <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${on ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 text-transparent'}`}>
                <Check size={14} strokeWidth={3} />
              </span>
            </button>
          );
        })}
        {candidates.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-4">No members found</p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
        <label className="block text-[11px] font-bold text-slate-600 mb-1">Group name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={trip?.title || 'Trip name'}
          className={`${ui.input} mb-3`}
        />
        <button onClick={create} disabled={picked.length === 0} className={`${ui.primaryBtn} w-full disabled:opacity-40`}>
          Create group ({picked.length})
        </button>
      </div>
    </div>
  );
};
