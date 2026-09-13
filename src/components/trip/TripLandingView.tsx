import React, { useState, useRef, useEffect } from 'react';
import { Trip, Expense } from '../../types';
import { MemberAvatar } from '../common/MemberAvatar';
import { Logo } from '../common/Logo';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { BUILD_TAG } from '../../utils/version';
import { viewerBudget } from '../../utils/budget';
import { tripOwnerUid } from '../../utils/budget';
import { MediaImg } from '../common/MediaImg';
import {
  MapPin, Calendar, Users, User, Wallet, ChevronRight,
  MoreVertical, Edit2, Trash2, Plane, CheckCircle2,
  Clock, Zap, Star, Share2, Globe, Plus, Bell
} from 'lucide-react';

interface TripLandingViewProps {
  trips: Trip[];
  expenses: Expense[];
  onSelectTrip: (trip: Trip) => void;
  onCreateTrip: () => void;
  onEditTrip: (trip: Trip) => void;
  onDeleteTrip: (tripId: string) => void;
  userName?: string;
  userId?: string | null;
  onOpenProfile?: () => void;
  onShareTrip: (trip: Trip) => void;
  myUid?: string | null;
  ownerFilter?: 'all' | 'owned' | 'joined';
  onOwnerFilterChange?: (f: 'all' | 'owned' | 'joined') => void;
  unreadCount?: number;
  onBellClick?: () => void;
  /** Bumps on every new notification → bell jiggles + vibrates (same as trip header). */
  bellPulse?: number;
}

