import React, { useEffect, useState } from 'react';
import { ArrowLeft, User, Phone, Mail, Shield, LogOut, Pencil } from 'lucide-react';
import { PhoneInput, isValidPhone } from './PhoneInput';
import { SmoothExpand } from './SmoothExpand';
import { lookupInvite, joinTripById } from '../../utils/invites';
import { supabase } from '../../utils/supabaseClient';
import type { UserProfile } from '../../utils/storage';
import type { Trip } from '../../types';

function fmtDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

interface ProfilePageProps {
  profile: UserProfile | null;
  onSave: (profile: UserProfile) => void;
  onJoinTrip: (trip: Trip) => void;
  onBack: () => void;
  onOpenAdmin?: () => void;
  onLogout?: () => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  profile,
  onSave,
  onJoinTrip,
  onBack,
  onOpenAdmin,
  onLogout,
}) => {
  const [name, setName] = useState(profile?.name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [email, setEmail] = useState('');
  const [savedEmail, setSavedEmail] = useState('');
  const [uid, setUid] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [choices, setChoices] = useState<Trip[] | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setName(profile?.name || '');
    setPhone(profile?.phone || '');
  }, [profile]);

  // Current login email (from DB) — change it here, updates the database
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user as { id?: string; email?: string } | null;
      if (u?.id) {
        setUid(u.id);
        setEmail(u.email || '');
        setSavedEmail(u.email || '');
      }
    }).catch(() => { });
  }, []);

  const isAdmin = profile?.role === 'admin';

  const updateEmail = async (): Promise<boolean> => {
    const clean = email.trim().toLowerCase();
    setEmailMsg(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setEmailMsg({ ok: false, text: 'Enter a valid email address.' });
      return false;
    }
    if (!uid) {
      setEmailMsg({ ok: false, text: 'Login session missing — logout & login again.' });
      return false;
    }
    if (clean === savedEmail.toLowerCase()) return true;
    setEmailBusy(true);
    try {
      const { error } = await supabase.from('users').update({ email: clean }).eq('id', uid);
      if (error) throw new Error(error.message || 'update failed');
      setSavedEmail(clean);
      setEmailMsg({ ok: true, text: 'Email updated! Login next time with the new email.' });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setEmailMsg({
        ok: false,
        text: /unique|duplicate|already/i.test(msg) ? 'This email is already registered.' : 'Could not update email. Check internet and retry.',
      });
      return false;
    } finally {
      setEmailBusy(false);
    }
  };

  const submitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (phone && !isValidPhone(phone)) {
      setError('Please enter a valid 10-digit mobile number');
      return;
    }
    // Email saves together with the profile (no separate button).
    if (email.trim().toLowerCase() !== savedEmail.toLowerCase()) {
      const emailOk = await updateEmail();
      if (!emailOk) return;
    }
    onSave({ name: name.trim(), phone: phone.trim() });
    setSuccess('Profile updated!');
    setTimeout(() => setSuccess(null), 2000);
  };

  const lookup = async () => {
    const clean = code.trim().toUpperCase();
    if (clean.length < 4) {
      setError('Enter the code.');
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    setChoices(null);
    try {
      const ids = await lookupInvite(clean);
      await joinOne(ids[0]);
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

  const joinOne = async (tripId: string) => {
    setBusy(true);
    try {
      const trip = await joinTripById(tripId);
      onJoinTrip(trip);
      setSuccess(`Joined "${trip.title}"!`);
      setCode('');
      setTimeout(() => setSuccess(null), 2500);
    } catch (err) {
      setError(
        err instanceof Error && err.message === 'NOT_FOUND'
          ? 'That trip no longer exists.'
          : err instanceof Error && err.message === 'NOT_LOGGED_IN'
            ? 'Please log in again, then retry.'
            : 'Could not join right now. Check internet and retry.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center justify-center p-1 text-slate-700 hover:text-indigo-600 transition-colors cursor-pointer"
          >
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
          <h1 className="font-extrabold text-slate-900 text-lg font-display tracking-tight">Profile</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Profile Card */}
        <div className="ui-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl font-extrabold">
              {name ? name.charAt(0).toUpperCase() : <User size={24} />}
            </div>
            <div>
              <h2 className="font-extrabold text-slate-900 text-lg">{name || 'Your Name'}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                {isAdmin && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-700 border border-indigo-200">
                    <Shield size={10} /> ADMIN
                  </span>
                )}
                {profile?.joinedAt && (
                  <span className="text-[11px] text-slate-500 font-medium">
                    Member since {fmtDate(profile.joinedAt)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <form onSubmit={submitProfile} className="space-y-3">
            <div>
              <label className="flex items-center gap-1.5 ui-label mb-1">
                <User size={12} /> Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What should we call you?"
                className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 placeholder-slate-300"
              />
            </div>

            <PhoneInput label="Mobile number" value={phone} onChange={setPhone} />

            <div>
              <label className="flex items-center gap-1.5 ui-label mb-1">
                <Mail size={12} /> Email (login ID)
              </label>
              <div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailMsg(null); }}
                  placeholder="you@email.com"
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 placeholder-slate-300"
                />
              </div>
              {emailMsg && (
                <p className={`mt-1.5 text-[11px] font-bold rounded-lg px-3 py-1.5 ${emailMsg.ok ? 'text-emerald-600 bg-emerald-50' : 'text-rose-500 bg-rose-50'}`}>
                  {emailMsg.text}
                </p>
              )}
            </div>

            {error && (
              <p className="text-[11px] text-rose-500 bg-rose-50 rounded-lg px-3 py-2 font-bold">{error}</p>
            )}
            {success && (
              <p className="text-[11px] text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2 font-bold">{success}</p>
            )}

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer transition-colors"
            >
              Save
            </button>
          </form>
        </div>

        {/* Join with Code — walkie-style button, smooth expand inline (not a popup) */}
        <div className="space-y-3">
          <button
            onClick={() => setJoinOpen((v) => !v)}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-sm font-extrabold shadow-lg shadow-indigo-200 active:scale-[0.99] transition-all cursor-pointer focus:outline-none"
          >
            Join a Trip
          </button>
          <SmoothExpand open={joinOpen}>
            <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
              {!choices ? (
                <>
                  <div className="flex gap-2">
                    <input
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
                        setError(null);
                      }}
                      placeholder="e.g. GOA4X8"
                      className="flex-1 min-w-0 rounded-xl bg-slate-50 border border-slate-200 px-4 py-2.5 text-center text-lg font-extrabold tracking-[0.3em] text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 placeholder-slate-300 placeholder:tracking-normal placeholder:text-sm placeholder:font-medium"
                    />
                    <button
                      onClick={lookup}
                      disabled={busy || code.trim().length < 4}
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer flex-shrink-0 transition-colors"
                    >
                      {busy ? '...' : 'Join'}
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
                      className="w-full text-left p-3 rounded-xl bg-slate-50 hover:bg-indigo-50 border border-slate-200 text-xs cursor-pointer transition-colors"
                    >
                      <span className="block font-extrabold text-slate-900 truncate">{t.title}</span>
                      <span className="block text-[11px] text-slate-500">{t.startDate} • {t.members?.length || 0} members</span>
                    </button>
                  ))}
                  <button onClick={() => setChoices(null)} className="w-full text-[11px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer">
                    Use a different code
                  </button>
                </div>
              )}
            </div>
          </SmoothExpand>
        </div>

        {/* Admin + Logout */}
        <div className="space-y-2">
          {isAdmin && onOpenAdmin && (
            <button
              onClick={onOpenAdmin}
              className="w-full py-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold cursor-pointer transition-colors"
            >
              Admin Dashboard
            </button>
          )}
          {onLogout && (
            <button
              onClick={onLogout}
              className="w-full py-3 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-xs font-bold cursor-pointer transition-colors flex items-center justify-center gap-2"
            >
              <LogOut size={14} />
              Logout
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
