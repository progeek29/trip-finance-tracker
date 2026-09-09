import React, { useState, useEffect, useRef } from 'react';
import { Trip, TripMember, CityStop } from '../../types';
import { getRandomEmoji } from '../../utils/avatar';
import { putMedia, readFileAsDataUrl } from '../../utils/mediaStore';
import { loadUserProfile } from '../../utils/storage';
import { makeInviteCode } from '../../utils/supabaseClient';
import { MemberAvatar } from '../common/MemberAvatar';
import { DatePicker } from '../common/DatePicker';
import { ContactPickerModal } from '../common/ContactPickerModal';
import { PhoneInput, isValidPhone, formatPhoneDisplay } from '../common/PhoneInput';
import { fetchDeviceContacts, type DeviceContact } from '../../utils/deviceContacts';
import {
  X, MapPin, Trash2,
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
  'https://images.unsplash.com/photo-1589308564641-79f31ea68a78?auto=format&fit=crop&w=800&q=80',
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

  // Squad
  const [members, setMembers] = useState<TripMember[]>(() => [youFromProfile()]);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [contactPickerSupported, setContactPickerSupported] = useState(false);
  const coverUploadRef = useRef<HTMLInputElement>(null);

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
    setNewMemberName(''); setNewMemberPhone('');
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
    } else {
      setTitle(''); setDescription(''); setStartDate(''); setEndDate('');
      setBudget(''); setCoverImage(COVER_IMAGES[0]);
      setMembers([youFromProfile()]);
      setCities([{ name: '', stateOrCountry: '', startDate: '', endDate: '', budget: 0 }]);
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
    // Custom uploaded cover → large store (pointer), defaults stay as URL
    let cover = coverImage;
    if (cover.startsWith('data:')) {
      cover = await putMedia(tripId, 'image', cover);
    }
    const finalMembers = members.map((m) =>
      m.isCurrentUser ? { ...m, name: m.name.trim() || 'You', uid: m.uid || ownerUid || undefined } : m
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
      ownerUid: editingTrip?.ownerUid || ownerUid || undefined,
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
                      <button
                        type="button"
                        onClick={() => coverUploadRef.current?.click()}
                        className="flex-1 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold cursor-pointer"
                      >
                        Upload
                      </button>
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
                    <input
                      ref={coverUploadRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        setCoverImage(await readFileAsDataUrl(f));
                        setShowCoverPicker(false);
                      }}
                    />
                  </>
                )}
              </div>

              {/* Location */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Add Location *</label>
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
                  className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-slate-300 resize-none"
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
                  <button
                    onClick={() => setCities(prev => [...prev, { name: '', stateOrCountry: '', startDate: '', endDate: '', budget: 0, notes: '' }])}
                    className="text-indigo-600 text-xs font-semibold hover:text-indigo-700 cursor-pointer"
                  >
                    Add Spot
                  </button>
                </div>
                <div className="space-y-2.5">
                  {cities.map((city, i) => (
                    <div key={i} className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2">
                      <div className="flex items-center gap-2">
                        <MapPin size={13} className="text-indigo-400 flex-shrink-0" />
                        <input
                          type="text"
                          value={city.name}
                          onChange={e => setCities(prev => prev.map((c, ci) => ci === i ? { ...c, name: e.target.value } : c))}
                          placeholder="Spot name (e.g. Vagator Beach, Chapora Fort)"
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
                        placeholder="Description (optional — e.g. sunset point, entry Rs.100)"
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 focus:outline-none focus:border-indigo-400 placeholder-slate-300"
                      />
                    </div>
                  ))}
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
                            title="Shuffle emoji"
                            onClick={() => setMembers(prev => prev.map(mm => mm.id === m.id ? { ...mm, avatar: getRandomEmoji() } : mm))}
                            className="text-[10px] font-bold text-indigo-600 hover:underline px-1"
                          >
                            Shuffle
                          </button>
                          <button
                            title="Edit member"
                            onClick={() => { setEditingMemberId(m.id); setNewMemberName(m.name); setNewMemberPhone(m.phone || ''); }}
                          >
                            <Pencil size={13} className="text-slate-300 hover:text-indigo-500 transition-colors" />
                          </button>
                          <button onClick={() => setMembers(prev => prev.filter(mm => mm.id !== m.id))}>
                            <X size={14} className="text-slate-300 hover:text-red-400 transition-colors" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 pl-[38px]">
                        <span className="text-[11px] text-slate-500 font-medium">Budget:</span>
                        <input
                          type="number"
                          min={0}
                          value={m.budget || ''}
                          onChange={(e) => {
                            const val = e.target.value === '' ? undefined : Number(e.target.value);
                            setMembers(prev => prev.map(mm => mm.id === m.id ? { ...mm, budget: val } : mm));
                          }}
                          placeholder="0"
                          className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 focus:outline-none focus:border-indigo-400"
                        />
                        <span className="text-[10px] text-slate-400">/trip</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add contacts icon + Manual add */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{editingMemberId ? 'Edit Member' : 'Add Squad Member'}</p>
                    <button
                      onClick={openContactPicker}
                      title="Pick from contacts"
                      className="w-9 h-9 rounded-xl bg-indigo-100 hover:bg-indigo-200 text-indigo-600 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={newMemberName}
                    onChange={e => setNewMemberName(e.target.value)}
                    placeholder="Friend's name *"
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-slate-300"
                  />
                  <PhoneInput
                    value={newMemberPhone}
                    onChange={setNewMemberPhone}
                    placeholder="Phone number"
                  />
                  <button
                    onClick={handleAddCustomMember}
                    disabled={!newMemberName.trim()}
                    className="w-full bg-indigo-600 text-white font-semibold py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    {editingMemberId ? 'Save' : 'Add to Squad'}
                  </button>
                  {editingMemberId && (
                    <button
                      onClick={() => { setEditingMemberId(null); setNewMemberName(''); setNewMemberPhone(''); }}
                      className="w-full text-[11px] text-slate-500 font-bold py-1 cursor-pointer"
                    >
                      Cancel edit
                    </button>
                  )}
                </div>
                {contactError && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-3 font-medium">{contactError}</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-slate-200 px-5 py-4 bg-white flex-shrink-0">
          {step === 'details' ? (
            <button
              onClick={() => setStep('squad')}
              disabled={!canNext}
              className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all shadow-md cursor-pointer"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSave}
              className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-md cursor-pointer"
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
