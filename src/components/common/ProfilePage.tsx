import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, AtSign, Check, Copy, LogOut, Mail, Phone, Settings, Shield, User, X } from 'lucide-react';
import { PhoneInput, isValidPhone } from './PhoneInput';
import { lookupInvite, joinTripById } from '../../utils/invites';
import { authGetUser, authUpdateProfile, supabase } from '../../utils/supabaseClient';
import { mintCardNo, cardSeed, isValidCardNo, mintUsername, isValidUsername, cleanGender, type Gender } from '../../utils/cards';
import type { UserProfile } from '../../utils/storage';
import type { SharedPhoto, Trip } from '../../types';
import { PostDetailModal } from '../discovery/PostDetailModal';
import { OtpFlow } from './OtpFlow';
import { MomentGridCell } from '../discovery/MomentGridCell';
import { getUserMainPosts } from '../../utils/requests';
import { fetchCommentCounts } from '../../utils/mainFeed';
import { fetchMyBlogs, listDrafts, deleteDraft, deleteBlog, type BlogPost } from '../../utils/blogs';

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
  isAdmin?: boolean;
  onOpenAdmin?: () => void;
  onLogout?: () => void;
  /** Own posts across both timelines (for the My-posts grid). */
  myMoments?: SharedPhoto[];
  allTrips?: Trip[];
  notify?: (msg: string) => void;
  onOpenTrip?: (trip: Trip) => void;
  onEditBlog?: (blogId?: string, draftId?: string) => void;
  onOpenBlog?: (id: string) => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  profile,
  onSave,
  onJoinTrip,
  onBack,
  isAdmin: isAdminProp,
  onOpenAdmin,
  onLogout,
  myMoments = [],
  allTrips = [],
  notify,
  onOpenTrip,
  onEditBlog,
  onOpenBlog,
}) => {
  const [name, setName] = useState(profile?.name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [email, setEmail] = useState('');
  const [savedEmail, setSavedEmail] = useState('');
  const [uid, setUid] = useState<string | null>(null);
  const [serverCardNo, setServerCardNo] = useState('');
  const [copied, setCopied] = useState(false);
  const [serverUsername, setServerUsername] = useState('');
  const [copiedHandle, setCopiedHandle] = useState(false);
  const [gender, setGender] = useState<Gender>('unspecified');
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
  const [serverAdmin, setServerAdmin] = useState(false);
  useEffect(() => {
    authGetUser().then((u) => {
      if (u?.isAdmin) setServerAdmin(true);
    }).catch(() => { });
  }, []);
  const [detailPhoto, setDetailPhoto] = useState<SharedPhoto | null>(null);
  const [showPassOtp, setShowPassOtp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [myBlogs, setMyBlogs] = useState<BlogPost[]>([]);
  const [myDrafts, setMyDrafts] = useState(() => listDrafts());
  useEffect(() => {
    let live = true;
    fetchMyBlogs()
      .then((rows) => {
        if (live) setMyBlogs(rows);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  // Main-timeline posts never enter App photo state — fetch + merge here so
  // My-posts shows EVERYTHING (trip + main), newest first, deduped by id.
  const [mainPosts, setMainPosts] = useState<SharedPhoto[]>([]);
  useEffect(() => {
    if (!uid) return;
    let live = true;
    getUserMainPosts(uid)
      .then((rows) => {
        if (live) setMainPosts(Array.isArray(rows) ? rows : []);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [uid]);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  // My-posts filter: trip moments vs main-timeline posts are merged above —
  // pills let the user split them instead of one mixed grid.
  const [postFilter, setPostFilter] = useState<'all' | 'trip' | 'timeline'>('all');
  const allMyPosts = (() => {
    const seen = new Set<string>();
    const out: SharedPhoto[] = [];
    // uid match first; legacy rows without uid fall back to author-name match.
    const isMine = (p: SharedPhoto) =>
      (!!p.uploadedByUid && !!uid && p.uploadedByUid === uid) ||
      (!p.uploadedByUid && !!name && !!p.uploadedByName && p.uploadedByName === name);
    for (const p of [...myMoments, ...mainPosts]) {
      if (!isMine(p) || seen.has(p.id) || deletedIds.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    return out.sort((a, b) => +new Date(b.uploadedAt || 0) - +new Date(a.uploadedAt || 0));
  })();
  // Comment counts for hover overlays (one batched call).
  useEffect(() => {
    let live = true;
    const ids = allMyPosts.map((p) => p.id);
    if (ids.length === 0) return;
    fetchCommentCounts(ids).then((m) => {
      if (live) setCommentCounts(m);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMyPosts.map((p) => p.id).join(',')]);

  const editorRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const cardSyncedRef = useRef(false);

  useEffect(() => {
    setName(profile?.name || '');
    setPhone(profile?.phone || '');
    setGender(cleanGender(profile?.gender));
  }, [profile]);

  // Current login email (from DB) — change it here, updates the database.
  // Also pulls the server-held pass number + @handle so every device shows the same ones.
  useEffect(() => {
    authGetUser().then((u) => {
      if (u?.uid) {
        setUid(u.uid);
        setEmail(u.email || '');
        setSavedEmail(u.email || '');
        if (isValidCardNo(u.cardNo)) setServerCardNo(u.cardNo.trim());
        if (isValidUsername(u.username)) setServerUsername(u.username.trim().toLowerCase());
        setGender((prev) => (prev !== 'unspecified' ? prev : cleanGender(u.gender)));
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

  // One-time @handle sync: server wins (unique authority); if the server has
  // none yet, backfill it (existing users) so the scheme holds for everyone.
  const handleSyncedRef = useRef(false);
  useEffect(() => {
    if (handleSyncedRef.current || !uid || !profile) return;
    handleSyncedRef.current = true;
    if (serverUsername) {
      if (profile.username !== serverUsername) onSave({ ...profile, username: serverUsername });
    } else if (profile.name?.trim()) {
      authUpdateProfile({ name: profile.name.trim(), phone: profile.phone || '', gender: cleanGender(profile.gender) })
        .then((u) => {
          if (isValidUsername(u.username) && profile.username !== u.username) {
            onSave({ ...profile, username: u.username, gender: cleanGender(u.gender) });
          }
          if (isValidUsername(u.username)) setServerUsername(u.username);
        })
        .catch(() => { });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, serverUsername, profile?.username]);

  const isAdmin = isAdminProp || serverAdmin || profile?.role === 'admin';
  const cardNo = profile?.cardNo && isValidCardNo(profile.cardNo)
    ? profile.cardNo
    : serverCardNo || mintCardNo(cardSeed(savedEmail, uid, profile?.phone));
  const username = profile?.username && isValidUsername(profile.username)
    ? profile.username.trim().toLowerCase()
    : serverUsername || mintUsername(profile?.name || name, cardSeed(savedEmail, uid, profile?.phone));
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

  const copyUsername = async () => {
    try {
      await navigator.clipboard.writeText(`@${username}`);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = `@${username}`;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedHandle(true);
    setTimeout(() => setCopiedHandle(false), 2000);
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
    // Name/phone/cardNo/gender persist to the DB — next login restores THESE values.
    try {
      const updated = await authUpdateProfile({
        name: name.trim(),
        phone: phone.trim(),
        cardNo: isValidCardNo(profile?.cardNo) ? profile!.cardNo : cardNo,
        gender,
      });
      onSave({
        name: updated.name || name.trim(),
        phone: updated.phone ?? phone.trim(),
        cardNo: updated.cardNo || cardNo,
        username: isValidUsername(updated.username) ? updated.username : username,
        gender: cleanGender(updated.gender ?? gender),
      });
      if (isValidCardNo(updated.cardNo)) setServerCardNo(updated.cardNo);
      if (isValidUsername(updated.username)) setServerUsername(updated.username);
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
          <button
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
            title="Settings"
            className="ml-auto p-2 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
          >
            <Settings size={19} />
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 lg:gap-12">
        {/* LEFT: identity panel */}
        <div className="flex flex-col items-center text-center bg-white border border-slate-200 rounded-3xl px-4 py-6 sm:px-7 sm:py-9 h-fit shadow-sm">
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
          <p className="text-[13px] text-slate-500 mt-1 mb-5 sm:mb-8">
            {profile?.joinedAt ? `Member since ${fmtDate(profile.joinedAt)}` : 'Welcome to WanderSync'}
          </p>

          {/* Join a Trip — flat section, no nested box */}
          <div className="w-full border-t border-slate-100 pt-4 sm:pt-5 mt-1 mb-2 text-left">
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
          {/* WanderSync membership pass — fixed ATM ratio on sm+, natural height on phones so the footer never clips */}
          <div
            onClick={scrollToEditor}
            className="relative w-full sm:aspect-[1.586/1] rounded-3xl p-6 sm:p-10 cursor-pointer overflow-hidden transition-transform duration-300 hover:-translate-y-1 border border-slate-300/70"
            style={{
              background: 'linear-gradient(135deg, #ffffff 0%, #edf1f9 28%, #d7deee 50%, #f2f5fb 72%, #dde3f2 100%)',
              boxShadow: '0 25px 50px -12px rgba(30, 41, 59, 0.28), 0 12px 24px rgba(79, 70, 229, 0.12), inset 0 1px 0 #ffffff',
            }}
          >
            <div
              className="absolute top-0 h-full w-[45%]"
              style={{
                left: '-150%',
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.95), transparent)',
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

              {/* EMV smart chip — layered metal with cut contact lines */}
              <div
                className="relative w-[54px] h-[41px] rounded-[8px] overflow-hidden mt-6 sm:mt-8 mb-4 sm:mb-5 flex-shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #f7f9fd 0%, #b7c1d6 35%, #e6ebf4 52%, #a9b4cc 70%, #dbe1ee 100%)',
                  border: '1px solid rgba(71, 85, 105, 0.65)',
                  boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.95), inset 0 -2px 3px rgba(71,85,105,0.35), 0 1px 3px rgba(15,23,42,0.25)',
                }}
              >
                <div className="absolute inset-0" style={{ background: 'linear-gradient(105deg, transparent 25%, rgba(255,255,255,0.85) 42%, transparent 60%)' }} />
                <div className="absolute left-[6%] right-[6%] top-1/2 h-[1.5px] -translate-y-1/2 bg-slate-600/60" />
                <div className="absolute top-[8%] bottom-[8%] left-[32%] w-[1.5px] bg-slate-600/60" />
                <div className="absolute top-[8%] bottom-[8%] right-[32%] w-[1.5px] bg-slate-600/60" />
                <div className="absolute left-[32%] right-[32%] top-[8%] h-[30%] border-x-[1.5px] border-b-[1.5px] border-slate-600/60 rounded-b-[3px]" />
                <div className="absolute left-[32%] right-[32%] bottom-[8%] h-[30%] border-x-[1.5px] border-t-[1.5px] border-slate-600/60 rounded-t-[3px]" />
              </div>

              {/* Card number + copy + secure */}
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <span className="font-mono text-[13px] sm:text-2xl tracking-[0.08em] sm:tracking-[0.14em] text-slate-900 whitespace-nowrap">{cardNo}</span>
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

              <div className="flex flex-col gap-1.5">
                <label className="ui-label">Username — how others find you</label>
                <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 pl-3.5 pr-2 py-3">
                  <AtSign size={15} className="text-indigo-500 flex-shrink-0" />
                  <span className="flex-1 min-w-0 text-sm font-bold text-slate-800 truncate">{username}</span>
                  <button
                    type="button"
                    onClick={copyUsername}
                    title="Copy username"
                    className="p-1.5 rounded-lg text-indigo-500 hover:bg-indigo-50 transition-colors cursor-pointer flex-shrink-0"
                  >
                    {copiedHandle ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 font-medium">Permanent & auto-generated — people search this to send you chat requests.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="ui-label">Gender <span className="normal-case font-medium text-slate-400">(shows as an icon in search)</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {(['male', 'female'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGender(g)}
                      className={`h-11 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                        gender === g
                          ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                          : 'bg-slate-50 border border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600'
                      }`}
                    >
                      {g === 'male' ? 'Male' : 'Female'}
                    </button>
                  ))}
                </div>
                {gender === 'unspecified' && (
                  <p className="text-[11px] text-amber-600 font-medium">Not set — pick one so search shows you right.</p>
                )}
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

      {/* My posts — trip + main timelines together (Instagram grid).
          Main posts never enter App photo state, so they merge in here. */}
      <div className="max-w-5xl mx-auto px-4 pb-4">
        <h3 className="text-sm font-extrabold text-slate-900 mb-0.5">
          My posts · {allMyPosts.length}
        </h3>
        <p className="text-[11px] text-slate-400 font-medium mb-2">Photos & moments you shared — these also show in the Discover feed and trips. Blogs never appear here.</p>
        {(() => {
          const tripPosts = allMyPosts.filter((p) => !!p.tripId);
          const timelinePosts = allMyPosts.filter((p) => !p.tripId);
          const visiblePosts = postFilter === 'trip' ? tripPosts : postFilter === 'timeline' ? timelinePosts : allMyPosts;
          const pill = (id: 'all' | 'trip' | 'timeline', label: string, n: number) => (
            <button
              key={id}
              onClick={() => setPostFilter(id)}
              className={`flex-shrink-0 h-7 px-3 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${
                postFilter === id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500'
              }`}
            >
              {label} · {n}
            </button>
          );
          return (
            <>
              <div className="flex gap-1.5 mb-2.5">
                {pill('all', 'All', allMyPosts.length)}
                {pill('trip', 'Trip posts', tripPosts.length)}
                {pill('timeline', 'Timeline', timelinePosts.length)}
              </div>
              {visiblePosts.length === 0 ? (
                <p className="text-[11px] text-slate-400 text-center py-6 bg-white rounded-2xl border border-slate-200/70">
                  {allMyPosts.length === 0
                    ? 'Nothing posted yet — moments you share will appear here.'
                    : postFilter === 'trip'
                      ? 'No trip posts yet — moments you add inside a trip will appear here.'
                      : 'No timeline posts yet — moments you share to Discover will appear here.'}
                </p>
              ) : (
                <div
                  className="grid grid-cols-5 gap-2"
                  style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}
                >
                  {visiblePosts.map((p) => (
              <div key={p.id} className="relative group min-w-0">
                <MomentGridCell
                  photo={p}
                  onOpen={() => setDetailPhoto(p)}
                  likes={Number(p.likesCount || 0)}
                  comments={commentCounts[p.id] ?? 0}
                />
                <button
                  onClick={() => {
                    if (!window.confirm('Delete this post everywhere? Discover, stories and timelines will lose it permanently.')) return;
                    import('../../utils/momentsSync').then(({ deleteMomentRemote }) =>
                      deleteMomentRemote(p.id).then(() => {
                        setDeletedIds((prev) => new Set(prev).add(p.id));
                        setMainPosts((prev) => prev.filter((x) => x.id !== p.id));
                        notify?.('Post deleted everywhere.');
                        try {
                          window.dispatchEvent(new CustomEvent('ws_blogs_changed'));
                          window.dispatchEvent(new CustomEvent('ws_moments_changed'));
                        } catch { /* ignore */ }
                      }).catch(() => notify?.('Could not delete. Check internet and retry.'))
                    );
                  }}
                  aria-label="Delete post everywhere"
                  title="Delete post everywhere"
                  className="absolute top-1 right-1 p-1 rounded-full bg-black/55 text-white opacity-0 group-hover:opacity-100 hover:bg-rose-600 cursor-pointer"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
                </div>
              )}
            </>
          );
        })()}
      </div>
      {/* My stories — blogs + autosaved drafts */}
      <div className="max-w-5xl mx-auto px-4 pb-4">
        <div className="flex items-center justify-between mb-0.5">
          <h3 className="text-sm font-extrabold text-slate-900">
            My stories · {myBlogs.length}
          </h3>
          <button
            onClick={() => onEditBlog?.()}
            className="h-8 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold cursor-pointer"
          >
            + Write
          </button>
        </div>
        <p className="text-[11px] text-slate-400 font-medium mb-2.5">Your blogs — unpublished drafts stay on top, posted stories go live in Discover → Community after admin approval.</p>
        {myDrafts.length > 0 && (
          <>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 mb-1.5">Drafts · only you see these</p>
            <div className="mb-2.5 space-y-1.5">
            {myDrafts.slice(0, 3).map((d) => (
              <div
                key={d.id}
                className="w-full flex items-center gap-2 bg-amber-50/60 border border-amber-200/60 rounded-xl px-3 py-2"
              >
                <button
                  onClick={() => onEditBlog?.(d.blogId, d.id)}
                  className="min-w-0 flex-1 text-left cursor-pointer"
                >
                  <span className="block text-[11px] font-bold text-slate-700 truncate">
                    Draft: {d.title || '(untitled)'}
                  </span>
                  <span className="block text-[10px] text-slate-400 font-medium">Tap to resume</span>
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('Delete this draft?')) {
                      deleteDraft(d.id);
                      setMyDrafts(listDrafts());
                    }
                  }}
                  aria-label="Delete draft"
                  title="Delete draft"
                  className="p-1.5 rounded-full text-slate-300 hover:text-rose-500 hover:bg-rose-50 cursor-pointer flex-shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            </div>
          </>
        )}
        {myBlogs.length === 0 && myDrafts.length === 0 ? (
          <p className="text-[11px] text-slate-400 text-center py-6 bg-white rounded-2xl border border-slate-200/70">
            No stories yet — write your first travel story.
          </p>
        ) : (
          <>
            {myBlogs.length > 0 && (
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">Posted · Edit or delete anytime</p>
            )}
            <div className="space-y-1.5">
            {myBlogs.map((b) => (
              <div key={b.id} className="flex items-center gap-2 bg-white border border-slate-200/70 rounded-xl px-3 py-2">
                <button onClick={() => onOpenBlog?.(b.id)} className="min-w-0 flex-1 text-left cursor-pointer">
                  <span className="block text-xs font-bold text-slate-800 truncate">{b.title || '(untitled)'}</span>
                  <span className="block text-[10px] text-slate-400 font-medium">
                    {b.status}
                    {b.status === 'pending' ? ' · in review' : ''}
                    {b.status === 'rejected' ? ' · needs changes' : ''} · {b.views} reads
                  </span>
                </button>
                <button
                  onClick={() => onEditBlog?.(b.id)}
                  className="flex-shrink-0 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    if (!window.confirm(`Delete "${b.title || '(untitled)'}" everywhere? Discover, My posts, login cards and search will lose it (with its photos) permanently.`)) return;
                    void deleteBlog(b.id).then(() => {
                      setMyBlogs((prev) => prev.filter((x) => x.id !== b.id));
                      notify?.('Story deleted everywhere.');
                      try {
                        window.dispatchEvent(new CustomEvent('ws_blogs_changed'));
                        window.dispatchEvent(new CustomEvent('ws_moments_changed'));
                      } catch { /* ignore */ }
                    }).catch(() => notify?.('Could not delete. Check internet and retry.'));
                  }}
                  aria-label="Delete story everywhere"
                  title="Delete story everywhere"
                  className="flex-shrink-0 p-1.5 rounded-full text-slate-300 hover:text-rose-500 hover:bg-rose-50 cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            </div>
          </>
        )}
      </div>
      {detailPhoto && (
        <PostDetailModal
          photo={detailPhoto}
          trips={allTrips}
          myUid={uid}
          myName={name || profile?.name}
          notify={(msg) => notify?.(msg)}
          onClose={() => setDetailPhoto(null)}
          onOpenTrip={(t) => {
            setDetailPhoto(null);
            onOpenTrip?.(t);
          }}
          onDeleted={(id) => {
            setDetailPhoto(null);
            setDeletedIds((prev) => new Set(prev).add(id));
            setMainPosts((prev) => prev.filter((x) => x.id !== id));
            try {
              window.dispatchEvent(new CustomEvent('ws_blogs_changed'));
              window.dispatchEvent(new CustomEvent('ws_moments_changed'));
            } catch { /* ignore */ }
          }}
          onLiked={(id, count, liked) => {
            setDetailPhoto((d) => (d && d.id === id ? { ...d, likesCount: count, likedByMe: liked } : d));
          }}
          onEdited={(updated) => {
            setDetailPhoto((d) => (d && d.id === updated.id ? { ...d, ...updated } : d));
          }}
        />
      )}

      {/* Settings — gear opens this: account details, password, logout */}
      {showSettings && (
        <div className="fixed inset-0 z-[60] bg-slate-50 flex flex-col" role="dialog" aria-modal="true">
          <div className="bg-white/95 backdrop-blur border-b border-slate-200 flex-shrink-0">
            <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
              <button
                onClick={() => setShowSettings(false)}
                aria-label="Back to profile"
                className="p-1.5 -ml-1 rounded-full text-slate-700 hover:text-indigo-600 hover:bg-slate-100 cursor-pointer"
              >
                <ArrowLeft size={20} strokeWidth={2} />
              </button>
              <h2 className="text-sm font-extrabold text-slate-900">Settings</h2>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="max-w-2xl mx-auto px-4 pt-5 pb-32 space-y-3">
              <div className="bg-white border border-slate-200/70 rounded-2xl p-4">
                <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2">Account</h3>
                {[
                  ['Email', savedEmail || email || '—'],
                  ['Username', username ? `@${username}` : '—'],
                  ['Pass number', serverCardNo || cardNo || '—'],
                ].map(([label, value]) => (
                  <p key={label} className="flex justify-between gap-3 py-1.5 border-b border-slate-50 last:border-0">
                    <span className="text-[11px] font-bold text-slate-400">{label}</span>
                    <span className="text-xs font-bold text-slate-800 truncate">{value}</span>
                  </p>
                ))}
              </div>
              <div className="bg-white border border-slate-200/70 rounded-2xl p-4">
                <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2">Password</h3>
                {!showPassOtp ? (
                  <button
                    type="button"
                    onClick={() => setShowPassOtp(true)}
                    className="w-full h-11 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold cursor-pointer"
                  >
                    Set / reset password via email code
                  </button>
                ) : (
                  <OtpFlow
                    purpose="reset"
                    initialEmail={savedEmail || email}
                    onDone={() => {
                      setShowPassOtp(false);
                      notify?.('Password updated! Use it next login.');
                    }}
                    onBack={() => setShowPassOtp(false)}
                  />
                )}
              </div>
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="w-full h-11 rounded-xl bg-white border border-slate-200 hover:border-rose-300 text-rose-500 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogOut size={15} strokeWidth={2.5} />
                  Logout Account
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
