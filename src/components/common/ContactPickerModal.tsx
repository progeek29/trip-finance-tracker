import React, { useState } from 'react';
import { X, Search } from 'lucide-react';
import { MemberAvatar } from './MemberAvatar';
import type { DeviceContact } from '../../utils/deviceContacts';

interface ContactPickerModalProps {
  contacts: DeviceContact[];
  onClose: () => void;
  onAdd: (selected: DeviceContact[]) => void;
}

/** In-app phone contact list: search + tick + add. Same UI on web and APK. */
export const ContactPickerModal: React.FC<ContactPickerModalProps> = ({ contacts, onClose, onAdd }) => {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? contacts.filter((c) => c.name.toLowerCase().includes(q) || c.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '')))
    : contacts;

  const toggle = (key: string) => {
    setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const keyOf = (c: DeviceContact, i: number) => `${c.name}|${c.phone}|${i}`;
  const selected = contacts.filter((c, i) => picked.includes(keyOf(c, i)));

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h4 className="font-extrabold text-slate-900">Phone Contacts ({contacts.length})</h4>
            <p className="text-[11px] text-slate-400 font-medium">Tick friends to add them to the squad</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer" title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pt-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or number"
              className="w-full rounded-xl bg-slate-50 border border-slate-200 pl-9 pr-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 placeholder-slate-400"
            />
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-[11px] text-slate-400 font-medium">{selected.length} selected</span>
            <button
              onClick={() => setPicked(filtered.map((c, i) => keyOf(c, contacts.indexOf(c))))}
              className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
            >
              Select all shown
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-1.5">
          {filtered.map((c) => {
            const key = keyOf(c, contacts.indexOf(c));
            const on = picked.includes(key);
            return (
              <button
                key={key}
                onClick={() => toggle(key)}
                className={`w-full flex items-center gap-3 rounded-xl px-3 py-2 border text-left cursor-pointer transition-colors ${
                  on ? 'bg-indigo-50 border-indigo-300' : 'bg-slate-50 border-slate-100 hover:border-indigo-200'
                }`}
              >
                <MemberAvatar name={c.name} memberId={c.phone} size="sm" />
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-bold text-slate-800 truncate">{c.name}</span>
                  <span className="block text-[11px] text-slate-400 truncate">{c.phone}</span>
                </span>
                <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${on ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 text-transparent'}`}>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6.5L4.8 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-6">No contacts match "{query}"</p>
          )}
        </div>

        <div className="p-4 border-t border-slate-100">
          <button
            onClick={() => onAdd(selected)}
            disabled={selected.length === 0}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
          >
            Add Selected ({selected.length})
          </button>
        </div>
      </div>
    </div>
  );
};
