import React, { useEffect, useState, useRef } from 'react';
import { Trip, TripMember, CityStop } from '../../types';
import { X, Trash2, Pencil, Check, Copy, RefreshCw } from 'lucide-react';
import { resetTripInviteCode } from '../../utils/invites';
import { getRandomEmoji } from '../../utils/avatar';
import { putMedia, readFileAsDataUrl } from '../../utils/mediaStore';
import { MemberAvatar } from '../common/MemberAvatar';
import { DatePicker } from '../common/DatePicker';
import { ContactPickerModal } from '../common/ContactPickerModal';
import { fetchDeviceContacts, type DeviceContact } from '../../utils/deviceContacts';
import { PhoneInput, isValidPhone, formatPhoneDisplay } from '../common/PhoneInput';

const DEFAULT_COVERS = [
  'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1589308564641-79f31ea68a78?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1518684079-3c830dcef090?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=800&q=80',
];

interface TripEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: Trip;
  onSaveTrip: (updatedTrip: Trip) => void;
}

export const TripEditorModal: React.FC<TripEditorModalProps> = ({ isOpen, onClose, trip, onSaveTrip }) => {
  const [tab, setTab] = useState<'details' | 'stops' | 'members'>('details');
  const [title, setTitle] = useState(trip.title);
  const [description, setDescription] = useState(trip.description);
  const [totalBudget, setTotalBudget] = useState(trip.totalBudget);
  const [startDate, setStartDate] = useState(trip.startDate);
  const [endDate, setEndDate] = useState(trip.endDate);
  const [coverImage, setCoverImage] = useState(trip.coverImage);
  const [cities, setCities] = useState<CityStop[]>(trip.cities);
  const [members, setMembers] = useState<TripMember[]>(trip.members);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [contactSupported, setContactSupported] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactList, setContactList] = useState<DeviceContact[] | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showCovers, setShowCovers] = useState(false);
  const [inviteCode, setInviteCode] = useState(trip.inviteCode || '');
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [resettingCode, setResettingCode] = useState(false);
  const coverFileRef = useRef<HTMLInputElement>(null);

  const tripDays = startDate && endDate && new Date(endDate) >= new Date(startDate)
    ? Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1
    : 0;

  const prevTripId = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen) { prevTripId.current = null; return; }
    // Only reset when modal opens or a different trip is edited — not on every parent re-render
    if (prevTripId.current === trip.id) return;
    prevTripId.current = trip.id;
    setTab('details');
    setTitle(trip.title);
    setDescription(trip.description);
    setTotalBudget(trip.totalBudget);
    setStartDate(trip.startDate);
    setEndDate(trip.endDate);
    setCoverImage(trip.coverImage);
    setCities(trip.cities);
    setMembers(trip.members);
    setEditingMemberId(null);
    setNewName(''); setNewPhone('');
    setShowAddMember(false);
    setContactError(null);
    setInviteCode(trip.inviteCode || '');
    setCopiedInvite(false);
    // Correct Contact Picker detection
    // @ts-ignore
    setContactSupported(typeof navigator !== 'undefined' && 'contacts' in navigator && typeof (navigator as any).contacts?.select === 'function');
  }, [isOpen, trip.id]);

  if (!isOpen) return null;

  const pickContacts = async () => {
    setContactError(null);
    try {
      const { contacts } = await fetchDeviceContacts();
      setContactList(contacts);
    } catch {
      setContactError('Could not open phone contacts (permission denied or unavailable). Add manually below.');
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
      const phones = new Set(prev.map((m) => m.phone));
      return [...prev, ...fresh.filter((m) => !m.phone || !phones.has(m.phone))];
    });
    setContactList(null);
  };

  const addMember = () => {
    if (!newName.trim()) return;
    if (newPhone && !isValidPhone(newPhone)) {
      alert('Please enter a valid 10-digit mobile number');
      return;
    }
    if (editingMemberId) {
      setMembers((prev) => prev.map((m) => (m.id === editingMemberId ? { ...m, name: newName.trim(), phone: newPhone.trim() } : m)));
      setEditingMemberId(null);
    } else {
      const name = newName.trim();
      setMembers((prev) => [...prev, { id: `m_${Date.now()}`, name, avatar: getRandomEmoji(), phone: newPhone.trim(), upiId: '', joinedAt: new Date().toISOString() }]);
    }
    setNewName(''); setNewPhone('');
  };

  const startEditMember = (m: TripMember) => {
    setEditingMemberId(m.id);
    setNewName(m.name.replace(/\(You\)/g, '').trim());
    setNewPhone(m.phone || '');
  };

  const shuffleAvatar = (id: string) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, avatar: getRandomEmoji() } : m)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let cover = coverImage;
    if (cover.startsWith('data:')) {
      cover = await putMedia(trip.id, 'image', cover);
    }
    onSaveTrip({ ...trip, title, description, totalBudget: Number(totalBudget), startDate, endDate, coverImage: cover, cities: cities.filter((c) => c.name.trim()), members,
      // Status always re-derived from dates — never carried stale
      status: (new Date(startDate) > new Date() ? 'upcoming' : 'inprogress'),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="max-w-lg w-full rounded-3xl p-6 border border-slate-200 bg-white shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <h3 className="text-lg font-extrabold text-slate-900 font-display">Edit Trip</h3>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex gap-1.5 p-1 bg-slate-100 rounded-xl mb-4">
          {(['details', 'stops', 'members'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`flex-1 py-1.5 rounded-lg text-xs font-bold capitalize cursor-pointer ${tab === t ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500'}`}>{t}</button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {tab === 'details' && (
            <>
              <div><label className="block text-[11px] font-bold text-slate-700 mb-1">Location</label><input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2 text-xs font-bold" /></div>
              <div><label className="block text-[11px] font-bold text-slate-700 mb-1">Description</label><input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2 text-xs" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11px] font-bold text-slate-700 mb-1">Start Date</label><DatePicker value={startDate} onChange={setStartDate} /></div>
                <div><label className="block text-[11px] font-bold text-slate-700 mb-1">End Date</label><DatePicker value={endDate} onChange={setEndDate} min={startDate} /></div>
              </div>
              <div><label className="block text-[11px] font-bold text-slate-700 mb-1">Total Budget (₹)</label><input type="number" required value={totalBudget} onChange={(e) => setTotalBudget(Number(e.target.value))} className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2 text-sm font-extrabold font-display" /></div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Invite Code</label>
                {inviteCode ? (
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-center text-sm font-extrabold tracking-[0.25em] text-indigo-700 bg-indigo-50 border border-dashed border-indigo-300 rounded-xl px-3 py-2">{inviteCode}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(inviteCode);
                        } catch {
                          const ta = document.createElement('textarea');
                          ta.value = inviteCode;
                          document.body.appendChild(ta);
                          ta.select();
                          document.execCommand('copy');
                          document.body.removeChild(ta);
                        }
                        setCopiedInvite(true);
                        setTimeout(() => setCopiedInvite(false), 2000);
                      }}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                      title="Copy code"
                    >
                      {copiedInvite ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    </button>
                    <button
                      type="button"
                      disabled={resettingCode}
                      onClick={async () => {
                        setResettingCode(true);
                        try {
                          const updated = await resetTripInviteCode({ ...trip, inviteCode });
                          setInviteCode(updated.inviteCode || '');
                          onSaveTrip(updated);
                        } catch {
                          alert('Could not reset code. Check internet and retry.');
                        } finally {
                          setResettingCode(false);
                        }
                      }}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer disabled:opacity-50"
                      title="Reset code (old code stops working)"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 font-medium">No code yet — use Share on the trip to create one.</p>
                )}
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Cover Photo</label>
                {coverImage && <img src={coverImage} alt="" className="w-full h-28 object-cover rounded-xl border mb-2" />}
                <button type="button" onClick={() => setShowCovers(!showCovers)} className="w-full py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold cursor-pointer">
                  {showCovers ? 'Hide options' : 'Change cover photo'}
                </button>
                {showCovers && (
                  <>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {DEFAULT_COVERS.map((img) => (
                        <div key={img} onClick={() => setCoverImage(img)} className={`relative h-14 rounded-xl overflow-hidden cursor-pointer border-2 ${coverImage === img ? 'border-indigo-500' : 'border-transparent hover:border-slate-300'}`}>
                          <img src={img} alt="" className="w-full h-full object-cover" />
                          {coverImage === img && <div className="absolute inset-0 flex items-center justify-center bg-indigo-500/30"><Check size={14} className="text-white" /></div>}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button type="button" onClick={() => coverFileRef.current?.click()} className="flex-1 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold cursor-pointer">
                        Upload
                      </button>
                      {!DEFAULT_COVERS.includes(coverImage) && (
                        <button type="button" onClick={() => setCoverImage(DEFAULT_COVERS[0])} className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold cursor-pointer">Reset</button>
                      )}
                    </div>
                    <input ref={coverFileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCoverImage(await readFileAsDataUrl(f)); }} />
                  </>
                )}
              </div>
            </>
          )}

          {tab === 'stops' && (
            <div className="space-y-2.5">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Itinerary{tripDays > 0 ? ` (${tripDays}-day trip)` : ''}</p>
              {cities.map((c) => (
                <div key={c.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2">
                  <div className="flex items-center gap-2">
                    <input value={c.name} onChange={(e) => setCities((prev) => prev.map((cc) => (cc.id === c.id ? { ...cc, name: e.target.value } : cc)))} placeholder="Spot name (e.g. Vagator Beach)" className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm font-bold text-slate-800 focus:outline-none focus:border-indigo-400 placeholder-slate-300" />
                    <button type="button" onClick={() => setCities((prev) => prev.filter((cc) => cc.id !== c.id))}><Trash2 size={13} className="text-slate-300 hover:text-red-400" /></button>
                  </div>
                  <input value={c.notes || ''} onChange={(e) => setCities((prev) => prev.map((cc) => (cc.id === c.id ? { ...cc, notes: e.target.value } : cc)))} placeholder="Description (optional)" className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 focus:outline-none focus:border-indigo-400 placeholder-slate-300" />
                </div>
              ))}
              <button type="button" onClick={() => setCities((prev) => [...prev, { id: `city_${Date.now()}`, name: '', stateOrCountry: '', startDate, endDate, budget: 0 }])} className="w-full py-2 rounded-xl border border-dashed border-indigo-300 text-indigo-600 text-xs font-bold cursor-pointer">Add Spot</button>
            </div>
          )}

          {tab === 'members' && (
            <div className="space-y-2.5">
              {members.map((m, i) => (
                <div key={m.id} className="flex items-center gap-2.5 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                  <MemberAvatar name={m.name} avatar={m.avatar} memberId={m.id} index={i} size="sm" />
                  <div className="flex-1 min-w-0"><p className="text-xs font-bold truncate">{m.isCurrentUser ? `${m.name.replace(/\(You\)/g, '').trim() || 'You'} (You)` : m.name}{m.uid
                    ? <span className="ml-1.5 text-[9px] font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">JOINED</span>
                    : <span className="ml-1.5 text-[9px] font-extrabold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-1.5 py-0.5" title="No app yet — expenses still split normally">MANUAL</span>}</p><p className="text-[11px] text-slate-400 truncate">{formatPhoneDisplay(m.phone || m.upiId) || 'No contact'}</p></div>
                  <button type="button" onClick={() => shuffleAvatar(m.id)} title="Shuffle emoji" className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer">Shuffle</button>
                  {!m.isCurrentUser && (
                    <>
                      <button type="button" onClick={() => { startEditMember(m); setShowAddMember(true); }}><Pencil size={13} className="text-slate-400 hover:text-indigo-500" /></button>
                      <button type="button" onClick={() => setMembers((prev) => prev.filter((mm) => mm.id !== m.id))}><X size={14} className="text-slate-300 hover:text-red-400" /></button>
                    </>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => { setShowAddMember(!showAddMember); setEditingMemberId(null); setNewName(''); setNewPhone(''); }} className="w-full py-2.5 rounded-xl border border-dashed border-indigo-300 text-indigo-600 text-xs font-bold cursor-pointer">
                {showAddMember ? 'Hide' : 'Add Member'}
              </button>
              {showAddMember && (
                <div className="space-y-2.5">
                  <button type="button" onClick={pickContacts} className="w-full bg-indigo-600 text-white font-semibold py-2.5 rounded-xl text-xs hover:bg-indigo-700 cursor-pointer">Add Contacts</button>
                  {contactError && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-medium">{contactError}</p>
                  )}
                  {!contactSupported && !contactError && (
                    <p className="text-[11px] text-slate-400 text-center">Phone contacts open on Android Chrome / the app. Otherwise add manually below.</p>
                  )}
                  <div className="bg-slate-50 rounded-xl p-3 border space-y-2">
                    <p className="text-[11px] font-bold text-slate-500 uppercase">{editingMemberId ? 'Edit member' : 'Add manually'}</p>
                    <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name *" className="w-full border rounded-xl px-3 py-2 text-xs" />
                    <PhoneInput value={newPhone} onChange={setNewPhone} placeholder="Phone" />
                    <button type="button" onClick={addMember} disabled={!newName.trim()} className="w-full bg-indigo-600 text-white text-xs font-bold py-2 rounded-xl disabled:opacity-40 cursor-pointer">{editingMemberId ? 'Save' : 'Add to Squad'}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="pt-3 border-t border-slate-100">
            <button type="submit" className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer">Save</button>
          </div>
        </form>
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
};
