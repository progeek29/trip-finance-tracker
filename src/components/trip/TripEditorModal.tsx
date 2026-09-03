import React, { useEffect, useState } from 'react';
import { Trip, TripMember, CityStop } from '../../types';
import { X, Plus, Trash2, Phone, UserPlus, Pencil } from 'lucide-react';
import { getRandomAvatar } from '../../utils/avatar';
import { MemberAvatar } from '../common/MemberAvatar';

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
  const [newUpi, setNewUpi] = useState('');
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [contactSupported, setContactSupported] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
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
    // Correct Contact Picker detection
    // @ts-ignore
    setContactSupported(typeof navigator !== 'undefined' && 'contacts' in navigator && typeof (navigator as any).contacts?.select === 'function');
  }, [isOpen, trip]);

  if (!isOpen) return null;

  const pickContacts = async () => {
    try {
      // @ts-ignore
      const contacts = await (navigator as any).contacts.select(['name', 'tel'], { multiple: true });
      const fresh: TripMember[] = (contacts as any[])
        .filter((c) => c.name?.length)
        .map((c: any, i: number) => ({
          id: `m_contact_${Date.now()}_${i}`,
          name: c.name[0],
          avatar: getRandomAvatar(c.name[0] + Date.now() + i),
          phone: c.tel?.[0] || '',
          upiId: '',
        }));
      setMembers((prev) => {
        const phones = new Set(prev.map((m) => m.phone));
        return [...prev, ...fresh.filter((m) => !phones.has(m.phone))];
      });
    } catch {
      /* user cancelled */
    }
  };

  const addMember = () => {
    if (!newName.trim()) return;
    if (editingMemberId) {
      setMembers((prev) => prev.map((m) => (m.id === editingMemberId ? { ...m, name: newName.trim(), phone: newPhone.trim(), upiId: newUpi.trim() } : m)));
      setEditingMemberId(null);
    } else {
      const name = newName.trim();
      setMembers((prev) => [...prev, { id: `m_${Date.now()}`, name, avatar: getRandomAvatar(name + Date.now()), phone: newPhone.trim(), upiId: newUpi.trim() }]);
    }
    setNewName(''); setNewPhone(''); setNewUpi('');
  };

  const startEditMember = (m: TripMember) => {
    setEditingMemberId(m.id);
    setNewName(m.name);
    setNewPhone(m.phone || '');
    setNewUpi(m.upiId || '');
  };

  const shuffleAvatar = (id: string, name: string) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, avatar: getRandomAvatar(name + Math.random()) } : m)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveTrip({ ...trip, title, description, totalBudget: Number(totalBudget), startDate, endDate, coverImage, cities: cities.filter((c) => c.name.trim()), members });
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
              <div><label className="block text-[11px] font-bold text-slate-700 mb-1">Trip Name</label><input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2 text-xs font-bold" /></div>
              <div><label className="block text-[11px] font-bold text-slate-700 mb-1">Description</label><input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2 text-xs" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11px] font-bold text-slate-700 mb-1">Start Date</label><input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className="date-input" /></div>
                <div><label className="block text-[11px] font-bold text-slate-700 mb-1">End Date</label><input type="date" required value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="date-input" /></div>
              </div>
              <div><label className="block text-[11px] font-bold text-slate-700 mb-1">Total Budget (₹)</label><input type="number" required value={totalBudget} onChange={(e) => setTotalBudget(Number(e.target.value))} className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2 text-sm font-extrabold font-display" /></div>
              <div><label className="block text-[11px] font-bold text-slate-700 mb-1">Cover Image URL</label><input type="url" value={coverImage} onChange={(e) => setCoverImage(e.target.value)} className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2 text-xs" />{coverImage && <img src={coverImage} alt="" className="w-full h-28 object-cover rounded-xl mt-2 border" />}</div>
            </>
          )}

          {tab === 'stops' && (
            <div className="space-y-2.5">
              {cities.map((c, i) => (
                <div key={c.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input value={c.name} onChange={(e) => setCities((prev) => prev.map((cc) => (cc.id === c.id ? { ...cc, name: e.target.value } : cc)))} placeholder="Stop name" className="flex-1 bg-transparent text-sm font-bold focus:outline-none" />
                    <button type="button" onClick={() => setCities((prev) => prev.filter((cc) => cc.id !== c.id))}><Trash2 size={13} className="text-slate-300 hover:text-red-400" /></button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <input type="date" value={c.startDate} onChange={(e) => setCities((prev) => prev.map((cc) => (cc.id === c.id ? { ...cc, startDate: e.target.value } : cc)))} className="date-input !py-1 !text-[11px]" />
                    <input type="date" value={c.endDate} onChange={(e) => setCities((prev) => prev.map((cc) => (cc.id === c.id ? { ...cc, endDate: e.target.value } : cc)))} className="date-input !py-1 !text-[11px]" />
                    <input type="number" value={c.budget || ''} onChange={(e) => setCities((prev) => prev.map((cc) => (cc.id === c.id ? { ...cc, budget: Number(e.target.value) } : cc)))} placeholder="₹" className="bg-white border border-slate-200 rounded-xl px-2 py-1 text-xs" />
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => setCities((prev) => [...prev, { id: `city_${Date.now()}`, name: '', stateOrCountry: '', startDate, endDate, budget: 0 }])} className="w-full py-2 rounded-xl border border-dashed border-indigo-300 text-indigo-600 text-xs font-bold cursor-pointer">+ Add Stop</button>
            </div>
          )}

          {tab === 'members' && (
            <div className="space-y-2.5">
              {members.map((m, i) => (
                <div key={m.id} className="flex items-center gap-2.5 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                  <MemberAvatar name={m.name} avatar={m.avatar} memberId={m.id} index={i} size="sm" />
                  <div className="flex-1 min-w-0"><p className="text-xs font-bold truncate">{m.name} {m.isCurrentUser && '(You)'}</p><p className="text-[11px] text-slate-400 truncate">{m.phone || m.upiId || 'No contact'}</p></div>
                  <button type="button" onClick={() => shuffleAvatar(m.id, m.name)} title="New random photo" className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer">↻ Photo</button>
                  {!m.isCurrentUser && (
                    <>
                      <button type="button" onClick={() => startEditMember(m)}><Pencil size={13} className="text-slate-400 hover:text-indigo-500" /></button>
                      <button type="button" onClick={() => setMembers((prev) => prev.filter((mm) => mm.id !== m.id))}><X size={14} className="text-slate-300 hover:text-red-400" /></button>
                    </>
                  )}
                </div>
              ))}
              {contactSupported ? (
                <button type="button" onClick={pickContacts} className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-semibold py-2.5 rounded-xl text-xs cursor-pointer"><Phone size={14} /> Pick from Phone Contacts</button>
              ) : (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-center">📱 Contact Picker works on Android Chrome — add manually here.</p>
              )}
              <div className="bg-slate-50 rounded-xl p-3 border space-y-2">
                <p className="text-[11px] font-bold text-slate-500 uppercase">{editingMemberId ? 'Edit member' : 'Add member'}</p>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name *" className="w-full border rounded-xl px-3 py-2 text-xs" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Phone" className="border rounded-xl px-3 py-2 text-xs" />
                  <input value={newUpi} onChange={(e) => setNewUpi(e.target.value)} placeholder="UPI ID" className="border rounded-xl px-3 py-2 text-xs" />
                </div>
                <button type="button" onClick={addMember} disabled={!newName.trim()} className="w-full flex items-center justify-center gap-1.5 bg-indigo-600 text-white text-xs font-bold py-2 rounded-xl disabled:opacity-40 cursor-pointer"><UserPlus size={13} /> {editingMemberId ? 'Save Member' : 'Add to Squad'}</button>
                {editingMemberId && <button type="button" onClick={() => { setEditingMemberId(null); setNewName(''); setNewPhone(''); setNewUpi(''); }} className="w-full text-[11px] text-slate-500 font-bold cursor-pointer">Cancel edit</button>}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-slate-500 hover:text-slate-800 text-xs font-bold cursor-pointer">Cancel</button>
            <button type="submit" className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer">Save Trip</button>
          </div>
        </form>
      </div>
    </div>
  );
};