const STATUS_META = {
  inprogress: { label: 'In Progress', bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: Zap },
  upcoming: { label: 'Upcoming', bg: 'bg-sky-100', text: 'text-sky-700', dot: 'bg-sky-500', icon: Clock },
  completed: { label: 'Completed', bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-400', icon: CheckCircle2 },
};

const STATUS_LABEL: Record<'inprogress' | 'upcoming' | 'completed', string> = {
  inprogress: 'In Progress',
  upcoming: 'Upcoming',
  completed: 'Completed',
};

function formatDateRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()} – ${e.getDate()} ${months[e.getMonth()]} ${e.getFullYear()}`;
  }
  return `${s.getDate()} ${months[s.getMonth()]} – ${e.getDate()} ${months[e.getMonth()]} ${e.getFullYear()}`;
}

function getDaysLeft(trip: Trip): string | null {
  const status = liveTripStatus(trip);
  if (status === 'completed') return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const start = new Date(trip.startDate + 'T00:00:00').getTime();
  const end = new Date(trip.endDate + 'T00:00:00').getTime();
  if (status === 'inprogress') {
    if (isNaN(start) || isNaN(end) || end < start) return 'In Progress';
    const total = Math.ceil((end - start) / 86400000) + 1;
    const day = Math.min(total, Math.max(1, Math.floor((today - start) / 86400000) + 1));
    return `Day ${day} of ${total}`;
  }
  if (isNaN(start)) return null;
  const diff = Math.round((start - today) / 86400000);
  if (diff <= 0) return 'Starts today';
  if (diff === 1) return 'Starts tomorrow';
  return `${diff} days to go`;
}

/** Live status from dates — always computed, never a stored fixed value. */
export function liveTripStatus(trip: Trip): 'upcoming' | 'inprogress' | 'completed' {
  const now = Date.now();
  const s = new Date(trip.startDate + 'T00:00:00').getTime();
  const e = new Date(trip.endDate + 'T00:00:00').getTime();
  if (isNaN(s)) return 'upcoming';
  if (now < s) return 'upcoming';
  if (!isNaN(e) && now <= e + 86400000) return 'inprogress';
  if (isNaN(e)) return 'inprogress';
  return 'completed';
}

function TripCard({
  trip,
  expenses,
  onSelect,
  onEdit,
  onDelete,
  onShare,
  isOwner,
  myUid,
}: {
  trip: Trip;
  expenses: Expense[];
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onShare: () => void;
  isOwner: boolean;
  myUid?: string | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);
  const live = liveTripStatus(trip);
  const meta = STATUS_META[live];
  const StatusIcon = meta.icon;
  // Viewer rule: owner → trip total + full spend · member → own budget + own share
  const tripExps = expenses.filter((e) => e.tripId === trip.id);
  const vb = viewerBudget(trip, tripExps, myUid);
  const barSpent = vb.personal ? vb.spent : tripExps.reduce((a, b) => a + (Number(b.amount) || 0), 0);
  const barTotal = vb.personal ? vb.budget : trip.totalBudget;
  const barPct = barTotal > 0 ? Math.min(100, Math.round((barSpent / barTotal) * 100)) : 0;
  const daysLeft = getDaysLeft(trip);
  const nights = Math.ceil((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div
      className={`group relative bg-white rounded-2xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.08)] border border-slate-200/80 hover:shadow-[0_12px_32px_rgba(0,0,0,0.12)] hover:-translate-y-0.5 transition-all duration-200 cursor-pointer ${live === 'completed' ? 'opacity-80' : ''}`}
      onClick={onSelect}
    >
      {/* Cover Image */}
      <div className="relative h-36 overflow-hidden">
        <MediaImg
          srcRef={trip.coverImage}
          alt={trip.title}
          className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${live === 'completed' ? 'grayscale-[30%]' : ''}`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

        {/* Status Badge */}
        <div className={`absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full ${meta.bg} backdrop-blur-sm`}>
          <StatusIcon size={11} className={meta.text} />
          <span className={`text-xs font-semibold ${meta.text}`}>{meta.label}</span>
        </div>

        {/* Days countdown */}
        {daysLeft && (
          <div className="absolute top-3 right-10 bg-white/90 backdrop-blur-sm text-slate-700 text-xs font-bold px-2.5 py-1 rounded-full">
            {daysLeft}
          </div>
        )}

        {/* Menu (owner only — joiners can neither edit nor delete) */}
        {isOwner && (
        <div ref={menuRef} className="absolute top-2.5 right-2.5">
          <button
            className="p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white transition-colors"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          >
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-30 min-w-[120px]">
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(); }}
                >
                  <Edit2 size={13} /> Edit
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
                >
                  <Trash2 size={13} /> Delete
                </button>
            </div>
          )}
        </div>
        )}

        {/* Trip title overlay */}
        <div className="absolute bottom-0 left-0 right-0 px-3 pb-2.5">
          <div className="flex items-center gap-1.5">
            <h3 className="text-white font-bold text-base leading-tight line-clamp-1 drop-shadow">{trip.title}</h3>
            {isOwner && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[8px] font-extrabold bg-amber-400/90 text-amber-900 border border-amber-300/50 flex-shrink-0">OWNER</span>
            )}
          </div>
          <div className="flex items-center gap-1 text-white/80 text-xs mt-0.5">
            <MapPin size={10} />
            <span className="line-clamp-1">{trip.cities.map(c => c.name.split(' ')[0]).join(' → ')}</span>
            <span className="mx-1 opacity-60">·</span>
            <span>{nights}N</span>
          </div>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-3">
        {/* Dates */}
        <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-3">
          <Calendar size={11} />
          <span>{formatDateRange(trip.startDate, trip.endDate)}</span>
        </div>

        {/* Budget bar */}
        {live !== 'upcoming' && (
          <div className="mb-3">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">
                {vb.personal ? 'Your share' : live === 'completed' ? 'Total Spent' : 'Spent so far'}
              </span>
              <span className={`font-semibold ${barPct > 85 ? 'text-red-500' : 'text-emerald-600'}`}>
                ₹{barSpent.toLocaleString('en-IN')} / ₹{barTotal.toLocaleString('en-IN')}
              </span>
            </div>
            {vb.personal && barTotal === 0 && (
              <p className="text-[10px] text-slate-400 font-medium mb-1">Budget not set — set it from the trip's Squad list</p>
            )}
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${barPct > 85 ? 'bg-red-400' : barPct > 65 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                style={{ width: `${barPct}%` }}
              />
            </div>
          </div>
        )}
        {live === 'upcoming' && (
          <div className="mb-3 flex items-center gap-1.5">
            <Wallet size={12} className="text-indigo-500" />
            {vb.personal ? (
              barTotal > 0 ? (
                <span className="text-xs text-slate-600">Your Budget: <strong>₹{barTotal.toLocaleString('en-IN')}</strong></span>
              ) : (
                <span className="text-xs text-slate-500">Your budget not set · Trip total <strong>₹{Number(trip.totalBudget).toLocaleString('en-IN')}</strong></span>
              )
            ) : (
              <span className="text-xs text-slate-600">Budget: <strong>₹{Number(trip.totalBudget).toLocaleString('en-IN')}</strong></span>
            )}
          </div>
        )}

        {/* Members + Open */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="flex -space-x-1.5">
              {trip.members.slice(0, 4).map((m, i) => (
                <MemberAvatar key={m.id} name={m.name} avatar={m.avatar} memberId={m.id} index={i} size="xs" />
              ))}
              {trip.members.length > 4 && (
                <div className="w-6 h-6 rounded-full border-2 border-white bg-indigo-100 flex items-center justify-center">
                  <span className="text-[9px] font-bold text-indigo-600">+{trip.members.length - 4}</span>
                </div>
              )}
            </div>
            <span className="text-xs text-slate-400">{trip.members.length > 4 ? `+${trip.members.length - 4} others` : `${trip.members.length} members`}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              aria-label="Share trip"
              title="Share trip"
              className="p-1.5 rounded-full text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 transition-colors cursor-pointer"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onShare(); }}
            >
              <Share2 size={16} />
            </button>
            <button
              aria-label={live === 'completed' ? 'View trip' : 'Open trip'}
              title={live === 'completed' ? 'View' : 'Open'}
              className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                live === 'completed'
                  ? 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                  : 'text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50'
              }`}
              onClick={(e) => { e.stopPropagation(); onSelect(); }}
            >
              <ChevronRight size={22} strokeWidth={2.75} stroke="currentColor" className="shrink-0" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TripLandingView({ trips, expenses, onSelectTrip, onCreateTrip, onEditTrip, onDeleteTrip, userName, userId, onOpenProfile, onShareTrip, myUid, ownerFilter: ownerFilterProp, onOwnerFilterChange, unreadCount, onBellClick, bellPulse = 0 }: TripLandingViewProps) {
  const [filter, setFilter] = useState<'all' | 'inprogress' | 'upcoming' | 'completed'>('all');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'owned' | 'joined'>(ownerFilterProp || 'all');
  const [confirmTrip, setConfirmTrip] = useState<Trip | null>(null);

  // New notification → bell jiggles ~2s + vibrates (same as trip header bell)
  const [ringing, setRinging] = useState(false);
  useEffect(() => {
    if (!bellPulse) return;
    setRinging(true);
    try {
      navigator.vibrate?.([70, 50, 70]);
    } catch { /* vibrate unsupported */ }
    const t = window.setTimeout(() => setRinging(false), 2000);
    return () => window.clearTimeout(t);
  }, [bellPulse]);

  const inProgress = trips.filter(t => liveTripStatus(t) === 'inprogress');
  const upcoming = trips.filter(t => liveTripStatus(t) === 'upcoming');
  const completed = trips.filter(t => liveTripStatus(t) === 'completed');

  const rank: Record<string, number> = { inprogress: 0, upcoming: 1, completed: 2 };
  const endMs = (t: Trip) => new Date(t.endDate + 'T00:00:00').getTime();
  const startMs = (t: Trip) => new Date(t.startDate + 'T00:00:00').getTime();
  const sortTrips = (list: Trip[]) =>
    [...list].sort((a, b) => {
      const r = (rank[liveTripStatus(a)] ?? 3) - (rank[liveTripStatus(b)] ?? 3);
      if (r !== 0) return r;
      const sa = liveTripStatus(a);
      // In Progress: soonest-ending first · Upcoming: soonest-starting · Completed: most-recently-ended
      if (sa === 'inprogress') return endMs(a) - endMs(b);
      if (sa === 'completed') return endMs(b) - endMs(a);
      return startMs(a) - startMs(b);
    });
  const ownershipFiltered = sortTrips(
    ownershipFilter === 'all'
      ? trips
      : ownershipFilter === 'owned'
        ? trips.filter((t) => tripOwnerUid(t) === myUid)
        : trips.filter((t) => tripOwnerUid(t) && tripOwnerUid(t) !== myUid)
  );
  const filtered = filter === 'all' ? ownershipFiltered : ownershipFiltered.filter(t => liveTripStatus(t) === filter);

  const handleDelete = (trip: Trip) => {
    setConfirmTrip(trip);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero Header */}
      <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-700 px-4 pt-6 pb-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Logo size={36} tone="white" />
              <div>
                <p className="text-indigo-200 text-xs font-medium uppercase tracking-widest">WanderSync</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onBellClick}
                className="relative w-8 h-8 flex items-center justify-center text-white hover:text-indigo-200 transition-colors cursor-pointer"
                title="Notifications"
              >
                <span className={`inline-flex ${ringing ? 'bell-jiggle' : ''}`}>
                  <Bell size={28} strokeWidth={2} />
                </span>
                {(unreadCount || 0) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-extrabold flex items-center justify-center">
                    {(unreadCount || 0) > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={onOpenProfile}
                className="w-8 h-8 rounded-full bg-white text-indigo-700 flex items-center justify-center text-base font-extrabold hover:bg-indigo-50 active:scale-95 transition-all shadow-lg shadow-indigo-900/30 cursor-pointer"
                title={userName || 'Your profile'}
              >
                {(userName || 'Y').trim().charAt(0).toUpperCase()}
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            {[
              { label: 'In Progress', count: inProgress.length, icon: Zap, color: 'text-emerald-300', filterVal: 'inprogress' as const },
              { label: 'Upcoming', count: upcoming.length, icon: Plane, color: 'text-sky-300', filterVal: 'upcoming' as const },
              { label: 'Completed', count: completed.length, icon: Star, color: 'text-amber-300', filterVal: 'completed' as const },
            ].map(({ label, count, icon: Icon, color, filterVal }) => (
              <button
                key={label}
                onClick={() => setFilter(filter === filterVal ? 'all' : filterVal)}
                className={`flex flex-col items-center bg-white/10 hover:bg-white/20 rounded-xl py-3 transition-all ${filter === filterVal ? 'ring-2 ring-white/60' : ''}`}
              >
                <Icon size={18} className={color} />
                <span className="text-white font-bold text-xl mt-1">{count}</span>
                <span className="text-white/60 text-xs">{label}</span>
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* Filter chips + separate create button */}
      <div className="max-w-2xl mx-auto px-4 pt-5 pb-1 flex items-center gap-2.5">
        <div className="flex-1 min-w-0">
        {/* Ownership tabs */}
        <div className="relative grid grid-cols-3 gap-2 overflow-hidden rounded-full bg-slate-100 p-1">
          <span
            aria-hidden="true"
            className="absolute inset-y-1 left-1 w-[calc((100%-1rem)/3)] rounded-full bg-indigo-600 shadow-md shadow-indigo-300 transition-transform duration-300 ease-out"
            style={{ transform: `translateX(${(['all', 'owned', 'joined'] as const).indexOf(ownershipFilter) * 100}%)` }}
          />
          {(['all', 'owned', 'joined'] as const).map((f) => (
            <button
              key={f}
              onClick={() => {
                setOwnershipFilter(f);
                onOwnerFilterChange?.(f);
              }}
              className={`relative z-10 min-w-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors duration-200 ${
                ownershipFilter === f
                  ? 'text-white'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f === 'all' ? 'All' : f === 'owned' ? 'Owner' : 'Joined'}
            </button>
          ))}
        </div>
        </div>
        <button
          id="create-trip-btn"
          onClick={onCreateTrip}
          title="New Trip"
          className="flex-shrink-0 w-11 h-11 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow-lg shadow-indigo-200 active:scale-95 transition-all cursor-pointer"
        >
          <Plus size={20} strokeWidth={2.5} />
        </button>
      </div>

      {/* Trips Grid */}
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-32">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <MapPin size={28} className="text-indigo-300" />
            </div>
            <h3 className="text-slate-700 font-semibold text-lg">No trips yet</h3>
            <p className="text-slate-400 text-sm mt-1 mb-5">Plan your first adventure!</p>
            <button
              onClick={onCreateTrip}
              className="bg-indigo-600 text-white font-semibold px-6 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors"
            >
              Plan New Trip
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {filtered.map((trip) => (
              <TripCard
                key={trip.id}
                trip={trip}
                expenses={expenses}
                onSelect={() => onSelectTrip(trip)}
                onEdit={() => onEditTrip(trip)}
                onDelete={() => handleDelete(trip)}
                onShare={() => onShareTrip(trip)}
                isOwner={tripOwnerUid(trip) === myUid}
                myUid={myUid}
              />
            ))}
          </div>
        )}
      </div>

      {confirmTrip && (
        <ConfirmDialog
          message={`"${confirmTrip.title}" will be deleted — photos, tickets and expenses go with it.`}
          onConfirm={() => onDeleteTrip(confirmTrip.id)}
          onClose={() => setConfirmTrip(null)}
        />
      )}
      <p className="text-center text-[10px] text-slate-300 font-mono pb-6">build {BUILD_TAG}</p>
    </div>
  );
}
