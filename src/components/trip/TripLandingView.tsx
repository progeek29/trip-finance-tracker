import React, { useState, useRef, useEffect } from 'react';
import { Trip, Expense } from '../../types';
import { MemberAvatar } from '../common/MemberAvatar';
import { Logo } from '../common/Logo';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { BUILD_TAG } from '../../utils/version';
import { MediaImg } from '../common/MediaImg';
import {
  MapPin, Calendar, Users, Wallet, ChevronRight,
  MoreVertical, Edit2, Trash2, Plane, CheckCircle2,
  Clock, Zap, Star, Share2
} from 'lucide-react';

interface TripLandingViewProps {
  trips: Trip[];
  expenses: Expense[];
  onSelectTrip: (trip: Trip) => void;
  onCreateTrip: () => void;
  onEditTrip: (trip: Trip) => void;
  onDeleteTrip: (tripId: string) => void;
  userName?: string;
  onOpenProfile?: () => void;
  onShareTrip: (trip: Trip) => void;
  myUid?: string | null;
  ownerFilter?: 'all' | 'owned' | 'joined';
  onOwnerFilterChange?: (f: 'all' | 'owned' | 'joined') => void;
}

const STATUS_META = {
  ongoing: { label: 'Ongoing', bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: Zap },
  upcoming: { label: 'Upcoming', bg: 'bg-sky-100', text: 'text-sky-700', dot: 'bg-sky-500', icon: Clock },
  completed: { label: 'Completed', bg: 'bg-slate-100', text: 'text-slate-500', dot: 'bg-slate-400', icon: CheckCircle2 },
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

function getDaysLeft(startDate: string, status: string) {
  if (status === 'completed') return null;
  if (status === 'ongoing') return 'In Progress';
  const now = new Date();
  const start = new Date(startDate + 'T00:00:00');
  const diff = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 1) return '1 day to go!';
  if (diff > 1) return `${diff} days to go`;
  return null;
}

