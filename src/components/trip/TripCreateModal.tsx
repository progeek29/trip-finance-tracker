import React, { useState, useEffect, useRef } from 'react';
import { Trip, TripMember, CityStop } from '../../types';
import { getRandomEmoji } from '../../utils/avatar';
import { putMedia } from '../../utils/mediaStore';
import { loadUserProfile } from '../../utils/storage';
import { makeInviteCode, ensureCloudUser } from '../../utils/supabaseClient';
import { MemberAvatar } from '../common/MemberAvatar';
import { DatePicker } from '../common/DatePicker';
import { ContactPickerModal } from '../common/ContactPickerModal';
import { PhoneInput, isValidPhone, formatPhoneDisplay } from '../common/PhoneInput';
import { fetchDeviceContacts, type DeviceContact } from '../../utils/deviceContacts';
import { useLockBodyScroll } from '../common/useLockBodyScroll';
import { tripOwnerUid } from '../../utils/budget';
import {
  X, Trash2,
  Check, Image, Pencil
} from 'lucide-react';

interface TripCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveTrip: (trip: Trip) => void;
  editingTrip?: Trip | null;
  ownerUid?: string | null;
}

const COVER_IMAGES = [
  'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1518684079-3c830dcef090?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=800&q=80',
];

/** Login profile se "you" member banao (naam + mobile prefilled). */
function youFromProfile(): TripMember {
  const p = loadUserProfile();
  return {
    id: 'm1',
    name: p?.name || '',
    avatar: '😎',
    isCurrentUser: true,
    phone: p?.phone || '',
    upiId: '',
  };
}

/** 'Apurv (You)' + suffix double-print fix — naam saaf, (You) ek baar. */
export function displayMemberName(m: TripMember): string {
  const clean = m.name.replace(/\(You\)/g, '').trim();
  return m.isCurrentUser ? `${clean || 'You'} (You)` : clean || 'Friend';
}

/** Contact picker blocked message (typo-free, single source). */
export const CONTACT_BLOCKED_MSG =
  'Could not open phone contacts (permission denied or unavailable). Please add manually below.';

