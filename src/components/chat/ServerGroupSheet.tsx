import React, { useState } from 'react';
import { Search, X, Check, LogOut, UserPlus } from 'lucide-react';
import { MemberAvatar } from '../common/MemberAvatar';
import { useLockBodyScroll } from '../common/useLockBodyScroll';
import type { ChatGroup, CoTraveler } from '../../utils/requests';

interface ServerGroupSheetProps {
  group: ChatGroup;
  myUid: string;
  /** uid -> display name (friends + self resolved by parent). */
  memberNames: Map<string, string>;
  /** Co-Travelers available to add. */
  candidates: CoTraveler[];
  busy: boolean;
  onAdd: (ids: string[]) => void;
  onRemove: (uid: string) => void;
  onLeave: () => void;
  onClose: () => void;
}

/** Server group info popup — same centered fixed-size pattern as Edit Trip /
 *  +Spend: max-w-md, capped height, ONLY the middle scrolls, so opening the
 *  Add section never resizes the popup. Page behind is scroll-locked. */
export const ServerGroupSheet: React.FC<ServerGroupSheetProps> = ({
  group,
  myUid,
  memberNames,
  candidates,
  busy,
  onAdd,
  onRemove,
  onLeave,
  onClose,
}) => {
  useLockBodyScroll();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  const memberUids = group.memberUids || [];
  const title = group.name?.trim() || 'Group';
  const q = query.trim().toLowerCase();
  const addable = candidates.filter(
    (c) => !memberUids.includes(c.id) && (!q || c.name.toLowerCase().includes(q))
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs" onClick={onClose}>
      <div
        className="modal-enter max-w-md w-full rounded-3xl border border-gray-100 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.08)] max-h-[92dvh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex-shrink-0 flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900 font-display tracking-tight">Group info</h3>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="text-center mb-4">
            <span className="w-14 h-14 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xl font-extrabold mx-auto mb-2">
              {title.charAt(0).toUpperCase() || 'G'}
            </span>
            <p className="text-base font-extrabold text-slate-900">{title}</p>
            <p className="text-[11px] text-slate-500 font-medium mt-1">
              Group · {memberUids.length} member{memberUids.length === 1 ? '' : 's'}
            </p>
          </div>

          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
              Members — {memberUids.length}
            </p>
            <button
              onClick={() => setAdding((v) => !v)}
              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer flex items-center gap-1"
            >
              <UserPlus size={13} /> {adding ? 'Done' : 'Add'}
            </button>
          </div>
          {adding && (
            <div className="mb-3">
              <div className="relative mb-2">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search Co-Travelers…"
                  className="w-full h-10 pl-9 pr-9 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-100"
                />
                {query && (
                  <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:bg-slate-100 cursor-pointer">
                    <X size={14} />
                  </button>
                )}
              </div>
              {addable.length === 0 && (
                <p className="text-[11px] text-slate-400 text-center py-2">Everyone is already in.</p>
              )}
              <div className="space-y-2 mb-2">
                {addable.map((c) => {
                  const on = picked.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setPicked((prev) => (on ? prev.filter((x) => x !== c.id) : [...prev, c.id]))}
                      className="w-full text-left cursor-pointer flex items-center gap-2.5 bg-white border border-slate-200/80 rounded-xl px-3 py-2"
                    >
                      <MemberAvatar name={c.name} avatar="" memberId={c.id} index={0} size="md" />
                      <span className="text-xs font-bold text-slate-800 flex-1 truncate">{c.name}</span>
                      <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${on ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 text-transparent'}`}>
                        <Check size={14} strokeWidth={3} />
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => { if (picked.length > 0 && !busy) { onAdd(picked); setPicked([]); setAdding(false); } }}
                disabled={picked.length === 0 || busy}
                className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
              >
                {busy ? 'Adding…' : `Add (${picked.length})`}
              </button>
            </div>
          )}
          <div className="space-y-2">
            {memberUids.map((id, i) => {
              const base = memberNames.get(id) ?? 'Member';
              const isSelf = id === myUid;
              const name = isSelf ? `${base} (You)` : base;
              return (
                <div key={id} className="flex items-center gap-2.5 bg-white border border-slate-200/80 rounded-xl px-3 py-2">
                  <MemberAvatar name={name} avatar="" memberId={id} index={i} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-slate-800 truncate">{name}</span>
                    {group.createdBy === id && <span className="block text-[10px] text-slate-400 font-medium">Admin</span>}
                  </span>
                  {!isSelf && memberUids.length > 1 && (
                    <button
                      onClick={() => onRemove(id)}
                      disabled={busy}
                      aria-label={`Remove ${name}`}
                      className="p-2 rounded-full text-slate-300 hover:text-rose-500 hover:bg-rose-50 cursor-pointer disabled:opacity-40"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-shrink-0 px-5 py-4 border-t border-slate-100">
          <button
            onClick={onLeave}
            disabled={busy}
            className="w-full h-11 rounded-xl bg-white border border-slate-200 hover:border-amber-300 text-amber-600 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-40"
          >
            <LogOut size={15} /> Leave group
          </button>
        </div>
      </div>
    </div>
  );
};

export default ServerGroupSheet;
