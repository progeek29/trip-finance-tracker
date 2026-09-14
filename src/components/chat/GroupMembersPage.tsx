import React, { useState } from 'react';
import { Search, X, Link2, Check, LogOut, Trash2, Pencil } from 'lucide-react';
import { MemberAvatar } from '../common/MemberAvatar';
import {
  groupInviteLink,
  ui,
  type CustomChatGroup,
} from './chatStore';
import type { ChatPerson } from './NewChatPage';

interface GroupMembersPageProps {
  group: CustomChatGroup;
  tripTitle: string;
  memberNames: Map<string, string>;
  candidates: ChatPerson[];
  isCreator: boolean;
  onRename: (name: string) => void;
  onAddMembers: (ids: string[]) => void;
  onRemoveMember: (id: string) => void;
  onLeave: () => void;
  onDelete: () => void;
  onDummyAction: (msg: string) => void;
}

/**
 * Group info page (opened by tapping the chat header — never from the
 * list directly): members, invite link, rename, add/remove (custom
 * groups), leave (everyone), delete (creator only).
 */
export const GroupMembersPage: React.FC<GroupMembersPageProps> = ({
  group,
  tripTitle,
  memberNames,
  candidates,
  isCreator,
  onRename,
  onAddMembers,
  onRemoveMember,
  onLeave,
  onDelete,
  onDummyAction,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.name);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const q = query.trim().toLowerCase();
  const addable = candidates.filter((c) => !group.memberIds.includes(c.id) && (!q || c.name.toLowerCase().includes(q)));

  const copyInvite = async () => {
    const link = groupInviteLink(group.id);
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      /* clipboard unavailable */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const saveName = () => {
    if (draft.trim()) onRename(draft.trim());
    setEditing(false);
  };

  return (
    <div>
      {/* Group name */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 mb-3 text-center">
        <span className="w-14 h-14 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xl font-extrabold mx-auto mb-2">
          {group.name.trim().charAt(0).toUpperCase() || 'G'}
        </span>
        {editing ? (
          <span className="flex items-center gap-2 justify-center">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveName();
                if (e.key === 'Escape') setEditing(false);
              }}
              className="h-10 px-3 rounded-xl border border-indigo-300 text-sm font-bold text-center outline-none focus:ring-2 focus:ring-indigo-100 w-48"
            />
            <button onClick={saveName} aria-label="Save name" className={`${ui.iconBtn} bg-indigo-600 text-white`}>
              <Check size={16} />
            </button>
          </span>
        ) : (
          <span className="flex items-center gap-2 justify-center">
            <span className="text-base font-extrabold text-slate-900">{group.name}</span>
            <button onClick={() => { setDraft(group.name); setEditing(true); }} aria-label="Edit group name" className="p-1.5 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer">
              <Pencil size={15} />
            </button>
          </span>
        )}
        <p className="text-[11px] text-slate-500 font-medium mt-1">
          {group.memberIds.length} members · from {tripTitle}
        </p>
      </div>

      {/* Invite link */}
      <button onClick={copyInvite} className={`${ui.row} w-full text-left cursor-pointer mb-3`}>
        <span className={`${ui.iconBtn} bg-indigo-50 text-indigo-600`}>
          <Link2 size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={ui.title}>Invite link</span>
          <span className={ui.sub}>{groupInviteLink(group.id)}</span>
        </span>
        <span className={`text-[11px] font-bold ${copied ? 'text-emerald-600' : 'text-indigo-600'}`}>
          {copied ? 'Copied' : 'Copy'}
        </span>
      </button>

      {/* Members */}
      <div className="flex items-center justify-between mb-2">
        <p className={ui.section} style={{ marginBottom: 0 }}>Members — {group.memberIds.length}</p>
        <button onClick={() => setAdding((v) => !v)} className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer">
          {adding ? 'Done' : '+ Add'}
        </button>
      </div>
      {adding && (
        <div className="mb-3">
          <div className="relative mb-2">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people…" className={`${ui.input} h-10 pl-9 pr-9 text-xs`} />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:bg-slate-100 cursor-pointer">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="space-y-2 mb-2">
            {addable.map((c) => {
              const on = picked.includes(c.id);
              return (
                <button key={c.id} onClick={() => setPicked((prev) => (on ? prev.filter((x) => x !== c.id) : [...prev, c.id]))} className={`${ui.row} w-full text-left cursor-pointer`}>
                  <MemberAvatar name={c.name} avatar={c.avatar} memberId={c.id} index={0} size="md" />
                  <span className={`${ui.title} flex-1`}>{c.name}</span>
                  <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${on ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 text-transparent'}`}>
                    <Check size={14} strokeWidth={3} />
                  </span>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => { if (picked.length > 0) { onAddMembers(picked); setPicked([]); setAdding(false); } }}
            disabled={picked.length === 0}
            className={`${ui.primaryBtn} w-full disabled:opacity-40`}
          >
            Add ({picked.length})
          </button>
        </div>
      )}
      <div className="space-y-2 mb-4">
        {group.memberIds.map((id, i) => {
          const name = memberNames.get(id) ?? 'Member';
          return (
            <div key={id} className={ui.row}>
              <MemberAvatar name={name} avatar="" memberId={id} index={i} size="md" />
              <span className="min-w-0 flex-1">
                <span className={ui.title}>{name}</span>
                {isCreator && i === 0 && <span className={ui.sub}>Admin</span>}
              </span>
              {group.memberIds.length > 1 && (
                <button onClick={() => onRemoveMember(id)} aria-label={`Remove ${name}`} className="p-2 rounded-full text-slate-300 hover:text-rose-500 hover:bg-rose-50 cursor-pointer">
                  <X size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Danger zone */}
      <div className="space-y-2">
        <button onClick={onLeave} className="w-full h-11 rounded-xl bg-white border border-slate-200 hover:border-amber-300 text-amber-600 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer">
          <LogOut size={15} /> Leave group
        </button>
        {isCreator && (
          <button onClick={onDelete} className="w-full h-11 rounded-xl bg-white border border-slate-200 hover:border-rose-300 text-rose-600 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer">
            <Trash2 size={15} /> Delete group
          </button>
        )}
      </div>
      <p className="text-[10px] text-slate-400 font-medium text-center mt-3">
        QR invite + scanning lands here next.
      </p>
    </div>
  );
};

export default GroupMembersPage;