export function TripCreateModal({ isOpen, onClose, onSaveTrip, editingTrip, ownerUid }: TripCreateModalProps) {
  const [step, setStep] = useState<'details' | 'squad'>('details');

  // Trip details
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [budget, setBudget] = useState('');
  const [coverImage, setCoverImage] = useState(COVER_IMAGES[0]);
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [cities, setCities] = useState<Omit<CityStop, 'id'>[]>([
    { name: '', stateOrCountry: '', startDate: '', endDate: '', budget: 0 },
  ]);

  // Spots UX: never add an empty row; new rows arrive below with auto-scroll + focus.
  const spotsListRef = useRef<HTMLDivElement | null>(null);
  const prevSpotCount = useRef(1);
  const lastSpotEmpty = cities.length > 0 && !cities[cities.length - 1].name.trim();
  const addSpot = () => {
    if (lastSpotEmpty) return;
    setCities((prev) => [...prev, { name: '', stateOrCountry: '', startDate: '', endDate: '', budget: 0, notes: '' }]);
  };
  useEffect(() => {
    if (cities.length > prevSpotCount.current) {
      const el = spotsListRef.current;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        window.setTimeout(() => {
          const inputs = el.querySelectorAll('input');
          // each spot block ends with [name, notes] — focus the newest name field
          const nameInput = inputs[inputs.length - 2] as HTMLInputElement | undefined;
          if (nameInput) nameInput.focus({ preventScroll: true });
        }, 80);
      }
    }
    prevSpotCount.current = cities.length;
  }, [cities.length]);

  // Squad
  const [members, setMembers] = useState<TripMember[]>(() => [youFromProfile()]);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [contactPickerSupported, setContactPickerSupported] = useState(false);

  const tripDays = startDate && endDate && new Date(endDate) >= new Date(startDate)
    ? Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1
    : 0;

  useEffect(() => {
    // @ts-ignore
    setContactPickerSupported(typeof navigator !== 'undefined' && 'contacts' in navigator && typeof (navigator as any).contacts?.select === 'function');
  }, []);

  const prevCreateOpenRef = React.useRef(false);
  const prevEditingIdRef = React.useRef<string | null>(null);
  useEffect(() => {
    const editingId = editingTrip?.id || null;
    const shouldReset = isOpen && (!prevCreateOpenRef.current || prevEditingIdRef.current !== editingId);
    prevCreateOpenRef.current = isOpen;
    prevEditingIdRef.current = editingId;
    if (!isOpen) { setStep('details'); return; }
    if (!shouldReset) return;
    setEditingMemberId(null);
    setNewMemberName(''); setNewMemberPhone(''); setShowManualAdd(false);
    setContactError(null);
    setShowCoverPicker(false);
    if (editingTrip) {
      setTitle(editingTrip.title);
      setDescription(editingTrip.description);
      setStartDate(editingTrip.startDate);
      setEndDate(editingTrip.endDate);
      setBudget(String(editingTrip.totalBudget));
      setCoverImage(editingTrip.coverImage);
      setMembers(editingTrip.members);
      setCities(editingTrip.cities.map(c => ({ ...c })));
      prevSpotCount.current = editingTrip.cities.length;
    } else {
      setTitle(''); setDescription(''); setStartDate(''); setEndDate('');
      setBudget(''); setCoverImage(COVER_IMAGES[0]);
      setMembers([youFromProfile()]);
      setCities([{ name: '', stateOrCountry: '', startDate: '', endDate: '', budget: 0 }]);
      prevSpotCount.current = 1;
    }
  }, [isOpen, editingTrip?.id]);

  const [contactError, setContactError] = useState<string | null>(null);
  const [contactList, setContactList] = useState<DeviceContact[] | null>(null);

  const openContactPicker = async () => {
    setContactError(null);
    try {
      const { contacts } = await fetchDeviceContacts();
      setContactList(contacts);
    } catch {
      setContactError(CONTACT_BLOCKED_MSG);
    }
  };

  const addPickedContacts = (picked: DeviceContact[]) => {
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
      const existingPhones = new Set(prev.map((m) => m.phone));
      return [...prev, ...fresh.filter((m) => !m.phone || !existingPhones.has(m.phone))];
    });
    setContactList(null);
  };

  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);

  const handleAddCustomMember = () => {
    if (!newMemberName.trim()) return;
    if (newMemberPhone && !isValidPhone(newMemberPhone)) {
      alert('Please enter a valid 10-digit mobile number');
      return;
    }
    const name = newMemberName.trim();
    if (editingMemberId) {
      setMembers(prev => prev.map(m => m.id === editingMemberId ? { ...m, name, phone: newMemberPhone.trim() } : m));
      setEditingMemberId(null);
      setShowManualAdd(false);
    } else {
      const newM: TripMember = {
        id: `m_${Date.now()}`,
        name,
        avatar: getRandomEmoji(),
        phone: newMemberPhone.trim(),
        upiId: '',
        joinedAt: new Date().toISOString(),
      };
      setMembers(prev => [...prev, newM]);
    }
    setNewMemberName(''); setNewMemberPhone('');
  };

  const handleSave = async () => {
    if (!title.trim() || !startDate || !endDate || !budget) return;
    const youPhone = members.find((m) => m.isCurrentUser)?.phone || '';
    if (youPhone && !isValidPhone(youPhone)) {
      alert('Please enter a valid 10-digit mobile number');
      return;
    }
    const tripId = editingTrip?.id || `trip_${Date.now()}`;
    // Owner is mandatory: a trip without ownerUid is rejected by the server
    // and later wiped by the isolation filter (total data loss — Luxmi case).
    // Resolve live if the prop hasn't arrived yet (slow session restore).
    const uid = ownerUid || (await ensureCloudUser().catch(() => null))?.uid || undefined;
    if (!editingTrip && !uid) {
      alert('Session is still loading. Please wait a second and try again.');
      return;
    }
    const finalOwner = editingTrip ? tripOwnerUid(editingTrip) : uid;
    // Legacy custom covers remain as stored pointers; new covers use presets only.
    let cover = coverImage;
    if (cover.startsWith('data:')) {
      cover = await putMedia(tripId, 'image', cover);
    }
    const finalMembers = members.map((m) =>
      m.isCurrentUser ? { ...m, name: m.name.trim() || 'You', uid: m.uid || finalOwner || undefined } : m
    );
    const cleanTitle = title.trim();
    const trip: Trip = {
      id: tripId,
      title: cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1),
      description: description.trim(),
      coverImage: cover,
      startDate,
      endDate,
      totalBudget: Number(budget) || 0,
      currency: 'INR',
      members: finalMembers,
      inviteCode: editingTrip?.inviteCode || makeInviteCode(),
      ownerUid: editingTrip ? tripOwnerUid(editingTrip) : finalOwner || undefined,
      cities: cities
        .filter(c => c.name.trim())
        .map((c, i) => ({ ...c, id: `city_${Date.now()}_${i}` })),
      isActive: editingTrip?.isActive || false,
      // Status is always derived live from dates (never a stale stored value)
      status: (new Date(startDate) > new Date() ? 'upcoming' : 'inprogress'),
    };
    onSaveTrip(trip);
    onClose();
  };

  useLockBodyScroll(isOpen);

  if (!isOpen) return null;

  const youId = members.find((m) => m.isCurrentUser)?.id ?? members[0]?.id;

  const canNext = title.trim() && startDate && endDate && budget;

  // Disable past dates for trip start/end
  const todayStr = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  })();

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          {step === 'squad' ? (
            <button onClick={() => setStep('details')} className="p-1.5 -ml-1 rounded-full hover:bg-slate-100 text-slate-700 cursor-pointer">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
          ) : (
            <button onClick={onClose} className="p-1.5 -ml-1 rounded-full hover:bg-slate-100 text-slate-700 cursor-pointer">
              <X size={20} />
            </button>
          )}
          <div>
            <h2 className="font-bold text-slate-900 text-base">
              {editingTrip ? 'Edit Trip' : step === 'details' ? 'Plan New Trip' : 'Add Squad'}
            </h2>
            <p className="text-slate-400 text-[11px]">Step {step === 'details' ? '1' : '2'} of 2</p>
          </div>
        </div>
        {/* Step dots */}
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${step === 'details' ? 'bg-indigo-600' : 'bg-indigo-200'}`} />
          <span className={`w-2 h-2 rounded-full ${step === 'squad' ? 'bg-indigo-600' : 'bg-slate-200'}`} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {step === 'details' ? (
            <>
              {/* Cover Image Picker */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Cover Photo</label>
                <div
                  className="relative h-32 rounded-2xl overflow-hidden cursor-pointer group"
                  onClick={() => setShowCoverPicker(!showCoverPicker)}
                >
                  <img src={coverImage} alt="Cover" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-1.5 bg-white/90 px-3 py-1.5 rounded-lg text-slate-700 text-sm font-medium">
                      <Image size={14} /> Change Photo
                    </div>
                  </div>
                </div>
                {showCoverPicker && (
                  <>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {COVER_IMAGES.map((img) => (
                        <div
                          key={img}
                          onClick={() => { setCoverImage(img); setShowCoverPicker(false); }}
                          className={`relative h-16 rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${coverImage === img ? 'border-indigo-500' : 'border-transparent hover:border-slate-300'}`}
                        >
                          <img src={img} alt="" className="w-full h-full object-cover" />
                          {coverImage === img && (
                            <div className="absolute inset-0 flex items-center justify-center bg-indigo-500/30">
                              <Check size={16} className="text-white" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-2">
                      {!COVER_IMAGES.includes(coverImage) && (
                        <button
                          type="button"
                          onClick={() => setCoverImage(COVER_IMAGES[0])}
                          className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold cursor-pointer"
                          title="Back to default cover"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Location */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Location *</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Goa"
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder-slate-300"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Short note about the trip vibe..."
                  rows={2}
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-slate-300 resize-none overflow-y-auto overscroll-contain break-words"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Start Date *</label>
                  <DatePicker value={startDate} onChange={setStartDate} min={todayStr} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">End Date *</label>
                  <DatePicker value={endDate} onChange={setEndDate} min={startDate} />
                </div>
              </div>

              {/* Budget */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Total Budget (₹) *</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    value={budget}
                    onChange={e => setBudget(e.target.value)}
                    placeholder="e.g. 50000"
                    className="w-full border border-slate-200 rounded-xl pl-8 pr-3.5 py-2.5 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-slate-300"
                  />
                </div>
              </div>

                {/* Itinerary — spots list (days come from trip dates) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Itinerary{tripDays > 0 ? ` (${tripDays}-day trip)` : ''}
                  </label>
                </div>
                <div className="space-y-2.5">
                  <div ref={spotsListRef} className="space-y-2.5 max-h-[30vh] overflow-y-auto overscroll-contain pr-0.5">
                  {cities.map((city, i) => (
                    <div key={i} className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={city.name}
                          onChange={e => setCities(prev => prev.map((c, ci) => ci === i ? { ...c, name: e.target.value } : c))}
                          placeholder="Spot Name"
                          className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-400 placeholder-slate-300"
                        />
                        {cities.length > 1 && (
                          <button onClick={() => setCities(prev => prev.filter((_, ci) => ci !== i))}>
                            <Trash2 size={12} className="text-slate-300 hover:text-red-400 transition-colors" />
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={city.notes || ''}
                        onChange={e => setCities(prev => prev.map((c, ci) => ci === i ? { ...c, notes: e.target.value } : c))}
                        placeholder="Description (Optional)"
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 focus:outline-none focus:border-indigo-400 placeholder-slate-300"
                      />
                    </div>
                  ))}
                  </div>
                  <div className="flex justify-center">
                  <button
                    onClick={addSpot}
                    disabled={lastSpotEmpty}
                    title={lastSpotEmpty ? 'Fill the current spot name first' : 'Add another spot'}
                    className="px-6 py-2 rounded-full bg-white border border-indigo-200 text-indigo-600 text-[11px] font-bold hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm active:scale-[0.98] transition-all"
                  >
                    <span className="text-sm leading-none font-extrabold">+ </span>Add Spot
                  </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Step 2: Squad / Members */
            <>
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-1">Your Squad</h3>
                <p className="text-xs text-slate-400 mb-4">Add friends — expenses split automatically. Your own budget stays the Total Budget from Step 1.</p>

                {/* Squad members (without you) */}
                <div className="space-y-2 mb-4">
                  {members.filter((m) => m.id !== youId).map((m, i) => (
                    <div key={m.id} className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100 space-y-1.5">
                      <div className="flex items-center gap-3">
                        <MemberAvatar name={m.name} avatar={m.avatar} memberId={m.id} index={i} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">
                            {displayMemberName(m)}
                          </p>
                          {m.phone && <p className="text-xs text-slate-400 truncate">{formatPhoneDisplay(m.phone)}</p>}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            title="Edit member"
                            onClick={() => { setEditingMemberId(m.id); setNewMemberName(m.name); setNewMemberPhone(m.phone || ''); setShowManualAdd(true); }}
                          >
                            <Pencil size={13} className="text-slate-300 hover:text-indigo-500 transition-colors" />
                          </button>
                          <button onClick={() => setMembers(prev => prev.filter(mm => mm.id !== m.id))}>
                            <X size={14} className="text-slate-300 hover:text-red-400 transition-colors" />
                          </button>
                        </div>
                      </div>
                      <div className="pl-[38px]">
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500 select-none">₹</span>
                          <input
                            type="number"
                            min={0}
                            value={m.budget || ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? undefined : Number(e.target.value);
                              setMembers(prev => prev.map(mm => mm.id === m.id ? { ...mm, budget: val } : mm));
                            }}
                            placeholder="Budget per Trip"
                            className="w-full rounded-xl bg-slate-50 border border-slate-200 pl-9 pr-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add contacts + Manual — pill style, manual click-pe-khule */}
                <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 space-y-2.5">
                  <div className="flex justify-center gap-2">
                    <button
                      onClick={openContactPicker}
                      className="px-6 py-2 rounded-full bg-indigo-600 text-white text-[11px] font-bold hover:bg-indigo-700 cursor-pointer shadow-md active:scale-[0.98] transition-all"
                    >
                      Add Contacts
                    </button>
                    <button
                      onClick={() => { setShowManualAdd(!showManualAdd); if (showManualAdd) { setEditingMemberId(null); setNewMemberName(''); setNewMemberPhone(''); } }}
                      className="px-6 py-2 rounded-full bg-white border border-indigo-200 text-indigo-600 text-[11px] font-bold hover:bg-indigo-50 cursor-pointer shadow-sm active:scale-[0.98] transition-all"
                    >
                      <span className="text-sm leading-none font-extrabold">+ </span>
                      {showManualAdd && !editingMemberId ? 'Hide Manual' : 'Add Manually'}
                    </button>
                  </div>
                  {(showManualAdd || editingMemberId) && (
                    <>
                      <input
                        type="text"
                        value={newMemberName}
                        onChange={e => setNewMemberName(e.target.value)}
                        placeholder="Friend's name *"
                        className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                      />
                      <PhoneInput
                        value={newMemberPhone}
                        onChange={setNewMemberPhone}
                        placeholder="Phone number"
                      />
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={handleAddCustomMember}
                          disabled={!newMemberName.trim()}
                          className="px-8 py-2 rounded-full bg-indigo-600 text-white text-[11px] font-bold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-md active:scale-[0.98] transition-all cursor-pointer"
                        >
                          {editingMemberId ? 'Save' : 'Add to Squad'}
                        </button>
                        <button
                          onClick={() => { setEditingMemberId(null); setNewMemberName(''); setNewMemberPhone(''); setShowManualAdd(false); }}
                          className="px-5 py-2 rounded-full bg-white border border-slate-200 text-slate-500 text-[11px] font-bold hover:bg-slate-50 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {contactError && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-3 font-medium">{contactError}</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions — pinned to visible bottom */}
        <div className="sticky bottom-0 border-t border-slate-200 px-5 py-3 bg-white/95 backdrop-blur flex-shrink-0 flex justify-center">
          {step === 'details' ? (
            <button
              onClick={() => setStep('squad')}
              disabled={!canNext}
              className="px-10 py-2.5 rounded-full bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all shadow-md cursor-pointer"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSave}
              className="px-10 py-2.5 rounded-full bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-md cursor-pointer"
            >
              {editingTrip ? 'Save' : 'Save Trip'}
            </button>
          )}
        </div>

        {contactList && (
          <ContactPickerModal
            contacts={contactList}
            onClose={() => setContactList(null)}
            onAdd={addPickedContacts}
          />
        )}
      </div>
  );
}
