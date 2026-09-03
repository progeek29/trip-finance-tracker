import React, { useState, useEffect } from 'react';
import { Trip, TripMember, CityStop } from '../../types';
import { getRandomAvatar } from '../../utils/avatar';
import { MemberAvatar } from '../common/MemberAvatar';
import {
  X, MapPin, Plus, Trash2,
  Phone, UserPlus, Check, Image, Pencil
} from 'lucide-react';

interface TripCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveTrip: (trip: Trip) => void;
  editingTrip?: Trip | null;
}

const COVER_IMAGES = [
  'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1589308564641-79f31ea68a78?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1518684079-3c830dcef090?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=800&q=80',
];

const ME_MEMBER: TripMember = {
  id: 'm1',
  name: 'Apurv (You)',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
  isCurrentUser: true,
  phone: '+91 98765 43210',
  upiId: 'apurv@oksbi',
};

export function TripCreateModal({ isOpen, onClose, onSaveTrip, editingTrip }: TripCreateModalProps) {
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
  const [members, setMembers] = useState<TripMember[]>([ME_MEMBER]);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [newMemberUpi, setNewMemberUpi] = useState('');
  const [contactPickerSupported, setContactPickerSupported] = useState(false);

  useEffect(() => {
    // Correct Contact Picker API detection
    // @ts-ignore
    setContactPickerSupported(typeof navigator !== 'undefined' && 'contacts' in navigator && typeof (navigator as any).contacts?.select === 'function');
  }, []);

  useEffect(() => {
    if (!isOpen) { setStep('details'); return; }
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
      setMembers([ME_MEMBER]);
      setCities([{ name: '', stateOrCountry: '', startDate: '', endDate: '', budget: 0 }]);
    }
  }, [isOpen, editingTrip]);

  const handlePickContacts = async () => {
    try {
      // @ts-ignore
      const contacts = await (navigator as any).contacts.select(['name', 'tel'], { multiple: true });
      const newMembers: TripMember[] = contacts
        .filter((c: any) => c.name?.length)
        .map((c: any, i: number) => ({
          id: `m_contact_${Date.now()}_${i}`,
          name: c.name[0],
          avatar: getRandomAvatar(String(c.name[0]) + Date.now() + i),
          phone: c.tel?.[0] || '',
          upiId: '',
        }));
      setMembers(prev => {
        const existingPhones = new Set(prev.map(m => m.phone));
        return [...prev, ...newMembers.filter(m => !existingPhones.has(m.phone))];
      });
    } catch (e) {
      console.log('Contact picker cancelled or unavailable', e);
    }
  };

  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);

  const handleAddCustomMember = () => {
    if (!newMemberName.trim()) return;
    const name = newMemberName.trim();
    if (editingMemberId) {
      setMembers(prev => prev.map(m => m.id === editingMemberId ? { ...m, name, phone: newMemberPhone.trim(), upiId: newMemberUpi.trim() } : m));
      setEditingMemberId(null);
    } else {
      const newM: TripMember = {
        id: `m_${Date.now()}`,
        name,
        avatar: getRandomAvatar(name + Date.now()),
        phone: newMemberPhone.trim(),
        upiId: newMemberUpi.trim(),
      };
      setMembers(prev => [...prev, newM]);
    }
    setNewMemberName(''); setNewMemberPhone(''); setNewMemberUpi('');
  };

  const handleSave = () => {
    if (!title.trim() || !startDate || !endDate || !budget) return;
    const trip: Trip = {
      id: editingTrip?.id || `trip_${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      coverImage,
      startDate,
      endDate,
      totalBudget: Number(budget) || 0,
      currency: 'INR',
      members,
      cities: cities
        .filter(c => c.name.trim())
        .map((c, i) => ({ ...c, id: `city_${Date.now()}_${i}` })),
      isActive: editingTrip?.isActive || false,
      status: editingTrip?.status || (new Date(startDate) > new Date() ? 'upcoming' : 'ongoing'),
    };
    onSaveTrip(trip);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-900 text-lg">
              {editingTrip ? 'Edit Trip' : 'Plan New Trip'}
            </h2>
            <p className="text-slate-400 text-xs">Step {step === 'details' ? '1' : '2'} of 2 — {step === 'details' ? 'Trip Details' : 'Add Squad'}</p>
          </div>
          {/* Step tabs */}
          <div className="flex gap-1.5 mr-8">
            <button onClick={() => setStep('details')}
              className={`w-7 h-7 rounded-full text-xs font-bold transition-colors ${step === 'details' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
              1
            </button>
            <button onClick={() => step === 'squad' && setStep('squad')}
              className={`w-7 h-7 rounded-full text-xs font-bold transition-colors ${step === 'squad' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
              2
            </button>
          </div>
          <button onClick={onClose} className="absolute right-4 top-4 p-2 rounded-full hover:bg-slate-100 transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-4">
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
                )}
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Trip Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Goa Friends Getaway 2026"
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
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    className="date-input" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">End Date *</label>
                  <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)}
                    className="date-input" />
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

              {/* Cities */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Cities / Stops</label>
                  <button
                    onClick={() => setCities(prev => [...prev, { name: '', stateOrCountry: '', startDate: '', endDate: '', budget: 0 }])}
                    className="text-indigo-600 text-xs font-semibold flex items-center gap-1 hover:text-indigo-700"
                  >
                    <Plus size={12} /> Add City
                  </button>
                </div>
                <div className="space-y-2.5">
                  {cities.map((city, i) => (
                    <div key={i} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin size={13} className="text-indigo-400 flex-shrink-0" />
                        <input
                          type="text"
                          value={city.name}
                          onChange={e => setCities(prev => prev.map((c, ci) => ci === i ? { ...c, name: e.target.value } : c))}
                          placeholder="City name"
                          className="flex-1 bg-transparent text-sm text-slate-800 focus:outline-none placeholder-slate-300"
                        />
                        {cities.length > 1 && (
                          <button onClick={() => setCities(prev => prev.filter((_, ci) => ci !== i))}>
                            <Trash2 size={12} className="text-slate-300 hover:text-red-400 transition-colors" />
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={city.stateOrCountry}
                        onChange={e => setCities(prev => prev.map((c, ci) => ci === i ? { ...c, stateOrCountry: e.target.value } : c))}
                        placeholder="State / Country"
                        className="w-full bg-transparent text-xs text-slate-500 focus:outline-none placeholder-slate-300 mb-1.5"
                      />
                      <div className="grid grid-cols-3 gap-1.5">
                        <input type="date" value={city.startDate}
                          onChange={e => setCities(prev => prev.map((c, ci) => ci === i ? { ...c, startDate: e.target.value } : c))}
                          className="col-span-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600 focus:outline-none" />
                        <input type="date" value={city.endDate}
                          onChange={e => setCities(prev => prev.map((c, ci) => ci === i ? { ...c, endDate: e.target.value } : c))}
                          className="col-span-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600 focus:outline-none" />
                        <input type="number" value={city.budget || ''}
                          onChange={e => setCities(prev => prev.map((c, ci) => ci === i ? { ...c, budget: Number(e.target.value) } : c))}
                          placeholder="₹ Budget"
                          className="col-span-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600 focus:outline-none" />
                      </div>
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
                <p className="text-xs text-slate-400 mb-4">Add friends to split expenses and track together.</p>

                {/* Current members */}
                <div className="space-y-2 mb-4">
                  {members.map((m, i) => (
                    <div key={m.id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
                      <MemberAvatar name={m.name} avatar={m.avatar} memberId={m.id} index={i} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {m.name} {m.isCurrentUser && <span className="text-indigo-400 text-xs font-normal">(You)</span>}
                        </p>
                        {m.phone && <p className="text-xs text-slate-400 truncate">{m.phone}</p>}
                      </div>
                      {!m.isCurrentUser && (
                        <div className="flex items-center gap-1">
                          <button
                            title="New random photo"
                            onClick={() => setMembers(prev => prev.map(mm => mm.id === m.id ? { ...mm, avatar: getRandomAvatar(m.name + Math.random()) } : mm))}
                            className="text-[10px] font-bold text-indigo-600 hover:underline px-1"
                          >
                            ↻
                          </button>
                          <button
                            title="Edit member"
                            onClick={() => { setEditingMemberId(m.id); setNewMemberName(m.name); setNewMemberPhone(m.phone || ''); setNewMemberUpi(m.upiId || ''); }}
                          >
                            <Pencil size={13} className="text-slate-300 hover:text-indigo-500 transition-colors" />
                          </button>
                          <button onClick={() => setMembers(prev => prev.filter(mm => mm.id !== m.id))}>
                            <X size={14} className="text-slate-300 hover:text-red-400 transition-colors" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Pick from Contacts */}
                {contactPickerSupported ? (
                  <button
                    onClick={handlePickContacts}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-semibold py-3 rounded-xl hover:from-indigo-600 hover:to-violet-600 active:scale-95 transition-all shadow-md shadow-indigo-200 mb-4"
                  >
                    <Phone size={16} /> 📱 Pick from Phone Contacts
                  </button>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-center">
                    <p className="text-amber-700 text-xs font-medium">📱 Contact Picker works on Android Chrome.</p>
                    <p className="text-amber-500 text-xs">Add friends manually below or on your phone.</p>
                  </div>
                )}

                {/* Manual Add */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{editingMemberId ? 'Edit Member' : 'Add Manually'}</p>
                  <div className="space-y-2.5">
                    <input
                      type="text"
                      value={newMemberName}
                      onChange={e => setNewMemberName(e.target.value)}
                      placeholder="Friend's name *"
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-slate-300"
                    />
                    <input
                      type="tel"
                      value={newMemberPhone}
                      onChange={e => setNewMemberPhone(e.target.value)}
                      placeholder="Phone number"
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-slate-300"
                    />
                    <input
                      type="text"
                      value={newMemberUpi}
                      onChange={e => setNewMemberUpi(e.target.value)}
                      placeholder="UPI ID (for settlements)"
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-slate-300"
                    />
                    <button
                      onClick={handleAddCustomMember}
                      disabled={!newMemberName.trim()}
                      className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <UserPlus size={15} /> {editingMemberId ? 'Save Member' : 'Add to Squad'}
                    </button>
                    {editingMemberId && (
                      <button
                        onClick={() => { setEditingMemberId(null); setNewMemberName(''); setNewMemberPhone(''); setNewMemberUpi(''); }}
                        className="w-full text-[11px] text-slate-500 font-bold py-1 cursor-pointer"
                      >
                        Cancel edit
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-slate-100 px-5 py-4 flex gap-3">
          {step === 'details' ? (
            <>
              <button onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 font-semibold py-3 rounded-xl hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => setStep('squad')}
                disabled={!title || !startDate || !endDate || !budget}
                className="flex-1 bg-indigo-600 text-white font-semibold py-3 rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next → Add Squad
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setStep('details')} className="flex-1 border border-slate-200 text-slate-600 font-semibold py-3 rounded-xl hover:bg-slate-50 transition-colors">
                ← Back
              </button>
              <button
                onClick={handleSave}
                className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold py-3 rounded-xl hover:from-indigo-700 hover:to-violet-700 active:scale-95 transition-all shadow-md"
              >
                {editingTrip ? '✓ Save Changes' : '🚀 Create Trip!'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