/** Live status from dates (stored status goes stale) — trip live hai toh Ongoing. */
export function liveTripStatus(trip: Trip): 'upcoming' | 'ongoing' | 'completed' {
  const now = Date.now();
  const s = new Date(trip.startDate + 'T00:00:00').getTime();
  const e = new Date(trip.endDate + 'T00:00:00').getTime();
  if (isNaN(s)) return trip.status;
  if (now < s) return 'upcoming';
  if (!isNaN(e) && now <= e + 86400000) return 'ongoing';
  if (isNaN(e)) return 'ongoing';
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
  // REAL spent from the ledger (same number as inside the trip)
  const spent = expenses.filter((e) => e.tripId === trip.id).reduce((a, b) => a + b.amount, 0);
  const spentPct = Math.min(100, Math.round((spent / trip.totalBudget) * 100));
  const daysLeft = getDaysLeft(trip.startDate, live);
  const nights = Math.ceil((new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div
      className={`group relative bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200/80 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer ${live === 'completed' ? 'opacity-80' : ''}`}
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

        {/* Menu */}
        <div ref={menuRef} className="absolute top-2.5 right-2.5">
          <button
            className="p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white transition-colors"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          >
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-30 min-w-[120px]">
              {isOwner && (
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(); }}
                >
                  <Edit2 size={13} /> Edit
                </button>
              )}
              {isOwner && (
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
                >
                  <Trash2 size={13} /> Delete
                </button>
              )}
            </div>
          )}
        </div>

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
                {live === 'completed' ? 'Total Spent' : 'Spent so far'}
              </span>
              <span className={`font-semibold ${spentPct > 85 ? 'text-red-500' : 'text-emerald-600'}`}>
                ₹{spent.toLocaleString('en-IN')} / ₹{trip.totalBudget.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${spentPct > 85 ? 'bg-red-400' : spentPct > 65 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                style={{ width: `${spentPct}%` }}
              />
            </div>
          </div>
        )}
        {live === 'upcoming' && (
          <div className="mb-3 flex items-center gap-1.5">
            <Wallet size={12} className="text-indigo-500" />
            <span className="text-xs text-slate-600">Budget: <strong>₹{trip.totalBudget.toLocaleString('en-IN')}</strong></span>
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
            <span className="text-xs text-slate-400">{trip.members.length} members</span>
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

export function TripLandingView({ trips, expenses, onSelectTrip, onCreateTrip, onEditTrip, onDeleteTrip, userName, onOpenProfile, onShareTrip, myUid, ownerFilter: ownerFilterProp, onOwnerFilterChange }: TripLandingViewProps) {
  const [filter, setFilter] = useState<'all' | 'ongoing' | 'upcoming' | 'completed'>('all');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'owned' | 'joined'>(ownerFilterProp || 'all');
  const [confirmTrip, setConfirmTrip] = useState<Trip | null>(null);

  const ongoing = trips.filter(t => liveTripStatus(t) === 'ongoing');
  const upcoming = trips.filter(t => liveTripStatus(t) === 'upcoming');
  const completed = trips.filter(t => liveTripStatus(t) === 'completed');

  const rank: Record<string, number> = { ongoing: 0, upcoming: 1, completed: 2 };
  const sortTrips = (list: Trip[]) =>
    [...list].sort((a, b) => {
      const r = (rank[liveTripStatus(a)] ?? 3) - (rank[liveTripStatus(b)] ?? 3);
      if (r !== 0) return r;
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    });
  const ownershipFiltered = sortTrips(
    ownershipFilter === 'all'
      ? trips
      : ownershipFilter === 'owned'
        ? trips.filter((t) => !t.ownerUid || t.ownerUid === myUid)
        : trips.filter((t) => t.ownerUid && t.ownerUid !== myUid)
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
              <Logo size={36} />
              <div>
                <p className="text-indigo-200 text-xs font-medium uppercase tracking-widest">WanderSync</p>
                <h1 className="text-white font-bold text-xl leading-tight">My Trips</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                id="create-trip-btn"
                onClick={onCreateTrip}
                className="bg-white text-indigo-700 font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-indigo-50 active:scale-95 transition-all shadow-lg shadow-indigo-900/30 cursor-pointer"
              >
                New Trip
              </button>
              <button
                onClick={onOpenProfile}
                className="w-10 h-10 rounded-full bg-white text-indigo-700 flex items-center justify-center text-base font-extrabold hover:bg-indigo-50 active:scale-95 transition-all shadow-lg shadow-indigo-900/30 cursor-pointer"
                title={userName || 'Your profile'}
              >
                {(userName || 'Y').trim().charAt(0).toUpperCase()}
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 mt-6">
            {[
              { label: 'Ongoing', count: ongoing.length, icon: Zap, color: 'text-emerald-300', filterVal: 'ongoing' as const },
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

      {/* Filter chips */}
      <div className="max-w-2xl mx-auto px-4 -mt-1 pt-4 space-y-2">
        {/* Ownership tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {(['all', 'owned', 'joined'] as const).map((f) => (
            <button
              key={f}
              onClick={() => {
                setOwnershipFilter(f);
                onOwnerFilterChange?.(f);
              }}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                ownershipFilter === f
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
              }`}
            >
              {f === 'all' ? 'All Trips' : f === 'owned' ? 'My Trips' : 'Joined'}
            </button>
          ))}
        </div>
        {/* Status filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {(['all', 'ongoing', 'upcoming', 'completed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                filter === f
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-500 border border-slate-200 hover:border-indigo-200'
              }`}
            >
              {f === 'all' ? `All (${trips.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${trips.filter(t => liveTripStatus(t) === f).length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Trips Grid */}
      <div className="max-w-2xl mx-auto px-4 py-4 pb-32">
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
              + Plan a New Trip
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filtered.map((trip) => (
              <TripCard
                key={trip.id}
                trip={trip}
                expenses={expenses}
                onSelect={() => onSelectTrip(trip)}
                onEdit={() => onEditTrip(trip)}
                onDelete={() => handleDelete(trip)}
                onShare={() => onShareTrip(trip)}
                isOwner={!trip.ownerUid || trip.ownerUid === myUid}
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
