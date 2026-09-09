import React, { useState } from 'react';
import { Logo } from '../common/Logo';
import { PhoneInput, isValidPhone } from '../common/PhoneInput';
import type { UserProfile } from '../../utils/storage';
import { getAdminStatus } from '../../utils/storage';
import { supabase, ensureCloudUser } from '../../utils/supabaseClient';

interface WelcomeScreenProps {
  onDone: (profile: UserProfile, inviteCode?: string) => Promise<void>;
}

/**
 * First launch: name + mobile + optional invite code on ONE screen.
 * Code entered → Join Trip button. No code → Save button.
 * Join stays available later on My Trips for existing users.
 */
export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onDone }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCode = code.trim().length >= 4;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please tell us what we can call you.');
      return;
    }
    if (phone && !isValidPhone(phone)) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const role = getAdminStatus(name.trim(), phone.trim()) ? 'admin' : undefined;
      // Save user to Supabase users table
      try {
        const u = await ensureCloudUser();
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('users').upsert({
          id: u.uid,
          email: user?.email || '',
          name: name.trim(),
          phone: phone.trim(),
          role: role || 'user',
        });
      } catch { /* best effort */ }
      await onDone(
        { name: name.trim(), phone: phone.trim(), role },
        hasCode ? code.trim().toUpperCase() : undefined
      );
    } catch (err) {
      setError(
        err instanceof Error && err.message === 'NOT_FOUND'
          ? 'No trip found with this code. Check the letters, or save and join later from My Trips.'
          : 'Something went wrong. Check internet and retry.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <form onSubmit={submit} className="max-w-sm w-full bg-white rounded-3xl border border-slate-200 shadow-xl p-7 space-y-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo size={52} />
          <h1 className="text-xl font-extrabold text-slate-900 font-display">Welcome to WanderSync</h1>
          <p className="text-xs text-slate-500 font-medium">Tell us who you are — and join your squad if you have a code.</p>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-700 mb-1">What can we call you? *</label>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 placeholder-slate-300"
          />
        </div>
        <PhoneInput label="Mobile number" value={phone} onChange={setPhone} />
        <div>
          <label className="block text-[11px] font-bold text-slate-700 mb-1">Invite code</label>
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
              setError(null);
            }}
            placeholder="e.g. GOA4X8"
            className="w-full rounded-2xl bg-slate-50 border border-slate-200 px-4 py-2.5 text-center text-lg font-extrabold tracking-[0.3em] text-slate-900 focus:outline-none focus:border-indigo-500 placeholder-slate-300 placeholder:tracking-normal placeholder:text-sm placeholder:font-medium"
          />
        </div>
        {error && (
          <p className="text-[11px] text-rose-500 font-bold text-center">{error}</p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold cursor-pointer"
        >
          {busy ? (hasCode ? 'Joining…' : 'Saving…') : hasCode ? 'Join Trip' : 'Save'}
        </button>
      </form>
    </div>
  );
};
