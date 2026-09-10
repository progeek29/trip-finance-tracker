import React, { useState } from 'react';
import { Trip, Expense, CityStop, TripMember } from '../../types';
import { Sparkles, Zap, Edit2, Trash2, X, ChevronRight, Pencil, Copy, Check } from 'lucide-react';
import confetti from 'canvas-confetti';
import { MemberAvatar } from '../common/MemberAvatar';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { PhoneInput, isValidPhone, formatPhoneDisplay } from '../common/PhoneInput';
import { isNativeApp } from '../../utils/nativeBridge';
import { ContactPickerModal } from '../common/ContactPickerModal';
import { fetchDeviceContacts, type DeviceContact } from '../../utils/deviceContacts';
import { useMediaUrl } from '../common/MediaImg';
import { getRandomEmoji } from '../../utils/avatar';
import { TalkButton } from '../voice/TalkButton';
import { memberStatus, tripOwnerUid } from '../../utils/budget';

interface CleanTripViewProps {
  trip: Trip;
  expenses: Expense[];
  onOpenQuickAdd: () => void;
  onOpenTripEditor: () => void;
  onGoExpenses: () => void;
  onUpdateTrip: (trip: Trip) => void;
  onShareTrip?: () => void;
  myUid?: string | null;
  isAdmin?: boolean;
}

