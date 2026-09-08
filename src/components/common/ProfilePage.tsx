import React, { useEffect, useState } from 'react';
import { ArrowLeft, User, Phone, Mail, Shield, LogOut, Copy, Check } from 'lucide-react';
import { PhoneInput, isValidPhone } from './PhoneInput';
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
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [choices, setChoices] = useState<Trip[] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setName(profile?.name || '');
    setPhone(profile?.phone || '');
  }, [profile]);

  const isAdmin = profile?.role === 'admin';

  const submitProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (phone && !isValidPhone(phone)) {
      setError('Please enter a valid 10-digit mobile number');
      return;
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
    setChoices(null);
    try {
      const ids = await lookupInvite(clean);
      if (ids.length === 1) {
        await joinOne(ids[0]);
      } else {
        const trips: Trip[] = [];
        for (const id of ids) {
          const { data } = await supabase.from('trips').select('*').eq('id', id).maybeSingle();
          if (data) trips.push(data as unknown as Trip);
        }
        if (trips.length === 0) throw new Error('NOT_FOUND');
        if (trips.length === 1) {
          await joinOne(trips[0].id);
        } else {
          setChoices(trips);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error && err.message === 'NOT_FOUND'
          ? 'No trip found with this code.'
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
      setTimeout(() => setSuccess(null), 2000);
    } catch {
      setError('Could not join right now. Check internet and retry.');
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
            className="flex items-center justify-center w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="font-extrabold text-slate-900 text-lg">Profile</h1>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Profile Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
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
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 mb-1">
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

            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
              <Mail size={12} />
              <span>{profile?.name ? 'Email is set during signup' : 'Email set during signup'}</span>
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
              Save Changes
            </button>
          </form>
        </div>

        {/* Join with Code */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
          <h3 className="font-extrabold text-slate-900 text-sm">Join a Trip</h3>
          <p className="text-[11px] text-slate-500 font-medium -mt-1">
            Enter the invite code your friend shared.
          </p>

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
