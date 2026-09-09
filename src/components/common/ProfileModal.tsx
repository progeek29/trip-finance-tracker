import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { PhoneInput, isValidPhone } from './PhoneInput';
import { lookupInvite, joinTripById } from '../../utils/invites';
import type { UserProfile } from '../../utils/storage';
import type { Trip } from '../../types';

function fmtDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

interface ProfileModalProps {
  isOpen: boolean;
  initial: UserProfile | null;
  tripJoinedAt?: string;
  onClose: () => void;
  onSave: (profile: UserProfile) => void;
  onJoinTrip: (trip: Trip) => void;
  isAdmin?: boolean;
  onOpenAdmin?: () => void;
  onLogout?: () => void;
}

/** Profile: name/mobile + join with code (trip picker if many). */
export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, initial, tripJoinedAt, onClose, onSave, onJoinTrip, isAdmin, onOpenAdmin, onLogout }) => {
  const [name, setName] = useState(initial?.name || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Trip[] | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initial?.name || '');
      setPhone(initial?.phone || '');
      setCode('');
      setError(null);
      setChoices(null);
      setBusy(false);
    }
  }, [isOpen, initial]);

  if (!isOpen) return null;

  const submitProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Please enter your name');
      return;
    }
    if (phone && !isValidPhone(phone)) {
      alert('Please enter a valid 10-digit mobile number');
      return;
    }
    onSave({ name: name.trim(), phone: phone.trim() });
    onClose();
  };

  const lookup = async () => {
    const clean = code.trim().toUpperCase();
    if (clean.length < 4) {
      setError('Enter the code.');
      return;
    }
    setBusy(true);
    setError(null);
    setChoices(null);
    try {
      const ids = await lookupInvite(clean);
      await joinOne(ids[0]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'NOT_FOUND') {
        setError('No trip found with this code. Check the letters and try again.');
      } else if (msg === 'NOT_LOGGED_IN') {
        setError('Please log in first to join a trip.');
      } else {
        setError('Could not join right now. Check internet and retry.');
      }
    } finally {
      setBusy(false);
    }
  };

  const joinOne = async (tripId: string) => {
    setBusy(true);
    try {
      const trip = await joinTripById(tripId);
      onJoinTrip(trip);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'NOT_FOUND') {
        setError('That trip no longer exists.');
      } else if (msg === 'NOT_LOGGED_IN') {
        setError('Please log in first to join a trip.');
      } else {
        setError('Could not join right now. Check internet and retry.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 w-[320px] space-y-4 max-h-[88vh] overflow-y-auto">
        <button type="button" onClick={onClose} className="absolute right-3 top-3 p-1 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer" title="Close">
          <X size={16} />
        </button>
        <h4 className="font-extrabold text-slate-900">Your Profile
          {isAdmin && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-700 border border-indigo-200">ADMIN</span>}
          {!isAdmin && initial?.role === 'owner' && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">OWNER</span>}
        </h4>
        {(initial?.joinedAt || tripJoinedAt) && (
          <p className="text-[11px] text-slate-500 font-medium -mt-2">
            {initial?.joinedAt ? `App member since ${fmtDate(initial.joinedAt)}` : ''}
            {initial?.joinedAt && tripJoinedAt ? ' • ' : ''}
            {tripJoinedAt ? `Trip joined ${fmtDate(tripJoinedAt)}` : ''}
          </p>
        )}
        <form onSubmit={submitProfile} className="space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">What can we call you? *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 placeholder-slate-300"
            />
          </div>
          <PhoneInput label="Mobile number" value={phone} onChange={setPhone} />
          <button type="submit" className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer">
            Save
          </button>
        </form>

        {isAdmin && onOpenAdmin && (
          <button
            onClick={() => { onOpenAdmin(); onClose(); }}
            className="w-full py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold cursor-pointer"
          >
            Admin Dashboard
          </button>
        )}

        {onLogout && (
          <button
            onClick={() => { onLogout(); onClose(); }}
            className="w-full py-2 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-xs font-bold cursor-pointer"
          >
            Logout
          </button>
        )}

        <div className="pt-1 border-t border-slate-100 space-y-2">
          <p className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide pt-2">Join with code</p>
          {!choices ? (
            <>
              <div className="flex gap-2">
                <input
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
                    setError(null);
                  }}
                  placeholder="Enter the code"
                  className="flex-1 min-w-0 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-center text-sm font-extrabold tracking-[0.2em] text-slate-900 focus:outline-none focus:border-indigo-500 placeholder-slate-300 placeholder:tracking-normal placeholder:font-medium"
                />
                <button
                  onClick={lookup}
                  disabled={busy || code.trim().length < 4}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer flex-shrink-0"
                >
                  {busy ? '…' : 'Join'}
                </button>
              </div>
              {error && <p className="text-[11px] text-rose-500 font-bold text-center">{error}</p>}
            </>
          ) : (
            <div className="space-y-1.5">
              <p className="text-[11px] text-slate-500 font-medium">Pick a trip to join:</p>
              {choices.map((t) => (
                <button
                  key={t.id}
                  onClick={() => joinOne(t.id)}
                  disabled={busy}
                  className="w-full text-left p-3 rounded-xl bg-slate-50 hover:bg-indigo-50 border border-slate-200 text-xs cursor-pointer"
                >
                  <span className="block font-extrabold text-slate-900 truncate">{t.title}</span>
                  <span className="block text-[11px] text-slate-500">{t.startDate} • {t.members.length} members</span>
                </button>
              ))}
              <button onClick={() => setChoices(null)} className="w-full text-[11px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer">
                Use a different code
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
