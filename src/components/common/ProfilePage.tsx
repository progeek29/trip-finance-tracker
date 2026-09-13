import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, LogOut, Mail, Phone, Shield, User } from 'lucide-react';
import { PhoneInput, isValidPhone } from './PhoneInput';
import { lookupInvite, joinTripById } from '../../utils/invites';
import { authGetUser, authUpdateProfile, supabase } from '../../utils/supabaseClient';
import { mintCardNo, cardSeed, isValidCardNo } from '../../utils/cards';
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
  const [serverCardNo, setServerCardNo] = useState('');
  const [copied, setCopied] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  // Editor vs Join-card messages are SEPARATE states — a shared one leaked
  // "Profile updated!" under Join a Trip (and join errors into the editor).
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinMsg, setJoinMsg] = useState<string | null>(null);
  const [choices, setChoices] = useState<Trip[] | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const cardSyncedRef = useRef(false);

  useEffect(() => {
    setName(profile?.name || '');
    setPhone(profile?.phone || '');
  }, [profile]);

  // Current login email (from DB) — change it here, updates the database.
  // Also pulls the server-held pass number so every device shows the same one.
  useEffect(() => {
    authGetUser().then((u) => {
      if (u?.uid) {
        setUid(u.uid);
        setEmail(u.email || '');
        setSavedEmail(u.email || '');
        if (isValidCardNo(u.cardNo)) setServerCardNo(u.cardNo.trim());
      }
    }).catch(() => { });
  }, []);

  // One-time pass-number sync: server wins; if the server has none yet,
  // backfill it (existing users) so the scheme holds for everyone.
  useEffect(() => {
    if (cardSyncedRef.current || !uid || !profile) return;
    cardSyncedRef.current = true;
    if (serverCardNo) {
      if (profile.cardNo !== serverCardNo) onSave({ ...profile, cardNo: serverCardNo });
    } else if (profile.name?.trim()) {
      const minted = mintCardNo(cardSeed(savedEmail, uid, profile.phone));
      authUpdateProfile({ name: profile.name.trim(), phone: profile.phone || '', cardNo: minted })
        .then((u) => {
          if (profile.cardNo !== u.cardNo) onSave({ ...profile, cardNo: u.cardNo });
        })
        .catch(() => { });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, serverCardNo, profile?.cardNo]);

  const isAdmin = profile?.role === 'admin';
  const cardNo = profile?.cardNo && isValidCardNo(profile.cardNo)
    ? profile.cardNo
    : serverCardNo || mintCardNo(cardSeed(savedEmail, uid, profile?.phone));
  const displayName = (name.trim() || 'Your Name').toUpperCase();

  const copyCardNo = async () => {
    try {
      await navigator.clipboard.writeText(cardNo.replace(/\s/g, ''));
    } catch {
      const ta = document.createElement('textarea');
      ta.value = cardNo.replace(/\s/g, '');
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
    setSaveError(null);
    setSaveMsg(null);
    if (!name.trim()) {
      setSaveError('Please enter your name');
      return;
    }
    if (phone && !isValidPhone(phone)) {
      setSaveError('Please enter a valid 10-digit mobile number');
      return;
    }
    // Email saves together with the profile (no separate button).
    if (email.trim().toLowerCase() !== savedEmail.toLowerCase()) {
      const emailOk = await updateEmail();
      if (!emailOk) return;
    }
    // Name/phone/cardNo persist to the DB — next login restores THESE values.
    try {
      const updated = await authUpdateProfile({
        name: name.trim(),
        phone: phone.trim(),
        cardNo: isValidCardNo(profile?.cardNo) ? profile!.cardNo : cardNo,
      });
      onSave({ name: updated.name || name.trim(), phone: updated.phone ?? phone.trim(), cardNo: updated.cardNo || cardNo });
      if (isValidCardNo(updated.cardNo)) setServerCardNo(updated.cardNo);
      setSaveMsg('Profile updated!');
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save. Check internet and retry.');
    }
  };

  const lookup = async () => {
    const clean = code.trim().toUpperCase();
    if (clean.length < 4) {
      setJoinError('Enter the code.');
      return;
    }
    setBusy(true);
    setJoinError(null);
    setJoinMsg(null);
    setChoices(null);
    try {
      const ids = await lookupInvite(clean);
      await joinOne(ids[0]);
    } catch (err) {
      setJoinError(
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
      setJoinMsg(`Joined "${trip.title}"!`);
      setCode('');
      setTimeout(() => setJoinMsg(null), 2500);
    } catch (err) {
      setJoinError(
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

  const scrollToEditor = () => {
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => nameInputRef.current?.focus(), 600);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <style>{`@keyframes ws-gleam { 0% { left: -150%; } 30% { left: 150%; } 100% { left: 150%; } }`}</style>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center justify-center p-1 text-slate-700 hover:text-indigo-600 transition-colors cursor-pointer"
          >
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
          <h1 className="font-extrabold text-slate-900 text-lg font-display tracking-tight">Profile</h1>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 lg:gap-12">
        {/* LEFT: identity panel */}
        <div className="flex flex-col items-center text-center bg-white border border-slate-200 rounded-3xl px-7 py-9 h-fit shadow-sm">
          <div className="relative w-[110px] h-[110px] rounded-full p-[3px] bg-gradient-to-br from-indigo-600 to-indigo-300 mb-5">
            <div className="w-full h-full rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-4xl font-extrabold border-[3px] border-white">
              {name ? name.charAt(0).toUpperCase() : <User size={40} />}
            </div>
          </div>

          <h2 className="text-[22px] font-bold text-slate-900 font-display tracking-tight">{displayName}</h2>
          {isAdmin && (
            <span className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-700 border border-indigo-200">
              <Shield size={10} /> ADMIN
            </span>
          )}
          <p className="text-[13px] text-slate-500 mt-1 mb-8">
            {profile?.joinedAt ? `Member since ${fmtDate(profile.joinedAt)}` : 'Welcome to WanderSync'}
          </p>

          {/* Join a Trip */}
          <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 text-left mb-4">
            <h3 className="text-sm font-bold text-slate-900 font-display mb-1.5">Join a Trip</h3>
            <p className="text-xs text-slate-500 leading-relaxed mb-3.5">
              Enter an invitation code to instantly sync itineraries with your travel group.
            </p>
            {!choices ? (
              <div className="flex gap-2">
                <input
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
                    setJoinError(null);
                  }}
                  placeholder="e.g. GOA4X8"
                  className="flex-1 min-w-0 rounded-xl bg-white border border-slate-200 px-3 py-2.5 text-center text-sm font-extrabold tracking-[0.25em] text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 placeholder-slate-300 placeholder:tracking-normal placeholder:text-xs placeholder:font-medium"
                />
                <button
                  onClick={lookup}
                  disabled={busy || code.trim().length < 4}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer flex-shrink-0 transition-colors"
                >
                  {busy ? '...' : 'Sync In'}
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[11px] text-slate-500 font-medium">Pick a trip to join:</p>
                {choices.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => joinOne(t.id)}
                    disabled={busy}
                    className="w-full text-left p-3 rounded-xl bg-white hover:bg-indigo-50 border border-slate-200 text-xs cursor-pointer transition-colors"
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
            {joinError && <p className="text-[11px] text-rose-500 font-bold mt-2">{joinError}</p>}
            {joinMsg && <p className="text-[11px] text-emerald-600 font-bold mt-2">{joinMsg}</p>}
          </div>

          {isAdmin && onOpenAdmin && (
            <button
              onClick={onOpenAdmin}
              className="w-full py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold cursor-pointer transition-colors"
            >
              Admin Dashboard
            </button>
          )}
        </div>

        {/* RIGHT: premium pass + editor */}
        <div className="flex flex-col min-w-0">
          {/* WanderSync membership pass */}
          <div
            onClick={scrollToEditor}
            className="relative w-full aspect-[1.586/1] rounded-3xl p-6 sm:p-10 cursor-pointer overflow-hidden transition-transform duration-300 hover:-translate-y-1"
            style={{
              background: 'linear-gradient(135deg, #ffffff 0%, #f3f6fc 55%, #e2e7f5 100%)',
              boxShadow: '0 35px 70px rgba(79, 70, 229, 0.12), inset 0 0 0 1px rgba(255,255,255,0.8)',
            }}
          >
            <div
              className="absolute top-0 h-full w-[60%]"
              style={{
                left: '-150%',
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
                transform: 'skewX(-20deg)',
                animation: 'ws-gleam 8.5s infinite ease-in-out',
              }}
            />

            <div className="relative h-full flex flex-col">
              <div className="flex justify-between items-center">
                <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 tracking-[0.2em]">GLOBAL ACCESS</span>
              </div>
              <div className="font-display font-extrabold text-[26px] sm:text-3xl tracking-tight leading-none mt-1">
                <span className="text-slate-900">Wander</span><span className="text-slate-400">Sync</span>
              </div>

              {/* Glossy EMV smart chip */}
              <div
                className="relative w-[46px] h-[35px] rounded-md border border-black/10 overflow-hidden mt-6 sm:mt-8 mb-4 sm:mb-5"
                style={{ background: 'linear-gradient(135deg, #eef1f7 0%, #c9d1e2 50%, #dde3ef 100%)' }}
              >
                <div className="absolute inset-0" style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.75) 45%, transparent 60%)' }} />
                <div className="absolute left-0 right-0 top-1/2 h-px bg-slate-500/40" />
                <div className="absolute top-0 bottom-0 left-[30%] w-px bg-slate-500/40" />
                <div className="absolute top-0 bottom-0 right-[30%] w-px bg-slate-500/40" />
                <div className="absolute left-[30%] right-[30%] top-0 h-[35%] border-x border-b border-slate-500/40 rounded-b-sm" />
                <div className="absolute left-[30%] right-[30%] bottom-0 h-[35%] border-x border-t border-slate-500/40 rounded-t-sm" />
              </div>

              {/* Card number + copy + secure */}
              <div className="flex items-center gap-2">
                <span className="font-mono text-base sm:text-2xl tracking-[0.14em] text-slate-900">{cardNo}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); copyCardNo(); }}
                  title="Copy card number"
                  className="p-1.5 rounded-lg text-indigo-500 hover:bg-indigo-50 transition-colors cursor-pointer flex-shrink-0"
                >
                  {copied ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
                </button>
                <Shield size={15} className="text-indigo-300 ml-auto flex-shrink-0" />
              </div>
              <p className="text-[9px] sm:text-[10px] font-semibold text-slate-400 tracking-[0.2em] mt-1.5">SECURE MEMBER IDENTITY</p>

              <div className="mt-auto">
                <div className="w-full border-t border-slate-200" />
                <div className="flex justify-between items-end pt-2.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-slate-500 font-semibold tracking-wider">PASSHOLDER</span>
                    <span className="text-[13px] font-bold text-slate-900 truncate max-w-[180px] sm:max-w-none">{displayName}</span>
                  </div>
                  <div className="flex flex-col gap-0.5 text-right">
                    <span className="text-[9px] text-slate-500 font-semibold tracking-wider">VALID THRU</span>
                    <span className="text-[13px] font-bold text-slate-900">Lifetime Pass</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Editor */}
          <div ref={editorRef} className="mt-6 sm:mt-10 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm" style={{ scrollMarginTop: 24 }}>
            <div className="mb-6 pb-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900 font-display">Edit Pass Information</h2>
              <p className="text-xs text-slate-500 mt-1">Update your public account attributes below. Your card number sequence is permanent and securely locked.</p>
            </div>

            <form onSubmit={submitProfile} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="ui-label">Name</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><User size={15} /></span>
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="What should we call you?"
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 pl-10 pr-3.5 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 placeholder-slate-300"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="ui-label">Email Address</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><Mail size={15} /></span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setEmailMsg(null); }}
                    placeholder="you@email.com"
                    className="w-full rounded-xl bg-slate-50 border border-slate-200 pl-10 pr-3.5 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 placeholder-slate-300"
                  />
                </div>
                {emailMsg && (
                  <p className={`text-[11px] font-bold rounded-lg px-3 py-1.5 ${emailMsg.ok ? 'text-emerald-600 bg-emerald-50' : 'text-rose-500 bg-rose-50'}`}>
                    {emailMsg.text}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="ui-label">Mobile Number</label>
                <PhoneInput value={phone} onChange={setPhone} icon={<Phone size={15} />} />
              </div>

              {saveError && (
                <p className="text-[11px] text-rose-500 bg-rose-50 rounded-lg px-3 py-2 font-bold">{saveError}</p>
              )}
              {saveMsg && (
                <p className="text-[11px] text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2 font-bold">{saveMsg}</p>
              )}

              <div className="flex justify-center mt-2">
                <button
                  type="submit"
                  disabled={emailBusy}
                  className="px-10 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold cursor-pointer transition-colors"
                >
                  {emailBusy ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Logout — end of page */}
      {onLogout && (
        <div className="max-w-5xl mx-auto px-4 pb-10 flex justify-center">
          <button
            onClick={onLogout}
            className="flex items-center gap-2 text-[13px] font-bold text-red-500 hover:bg-red-50 px-6 py-2.5 rounded-xl transition-colors cursor-pointer"
          >
            <LogOut size={16} strokeWidth={2.5} />
            Logout Account
          </button>
        </div>
      )}
    </div>
  );
};