export const CleanTripView: React.FC<CleanTripViewProps> = ({
  trip,
  expenses,
  onOpenQuickAdd,
  onOpenTripEditor,
  onGoExpenses,
  onUpdateTrip,
  onShareTrip,
  myUid,
  isAdmin,
}) => {
  const [simulatedToast, setSimulatedToast] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [stopModal, setStopModal] = useState<{ open: boolean; editing: CityStop | null }>({ open: false, editing: null });
  const [squadOpen, setSquadOpen] = useState(false);
  const [confirmStop, setConfirmStop] = useState<{ id: string; label: string } | null>(null);
  const coverUrl = useMediaUrl(trip.coverImage);

  const handleCopyCode = async () => {
    if (!trip.inviteCode) return;
    try {
      await navigator.clipboard.writeText(trip.inviteCode);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = trip.inviteCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const totalSpent = expenses.reduce((a, b) => a + b.amount, 0);
  const remaining = trip.totalBudget - totalSpent;
  const percentSpent = trip.totalBudget > 0 ? Math.min(100, Math.round((totalSpent / trip.totalBudget) * 100)) : 0;
  // Per-member: what this user's share was spent vs their budget.
  // Viewer rule (utils/budget): owner → trip total · member → own budget (0 = not set).
  // "Me" = uid match first (isCurrentUser flag can go stale after a remote merge).
  const myMember = (myUid ? trip.members.find((m) => m.uid === myUid) : undefined)
    || trip.members.find((m) => m.isCurrentUser);
  const myBudget = myMember?.budget || 0;
  const mySpent = expenses.reduce((sum, e) => {
    const mySplit = e.splits.find((s) => s.memberId === myMember?.id);
    return sum + (mySplit?.amount || 0);
  }, 0);

  const handleSimulateIncomingSMS = () => {
    const merchants = ['Cafe Mambo Baga', 'Burger Factory Anjuna', 'Thalassa Siolim', 'Goa Cab Service', "Tito's Club"];
    const amounts = [650, 1200, 2400, 850, 3100];
    const idx = Math.floor(Math.random() * merchants.length);
    setSimulatedToast(`HDFC Bank Alert: Rs.${amounts[idx]} debited at ${merchants[idx]}. Auto-logged to ${trip.title}.`);
    confetti({ particleCount: 40, spread: 50, origin: { y: 0.8 } });
    setTimeout(() => setSimulatedToast(null), 4500);
  };

  const deleteStop = (id: string, label: string) => {
    setConfirmStop({ id, label });
  };

  const confirmStopGo = () => {
    if (!confirmStop) return;
    onUpdateTrip({ ...trip, cities: trip.cities.filter((c) => c.id !== confirmStop.id) });
  };

  // Trip countdown — always live from dates (never stored)
  const nowMs = Date.now();
  const startMs = new Date(trip.startDate + 'T00:00:00').getTime();
  const endMs = new Date(trip.endDate + 'T00:00:00').getTime();
  const daysToStart = Math.ceil((startMs - nowMs) / 86400000);
  const tripPhase: 'upcoming' | 'live' | 'done' = isNaN(startMs) ? 'live' : nowMs < startMs ? 'upcoming' : nowMs <= endMs + 86400000 ? 'live' : 'done';
  const tripDayCount = !isNaN(startMs) && !isNaN(endMs) && endMs >= startMs
    ? Math.ceil((endMs - startMs) / 86400000) + 1
    : 0;
  const liveDayNum = tripDayCount > 0
    ? Math.min(tripDayCount, Math.max(1, Math.floor((nowMs - startMs) / 86400000) + 1))
    : 0;
  const bannerTitle =
    tripPhase === 'upcoming'
      ? daysToStart <= 0 ? 'Starts today' : daysToStart === 1 ? 'Starts tomorrow' : `Starts in ${daysToStart} days`
      : tripPhase === 'live' && tripDayCount > 0 ? `Day ${liveDayNum} of ${tripDayCount}` : 'Trip live';
  const isOwner = isAdmin || tripOwnerUid(trip) === myUid;
  const myName = ((myUid ? trip.members.find((m) => m.uid === myUid) : undefined)
    || trip.members.find((m) => m.isCurrentUser))?.name?.replace(/\(You\)/g, '').trim() || 'Someone';

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* Trip countdown banner — always visible */}
      {tripPhase === 'upcoming' && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-extrabold font-display leading-tight">{bannerTitle}</p>
            <p className="text-[11px] text-indigo-100 font-medium">
              {new Date(trip.startDate + 'T00:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
            </p>
          </div>
          <span className="text-2xl font-extrabold bg-white/20 rounded-2xl px-3 py-1.5">{daysToStart <= 1 ? '!' : daysToStart}</span>
        </div>
      )}
      {tripPhase === 'live' && tripDayCount > 1 && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-extrabold font-display leading-tight">{bannerTitle}</p>
            <p className="text-[11px] text-emerald-100 font-medium">Enjoy every moment</p>
          </div>
          <span className="text-2xl font-extrabold bg-white/20 rounded-2xl px-3 py-1.5">{liveDayNum}/{tripDayCount}</span>
        </div>
      )}
      {simulatedToast && (
        <div className="p-3.5 rounded-2xl bg-emerald-600 text-white shadow-lg flex items-center justify-between gap-3 animate-bounce">
          <div className="flex items-center gap-2 text-xs font-bold">
            <Zap className="w-4 h-4 fill-amber-300 text-amber-300 flex-shrink-0" />
            <span>{simulatedToast}</span>
          </div>
          <button onClick={() => setSimulatedToast(null)} className="text-white/80 hover:text-white text-xs font-bold">✕</button>
        </div>
      )}

      {/* Hero */}
      <div className="relative rounded-3xl overflow-hidden clean-card border border-slate-200 shadow-md">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: coverUrl ? `url(${coverUrl})` : undefined }} />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/65 to-slate-900/25" />
        <div className="relative z-10 p-6 sm:p-7 space-y-4">
          <div className="flex items-center justify-between">
            <span className="px-3 py-1 rounded-full bg-emerald-500 text-white text-xs font-extrabold shadow-sm">
              {new Date(trip.startDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} → {new Date(trip.endDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </span>
            {isOwner && (
              <button onClick={onOpenTripEditor} className="text-xs text-white/90 hover:text-white px-3 py-1 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/20 font-semibold transition-all cursor-pointer">
                Edit Trip
              </button>
            )}
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-display">{trip.title}</h1>
            <p className="text-slate-200 text-xs sm:text-sm mt-1 max-w-xl">{trip.description}</p>
          </div>
          <div className="flex items-center gap-2">
            {trip.inviteCode ? (
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 text-xs font-mono font-bold text-white/90 bg-white/15 border border-white/20 px-2.5 py-1 rounded-xl hover:bg-white/25 transition-colors cursor-pointer"
                title="Copy invite code"
              >
                <span>{trip.inviteCode}</span>
                {copiedCode ? <Check size={13} className="text-emerald-300" /> : <Copy size={13} className="text-white/70" />}
              </button>
            ) : (
              <button onClick={onShareTrip} className="text-xs text-white px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 font-semibold cursor-pointer">
                Get Invite Code
              </button>
            )}
          </div>
          <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-white/20">
            <div className="flex items-center gap-2.5">
              <div className="flex -space-x-2">
                {trip.members.slice(0, 6).map((m, i) => (
                  <MemberAvatar key={m.id} name={m.name} avatar={m.avatar} memberId={m.id} index={i} size="sm" />
                ))}
              </div>
              <button onClick={isOwner ? onOpenTripEditor : undefined} className={`text-xs font-semibold ${isOwner ? 'text-white hover:underline cursor-pointer' : 'text-white/70'}`}>
                {trip.members.length} Squad Member{trip.members.length !== 1 ? 's' : ''}{isOwner ? ' · Manage' : ''}
              </button>
            </div>
            <div className="bg-black/30 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/10 text-left sm:text-right">
              {!isOwner ? (
                myBudget > 0 ? (
                  <>
                    <span className="text-[11px] text-slate-300 block">Your Budget</span>
                    <span className="text-sm font-extrabold text-emerald-400">
                      ₹{Math.max(0, myBudget - mySpent).toLocaleString('en-IN')} <span className="text-slate-300 font-normal text-xs">left of ₹{myBudget.toLocaleString('en-IN')}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[11px] text-slate-300 block">Your Budget</span>
                    <span className="text-sm font-extrabold text-slate-100">
                      ₹0 <span className="text-slate-300 font-normal text-xs">not set</span>
                    </span>
                    <button
                      onClick={() => setSquadOpen(true)}
                      className="block mt-0.5 text-[11px] font-bold text-indigo-300 hover:text-white hover:underline cursor-pointer sm:ml-auto"
                    >
                      Set your budget
                    </button>
                  </>
                )
              ) : (
                <>
                  <span className="text-[11px] text-slate-300 block">Remaining Budget</span>
                  <span className="text-sm font-extrabold text-emerald-400">
                    ₹{remaining.toLocaleString('en-IN')} <span className="text-slate-300 font-normal text-xs">left ({100 - percentSpent}%)</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Walkie-talkie: tap to talk to the squad */}
      <TalkButton tripId={trip.id} byName={myName} />

      {/* Snapshot — Total Spent jumps to Expenses, Squad opens members */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button onClick={onGoExpenses} className="text-left clean-card rounded-2xl p-4 border border-slate-200 bg-white shadow-2xs space-y-1 hover:border-indigo-400 cursor-pointer group">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            {!isOwner ? 'Your Share' : 'Total Spent'}
            <span className="flex items-center gap-0.5 text-[10px] font-bold text-indigo-600">History <ChevronRight size={12} strokeWidth={2.75} stroke="currentColor" /></span>
          </span>
          <div className="text-xl font-extrabold text-slate-900 font-display">₹{(!isOwner ? mySpent : totalSpent).toLocaleString('en-IN')}</div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
            <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${!isOwner ? (myBudget > 0 ? Math.min(100, Math.round((mySpent / myBudget) * 100)) : 0) : percentSpent}%` }} />
          </div>
          <span className="text-[10px] text-slate-500 font-medium block pt-1">{!isOwner ? (myBudget > 0 ? `₹${Math.max(0, myBudget - mySpent).toLocaleString('en-IN')} left of ₹${myBudget.toLocaleString('en-IN')}` : `Budget ₹0 (not set) · ₹${totalSpent.toLocaleString('en-IN')} trip total`) : `₹${remaining.toLocaleString('en-IN')} remaining of ₹${trip.totalBudget.toLocaleString('en-IN')}`} · tap for history</span>
        </button>
        <button onClick={() => setSquadOpen(true)} className="text-left clean-card rounded-2xl p-4 border border-slate-200 bg-white shadow-2xs space-y-1 hover:border-indigo-400 cursor-pointer">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            Squad
            <span className="flex items-center gap-0.5 text-[10px] font-bold text-indigo-600">View all <ChevronRight size={12} strokeWidth={2.75} stroke="currentColor" /></span>
          </span>
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1.5">
              {trip.members.slice(0, 4).map((m, i) => (
                <MemberAvatar key={m.id} name={m.name} avatar={m.avatar} memberId={m.id} index={i} size="xs" />
              ))}
            </div>
            <div className="text-xl font-extrabold text-slate-900 font-display">{trip.members.length} friends</div>
          </div>
          <span className="text-[11px] text-slate-500 font-medium block pt-1">Tap to view, add, edit or remove members</span>
        </button>
      </div>

      {/* SMS demo (web only — the installed app reads real bank SMS automatically) */}
      {!isNativeApp() && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-extrabold text-indigo-950">Try SMS auto-log (demo)</span>
            </div>
            <p className="text-[11px] text-slate-600">Browsers cannot read real SMS, so this button simulates one incoming bank message. The installed app reads actual debit SMS by itself.</p>
          </div>
          <button onClick={handleSimulateIncomingSMS} className="flex-shrink-0 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs shadow-indigo-200 transition-all cursor-pointer">
            <Zap className="w-3.5 h-3.5" />
            <span>Simulate SMS Alert</span>
          </button>
        </div>
      )}

      {/* Itinerary — simple spots list (days come from trip dates) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-900 font-display">Itinerary{tripDayCount > 0 ? ` (${tripDayCount}-day trip)` : ''}</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">{trip.cities.length} spots</span>
            <button onClick={() => setStopModal({ open: true, editing: null })} className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer">
              Add Spot
            </button>
          </div>
        </div>
        {trip.cities.length === 0 && (
          <p className="text-xs text-slate-500 bg-white border border-dashed border-slate-300 rounded-2xl p-4 text-center">No spots yet — add places you want to visit.</p>
        )}
        <div className="space-y-2">
          {trip.cities.map((city, idx) => (
            <div key={city.id} className="clean-card rounded-2xl px-4 py-3 border border-slate-200 bg-white flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-extrabold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-slate-900 truncate">{city.name}</span>
                {city.notes ? <span className="block text-[11px] text-slate-500 truncate">{city.notes}</span> : null}
              </span>
              <button onClick={() => setStopModal({ open: true, editing: city })} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>
              <button onClick={() => deleteStop(city.id, city.name)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      </div>

      {stopModal.open && (
        <StopFormModal
          editing={stopModal.editing}
          onClose={() => setStopModal({ open: false, editing: null })}
          onSave={(stop) => {
            if (stopModal.editing) onUpdateTrip({ ...trip, cities: trip.cities.map((c) => (c.id === stop.id ? stop : c)) });
            else onUpdateTrip({ ...trip, cities: [...trip.cities, stop] });
            setStopModal({ open: false, editing: null });
          }}
        />
      )}
      {squadOpen && (
        <SquadModal
          trip={trip}
          onClose={() => setSquadOpen(false)}
          onSave={(members) => {
            onUpdateTrip({ ...trip, members });
            setSquadOpen(false);
          }}
          myUid={myUid}
          isAdmin={isAdmin}
        />
      )}
      {confirmStop && (
        <ConfirmDialog
          message={`"${confirmStop.label}" will be deleted.`}
          onConfirm={confirmStopGo}
          onClose={() => setConfirmStop(null)}
        />
      )}

      {/* Persistent invite code at trip end */}
      <div className="clean-card rounded-2xl p-4 border border-slate-200 bg-white flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Invite Code</p>
          <p className="text-sm font-mono font-extrabold text-indigo-700 tracking-widest truncate">{trip.inviteCode || '—'}</p>
          <p className="text-[11px] text-slate-500">Share this code to invite friends to this trip</p>
        </div>
        {trip.inviteCode ? (
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold cursor-pointer flex-shrink-0"
          >
            {copiedCode ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            <span>{copiedCode ? 'Copied' : 'Copy'}</span>
          </button>
        ) : (
          <button onClick={onShareTrip} className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer flex-shrink-0">
            Get Code
          </button>
        )}
      </div>
    </div>
  );
};

function StopFormModal({ editing, onClose, onSave }: { editing: CityStop | null; onClose: () => void; onSave: (s: CityStop) => void }) {
  const [name, setName] = useState(editing?.name || '');
  const [notes, setNotes] = useState(editing?.notes || '');
  const [nameError, setNameError] = useState(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setNameError(true); return; }
    onSave({ id: editing?.id || `city_${Date.now()}`, name: name.trim(), stateOrCountry: editing?.stateOrCountry || '', startDate: editing?.startDate || '', endDate: editing?.endDate || '', budget: editing?.budget || 0, notes: notes.trim() });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
      <form onSubmit={submit} className="bg-white max-w-md w-full rounded-3xl p-6 space-y-3 shadow-2xl">
        <div className="flex items-center justify-between">
          <h4 className="font-extrabold">{editing ? 'Edit Spot' : 'Add Spot'}</h4>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError && e.target.value.trim()) setNameError(false);
            }}
            placeholder="Spot name *"
            className={`w-full rounded-xl border px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-100 ${
              nameError ? 'bg-rose-50 border-rose-400 placeholder-rose-300 focus:border-rose-400' : 'bg-slate-50 border-slate-200 focus:border-indigo-500'
            }`}
          />
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Description (optional)" rows={2} className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs" />
        <button className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold cursor-pointer">Save</button>
      </form>
    </div>
  );
}

function SquadModal({ trip, onClose, onSave, myUid, isAdmin }: { trip: Trip; onClose: () => void; onSave: (members: TripMember[]) => void; myUid?: string | null; isAdmin?: boolean }) {
  const [members, setMembers] = useState<TripMember[]>(trip.members);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newBudget, setNewBudget] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [contactList, setContactList] = useState<DeviceContact[] | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);
  const isOwner = isAdmin || tripOwnerUid(trip) === myUid;

  const addOrSave = () => {
    if (!newName.trim()) return;
    if (newPhone && !isValidPhone(newPhone)) {
      alert('Please enter a valid 10-digit mobile number');
      return;
    }
    const budgetVal = newBudget ? Number(newBudget) : undefined;
    if (editingId) {
      setMembers((prev) => prev.map((m) => (m.id === editingId ? { ...m, name: newName.trim(), phone: newPhone.trim(), budget: budgetVal } : m)));
      setEditingId(null);
    } else {
      setMembers((prev) => [...prev, { id: `m_${Date.now()}`, name: newName.trim(), avatar: getRandomEmoji(), phone: newPhone.trim(), upiId: '', joinedAt: new Date().toISOString(), budget: budgetVal }]);
    }
    setNewName(''); setNewPhone(''); setNewBudget('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
      <div className="bg-white max-w-md w-full rounded-xl border border-[#e2e8f0] p-6 space-y-3 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h4 className="font-extrabold text-slate-900" style={{ letterSpacing: '0.02em' }}>Squad Members ({members.length})</h4>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div className="divide-y divide-[#f1f5f9]">
          {members.map((m, i) => (
            <div key={m.id} className="py-2.5 space-y-1.5">
              <div className="flex items-center gap-2.5">
                <MemberAvatar name={m.name} avatar={m.avatar} memberId={m.id} index={i} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">
                    {m.isCurrentUser ? `${m.name.replace(/\(You\)/g, '').trim() || 'You'} (You)` : m.name}
                    {(() => {
                      const st = memberStatus(trip, m);
                      return st === 'OWNER' ? (
                        <span className="ml-1.5 text-[9px] font-extrabold rounded-full px-1.5 py-0.5" style={{ background: '#fef3c7', color: '#d97706' }}>OWNER</span>
                      ) : st === 'JOINED' ? (
                        <span className="ml-1.5 text-[9px] font-extrabold rounded-full px-1.5 py-0.5" style={{ background: '#dcfce7', color: '#15803d' }}>JOINED</span>
                      ) : (
                        <span className="ml-1.5 text-[9px] font-extrabold rounded-full px-1.5 py-0.5 bg-slate-100 text-slate-500" title="No app yet — expenses still split normally">MANUAL</span>
                      );
                    })()}
                  </p>
                  <p className="text-[11px] truncate" style={{ color: '#64748b' }}>{formatPhoneDisplay(m.phone || m.upiId) || 'No contact'}</p>
                </div>
                <button onClick={() => setMembers((prev) => prev.map((mm) => (mm.id === m.id ? { ...mm, avatar: getRandomEmoji() } : mm)))} className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer">Shuffle</button>
                {isOwner && !m.isCurrentUser && (
                  <>
                    <button onClick={() => { setEditingId(m.id); setNewName(m.name); setNewPhone(m.phone || ''); setNewBudget(m.budget?.toString() || ''); setShowAdd(true); }}><Pencil size={13} className="text-slate-400 hover:text-indigo-500" /></button>
                    <button onClick={() => setMembers((prev) => prev.filter((mm) => mm.id !== m.id))}><X size={14} className="text-slate-300 hover:text-red-400" /></button>
                  </>
                )}
              </div>
              {/* Budget: ONLY on your own row. Owner → trip total (no input).
                  Member → your own input. Nobody sees anyone else's budget. */}
              {m.isCurrentUser ? (
                memberStatus(trip, m) === 'OWNER' ? (
                  <div className="flex items-center gap-1.5 pl-[38px]">
                    <span className="text-[10px] font-medium" style={{ color: '#64748b' }}>Trip budget:</span>
                    <span className="text-[11px] font-bold text-slate-600">₹{Number(trip.totalBudget).toLocaleString('en-IN')}</span>
                    <span className="text-[10px]" style={{ color: '#64748b' }}>(Edit Trip se change)</span>
                  </div>
                ) : (
                  <div className="pl-[38px]">
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500 select-none">₹</span>
                      <input
                        type="number"
                        min={0}
                        value={m.budget || ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? undefined : Number(e.target.value);
                          setMembers((prev) => prev.map((mm) => (mm.id === m.id ? { ...mm, budget: val } : mm)));
                        }}
                        placeholder="Budget per Trip"
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 pl-9 pr-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                  </div>
                )
              ) : null}
            </div>
          ))}
        </div>
        {isOwner && (
          <button onClick={() => { setShowAdd(!showAdd); setEditingId(null); setNewName(''); setNewPhone(''); }} className="w-full h-11 rounded-lg border border-dashed border-indigo-300 text-indigo-600 text-xs font-bold cursor-pointer" style={{ letterSpacing: '0.02em' }}>
            {showAdd ? 'Hide' : 'Add Member'}
          </button>
        )}
        {showAdd && (
          <div className="bg-[#f8fafc] rounded-xl p-3 space-y-2">
            <p className="text-[11px] font-bold text-slate-500 uppercase" style={{ letterSpacing: '0.02em' }}>{editingId ? 'Edit member' : 'Add manually or pick contacts'}</p>
            <button
              onClick={async () => {
                setContactError(null);
                try {
                  const { contacts } = await fetchDeviceContacts();
                  setContactList(contacts);
                } catch {
                  setContactError('Could not open phone contacts (permission denied or unavailable). Add manually below.');
                }
              }}
              className="w-full bg-indigo-600 text-white text-xs font-bold h-11 rounded-xl hover:bg-indigo-700 cursor-pointer flex items-center justify-center gap-2" style={{ letterSpacing: '0.02em' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Add Contacts
            </button>
            {contactError && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-medium">{contactError}</p>
            )}
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name *" className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100" />
            <PhoneInput value={newPhone} onChange={setNewPhone} placeholder="Phone" />
            <div>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500 select-none">₹</span>
                <input type="number" min={0} value={newBudget} onChange={(e) => setNewBudget(e.target.value)} placeholder="Budget per Trip" className="w-full rounded-xl bg-slate-50 border border-slate-200 pl-9 pr-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100" />
              </div>
            </div>
            <button onClick={addOrSave} disabled={!newName.trim()} className="w-full bg-indigo-600 text-white text-xs font-bold h-11 rounded-xl disabled:opacity-40 cursor-pointer" style={{ letterSpacing: '0.02em' }}>{editingId ? 'Save' : 'Add to Squad'}</button>
          </div>
        )}
        <div className="pt-1 border-t border-[#f1f5f9]">
          <button onClick={() => onSave(members)} className="w-full h-11 rounded-xl bg-indigo-600 text-white text-xs font-bold cursor-pointer" style={{ letterSpacing: '0.02em' }}>Save</button>
        </div>
      </div>

      {contactList && (
        <ContactPickerModal
          contacts={contactList}
          onClose={() => setContactList(null)}
          onAdd={(picked) => {
            const nowIso = new Date().toISOString();
            const fresh: TripMember[] = picked.map((c, i) => ({
              id: `m_contact_${Date.now()}_${i}`,
              name: c.name,
              avatar: getRandomEmoji(),
              phone: c.phone,
              upiId: '',
              joinedAt: nowIso,
            }));
            setMembers((prev) => {
              const phones = new Set(prev.map((mm) => mm.phone));
              return [...prev, ...fresh.filter((mm) => !mm.phone || !phones.has(mm.phone))];
            });
            setContactList(null);
          }}
        />
      )}
    </div>
  );
}
