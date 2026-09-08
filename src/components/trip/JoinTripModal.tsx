import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Logo } from '../common/Logo';
import { PhoneInput, isValidPhone } from '../common/PhoneInput';
import { loadUserProfile, saveUserProfile } from '../../utils/storage';

interface JoinTripModalProps {
  onClose: () => void;
  onJoin: (code: string) => Promise<void>;
}

/**
 * Landing: enter a friend's invite code to join their trip.
 * No profile yet → name + mobile asked HERE first (never joins as "Friend").
 */
export const JoinTripModal: React.FC<JoinTripModalProps> = ({ onClose, onJoin }) => {
  const existing = loadUserProfile();
  const [code, setCode] = useState('');
  const [name, setName] = useState(existing?.name || '');
  const [phone, setPhone] = useState(existing?.phone || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsProfile = !existing?.name;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (clean.length < 4) {
      setError('Enter the 6-letter code from your friend.');
      return;
    }
    if (needsProfile) {
      if (!name.trim()) {
        setError('Tell us your name first — the squad will see it.');
        return;
      }
      if (phone && !isValidPhone(phone)) {
        setError('Please enter a valid 10-digit mobile number.');
        return;
      }
      saveUserProfile({ name: name.trim(), phone: phone.trim() });
    }
    setBusy(true);
    setError(null);
    try {
      await onJoin(clean);
    } catch (err) {
      setError(
        err instanceof Error && err.message === 'NOT_FOUND'
          ? 'No trip found with this code. Check the letters and try again.'
          : 'Could not join right now. Check internet and retry.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <form onSubmit={submit} className="relative bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 w-[320px] space-y-4">
        <button type="button" onClick={onClose} className="absolute right-3 top-3 p-1 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer" title="Close">
          <X size={16} />
        </button>
        <div className="flex justify-center">
          <Logo size={40} />
        </div>
        <div className="text-center">
          <h4 className="font-extrabold text-slate-900">Join a Trip</h4>
          <p className="text-[11px] text-slate-500 font-medium">Enter the invite code your friend shared.</p>
        </div>
        <input
          autoFocus={needsProfile ? false : true}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
            setError(null);
          }}
          placeholder="e.g. GOA4X8"
          className="w-full rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3 text-center text-xl font-extrabold tracking-[0.3em] text-slate-900 focus:outline-none focus:border-indigo-500 placeholder-slate-300 placeholder:tracking-normal placeholder:text-sm placeholder:font-medium"
        />
        {needsProfile && (
          <div className="space-y-2.5 rounded-2xl bg-indigo-50/70 border border-indigo-100 p-3">
            <p className="text-[11px] font-extrabold text-indigo-900 uppercase tracking-wide">First, you</p>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">What can we call you? *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-xl bg-white border border-slate-200 px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 placeholder-slate-300"
              />
            </div>
            <PhoneInput label="Mobile number" value={phone} onChange={setPhone} />
          </div>
        )}
        {error && (
          <p className="text-[11px] text-rose-500 font-bold text-center">{error}</p>
        )}
        <button
          type="submit"
          disabled={busy || code.trim().length < 4}
          className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
        >
          {busy ? 'Joining…' : 'Join Trip'}
        </button>
      </form>
    </div>
  );
};
