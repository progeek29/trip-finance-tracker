import React, { useMemo, useState } from 'react';
import { Search, X, UserPlus, Clock, Check } from 'lucide-react';
import { MemberAvatar } from '../common/MemberAvatar';
import {
  addContact,
  loadContacts,
  ui,
  upsertRequest,
  type ChatRequest,
} from './chatStore';

export interface ChatPerson {
  id: string;
  name: string;
  avatar: string;
}

interface NewChatPageProps {
  people: ChatPerson[];
  requests: ChatRequest[];
  onRequestsChange: (reqs: ChatRequest[]) => void;
  onOpenThread: (personId: string) => void;
  onDummyAction: (msg: string) => void;
}

/**
 * New chat page (not a popup): search trip people, add a stranger by
 * name/phone, and send a chat request first — no request, no chat.
 */
export const NewChatPage: React.FC<NewChatPageProps> = ({
  people,
  requests,
  onRequestsChange,
  onOpenThread,
  onDummyAction,
}) => {
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState<ChatPerson[]>(() =>
    loadContacts().map((c) => ({ id: c.id, name: c.name, avatar: '' }))
  );
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  const q = query.trim().toLowerCase();
  const matchedPeople = useMemo(
    () => (q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people),
    [people, q]
  );
  const matchedContacts = useMemo(
    () => (q ? contacts.filter((c) => c.name.toLowerCase().includes(q)) : contacts),
    [contacts, q]
  );
  const pendingIds = useMemo(
    () => new Set(requests.filter((r) => r.status === 'pending').map((r) => r.personId)),
    [requests]
  );
  const acceptedIds = useMemo(
    () => new Set(requests.filter((r) => r.status === 'accepted').map((r) => r.personId)),
    [requests]
  );

  const addStranger = () => {
    const name = newName.trim();
    if (!name) return;
    const contact = { id: `c_${Date.now()}`, name, phone: newPhone.trim() || undefined };
    setContacts(addContact(contact).map((c) => ({ id: c.id, name: c.name, avatar: '' })));
    setNewName('');
    setNewPhone('');
  };

  const sendRequest = (person: ChatPerson) => {
    onRequestsChange(upsertRequest({ personId: person.id, name: person.name, status: 'pending', at: Date.now() }));
    onDummyAction(`Request sent to ${person.name} — chat unlocks on accept`);
  };

  const row = (person: ChatPerson, isStranger: boolean) => {
    const pending = pendingIds.has(person.id);
    const accepted = acceptedIds.has(person.id) || !isStranger;
    return (
      <div key={person.id} className={ui.row}>
        <MemberAvatar name={person.name} avatar={person.avatar} memberId={person.id} index={0} size="md" />
        <span className="min-w-0 flex-1">
          <span className={ui.title}>{person.name}</span>
          <span className={ui.sub}>{isStranger ? 'Not in your trips' : 'Trip member'}</span>
        </span>
        {accepted ? (
          <button onClick={() => onOpenThread(person.id)} className="px-4 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold transition-all active:scale-95 cursor-pointer">
            Chat
          </button>
        ) : pending ? (
          <span className="flex items-center gap-1 px-3 h-9 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-bold">
            <Clock size={13} /> Requested
          </span>
        ) : (
          <button onClick={() => sendRequest(person)} className="px-4 h-9 rounded-xl bg-white border border-indigo-200 hover:border-indigo-400 text-indigo-700 text-[11px] font-bold transition-all active:scale-95 cursor-pointer">
            Request
          </button>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people…"
          className={`${ui.input} pl-9 pr-9`}
        />
        {query && (
          <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer">
            <X size={15} />
          </button>
        )}
      </div>

      {requests.some((r) => r.status === 'pending') && (
        <>
          <p className={ui.section}>Pending requests — {requests.filter((r) => r.status === 'pending').length}</p>
          <div className="space-y-2 mb-5">
            {requests.filter((r) => r.status === 'pending').map((r) => (
              <div key={r.personId} className={ui.row}>
                <MemberAvatar name={r.name} avatar="" memberId={r.personId} index={0} size="md" />
                <span className="min-w-0 flex-1">
                  <span className={ui.title}>{r.name}</span>
                  <span className={ui.sub}>Waiting for accept</span>
                </span>
                <button
                  onClick={() => onRequestsChange(upsertRequest({ ...r, status: 'accepted' }))}
                  className="flex items-center gap-1 px-3 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold cursor-pointer"
                >
                  <Check size={13} /> Accept (demo)
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <p className={ui.section}>People — {matchedPeople.length + matchedContacts.length}</p>
      <div className="space-y-2 mb-5">
        {matchedPeople.map((p) => row(p, false))}
        {matchedContacts.map((c) => row(c, !acceptedIds.has(c.id)))}
        {matchedPeople.length + matchedContacts.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-4">No people match "{query}"</p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
        <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900 mb-3">
          <UserPlus size={15} className="text-indigo-600" /> Add someone new
        </p>
        <div className="space-y-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" className={ui.input} />
          <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Phone (optional)" inputMode="tel" className={ui.input} />
          <button onClick={addStranger} disabled={!newName.trim()} className={`${ui.primaryBtn} w-full disabled:opacity-40`}>
            Add contact
          </button>
        </div>
      </div>
    </div>
  );
};
