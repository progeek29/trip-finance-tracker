import React, { useState } from 'react';
import { Trip, TransitReminder, Expense, CityStop } from '../../types';
import { Plane, Train, Bus, Car, Hotel, Copy, Check, Sparkles, Plus, Zap, Edit2, Trash2, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { MemberAvatar } from '../common/MemberAvatar';

interface CleanTripViewProps {
  trip: Trip;
  reminders: TransitReminder[];
  expenses: Expense[];
  onOpenQuickAdd: () => void;
  onOpenTripEditor: () => void;
  onUpdateTrip: (trip: Trip) => void;
  onAddReminder: (r: TransitReminder) => void;
  onUpdateReminder: (r: TransitReminder) => void;
  onDeleteReminder: (id: string) => void;
}

export const CleanTripView: React.FC<CleanTripViewProps> = ({
  trip,
  reminders,
  expenses,
  onOpenQuickAdd,
  onOpenTripEditor,
  onUpdateTrip,
  onAddReminder,
  onUpdateReminder,
  onDeleteReminder,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [simulatedToast, setSimulatedToast] = useState<string | null>(null);
  const [stopModal, setStopModal] = useState<{ open: boolean; editing: CityStop | null }>({ open: false, editing: null });
  const [transitModal, setTransitModal] = useState<{ open: boolean; editing: TransitReminder | null }>({ open: false, editing: null });

  const totalSpent = expenses.reduce((a, b) => a + b.amount, 0);
  const remaining = trip.totalBudget - totalSpent;
  const percentSpent = trip.totalBudget > 0 ? Math.min(100, Math.round((totalSpent / trip.totalBudget) * 100)) : 0;
  const nextTransit = reminders[0];

  const handleCopy = async (id: string, text?: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSimulateIncomingSMS = () => {
    const merchants = ['Cafe Mambo Baga', 'Burger Factory Anjuna', 'Thalassa Siolim', 'Goa Cab Service', "Tito's Club"];
    const amounts = [650, 1200, 2400, 850, 3100];
    const idx = Math.floor(Math.random() * merchants.length);
    setSimulatedToast(`💸 HDFC Bank Alert: ₹${amounts[idx]} debited at ${merchants[idx]}. Auto-logged to ${trip.title}!`);
    confetti({ particleCount: 40, spread: 50, origin: { y: 0.8 } });
    setTimeout(() => setSimulatedToast(null), 4500);
  };

  const deleteStop = (id: string) => {
    if (!window.confirm('Delete this stop?')) return;
    onUpdateTrip({ ...trip, cities: trip.cities.filter((c) => c.id !== id) });
  };

  const transitIcon = (t: TransitReminder['type']) => {
    if (t === 'flight') return Plane;
    if (t === 'train') return Train;
    if (t === 'bus') return Bus;
    if (t === 'cab') return Car;
    return Hotel;
  };

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
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
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${trip.coverImage})` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/65 to-slate-900/25" />
        <div className="relative z-10 p-6 sm:p-7 space-y-4">
          <div className="flex items-center justify-between">
            <span className="px-3 py-1 rounded-full bg-emerald-500 text-white text-xs font-extrabold shadow-sm">
              {new Date(trip.startDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} → {new Date(trip.endDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </span>
            <button onClick={onOpenTripEditor} className="text-xs text-white/90 hover:text-white px-3 py-1 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/20 font-semibold transition-all cursor-pointer">
              Edit Trip
            </button>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-display">{trip.title}</h1>
            <p className="text-slate-200 text-xs sm:text-sm mt-1 max-w-xl">{trip.description}</p>
          </div>
          <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-white/20">
            <div className="flex items-center gap-2.5">
              <div className="flex -space-x-2">
                {trip.members.slice(0, 6).map((m, i) => (
                  <MemberAvatar key={m.id} name={m.name} avatar={m.avatar} memberId={m.id} index={i} size="sm" />
                ))}
              </div>
              <button onClick={onOpenTripEditor} className="text-xs text-white font-semibold hover:underline cursor-pointer">
                {trip.members.length} Squad Member{trip.members.length !== 1 ? 's' : ''} · Manage
              </button>
            </div>
            <div className="bg-black/30 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/10 text-left sm:text-right">
              <span className="text-[11px] text-slate-300 block">Remaining Budget</span>
              <span className="text-sm font-extrabold text-emerald-400">
                ₹{remaining.toLocaleString('en-IN')} <span className="text-slate-300 font-normal text-xs">left ({100 - percentSpent}%)</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Snapshot */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="clean-card rounded-2xl p-4 border border-slate-200 bg-white shadow-2xs space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Total Spent</span>
          <div className="text-xl font-extrabold text-slate-900 font-display">₹{totalSpent.toLocaleString('en-IN')}</div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
            <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${percentSpent}%` }} />
          </div>
          <span className="text-[10px] text-slate-500 font-medium block pt-1">{percentSpent}% of ₹{trip.totalBudget.toLocaleString('en-IN')} budget</span>
        </div>
        <div className="clean-card rounded-2xl p-4 border border-slate-200 bg-white shadow-2xs space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Squad Size</span>
          <div className="text-xl font-extrabold text-slate-900 font-display">{trip.members.length} friends</div>
          <span className="text-[11px] text-slate-500 font-medium block pt-1">Splitwise across all group bills</span>
        </div>
        <div className="clean-card rounded-2xl p-4 border border-slate-200 bg-white shadow-2xs space-y-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Next Upcoming Event</span>
          <div className="text-sm font-extrabold text-slate-900 truncate">{nextTransit?.title || 'No upcoming transit'}</div>
          <span className="text-[11px] text-indigo-600 font-bold block">{nextTransit ? `${nextTransit.operator || ''} • Tap transit below for PNR` : 'Relax mode'}</span>
        </div>
      </div>

      {/* SMS simulator */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-extrabold text-indigo-950">Android APK Background SMS Listener</span>
          </div>
          <p className="text-[11px] text-slate-600">In the native Android app, debited bank SMS messages are picked up automatically in the background without copy-pasting.</p>
        </div>
        <button onClick={handleSimulateIncomingSMS} className="flex-shrink-0 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs shadow-indigo-200 transition-all cursor-pointer">
          <Zap className="w-3.5 h-3.5" />
          <span>Simulate SMS Alert</span>
        </button>
      </div>

      {/* Transit list with edit/delete */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-900 font-display">Transit & Tickets ({reminders.length})</h3>
          <button onClick={() => setTransitModal({ open: true, editing: null })} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> Add Transit
          </button>
        </div>
        {reminders.length === 0 && <p className="text-xs text-slate-500 bg-white border border-dashed border-slate-300 rounded-2xl p-4 text-center">No transit added yet.</p>}
        {reminders.map((t) => {
          const Icon = transitIcon(t.type);
          return (
            <div key={t.id} className="clean-card rounded-2xl p-5 border border-slate-200 bg-white shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 flex-shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-900 block">{t.title}</span>
                    <span className="text-xs text-slate-500 font-medium">{t.operator} {t.transitNumber ? `• ${t.transitNumber}` : ''}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setTransitModal({ open: true, editing: t })} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => window.confirm('Delete this transit?') && onDeleteReminder(t.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] font-bold uppercase tracking-wider">Departure</span>
                  <span className="font-bold text-slate-900 text-sm">{t.departureLocation} → {t.arrivalLocation}</span>
                  <span className="text-indigo-600 block text-xs font-semibold mt-0.5">
                    {t.departureTime ? new Date(t.departureTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </span>
                </div>
                {t.pnrOrBookingRef && (
                  <button onClick={() => handleCopy(t.id, t.pnrOrBookingRef)} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-mono font-bold text-slate-700 hover:border-indigo-500 hover:text-indigo-600 shadow-2xs transition-all cursor-pointer" title="Tap to copy PNR">
                    <span>PNR: {t.pnrOrBookingRef}</span>
                    {copiedId === t.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Itinerary with edit/delete */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-900 font-display">Trip Itinerary & Stops</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">{trip.cities.length} Stops Planned</span>
            <button onClick={() => setStopModal({ open: true, editing: null })} className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> Add Stop
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {trip.cities.map((city, idx) => {
            const cityExpenses = expenses.filter((e) => e.cityId === city.id);
            const spent = cityExpenses.reduce((a, b) => a + b.amount, 0);
            return (
              <div key={city.id} className="clean-card rounded-2xl p-4 border border-slate-200 bg-white shadow-xs hover:border-indigo-300 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold text-indigo-700 uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">Stop #{idx + 1}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-slate-600 mr-1">₹{spent.toLocaleString('en-IN')} spent</span>
                    <button onClick={() => setStopModal({ open: true, editing: city })} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer" title="Edit stop"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => deleteStop(city.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer" title="Delete stop"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <h4 className="font-extrabold text-slate-900 text-base font-display">{city.name}</h4>
                <p className="text-xs text-slate-600 line-clamp-2">{city.notes || city.stateOrCountry}</p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-medium">
                  <span>Target: ₹{city.budget.toLocaleString('en-IN')}</span>
                  <span className="text-indigo-600 font-bold">{city.startDate?.slice(5)} → {city.endDate?.slice(5)}</span>
                </div>
              </div>
            );
          })}
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
      {transitModal.open && (
        <TransitFormModal
          tripId={trip.id}
          editing={transitModal.editing}
          onClose={() => setTransitModal({ open: false, editing: null })}
          onSave={(r) => {
            if (transitModal.editing) onUpdateReminder(r);
            else onAddReminder(r);
            setTransitModal({ open: false, editing: null });
          }}
        />
      )}
    </div>
  );
};

function StopFormModal({ editing, onClose, onSave }: { editing: CityStop | null; onClose: () => void; onSave: (s: CityStop) => void }) {
  const [name, setName] = useState(editing?.name || '');
  const [state, setState] = useState(editing?.stateOrCountry || '');
  const [startDate, setStartDate] = useState(editing?.startDate || '');
  const [endDate, setEndDate] = useState(editing?.endDate || '');
  const [budget, setBudget] = useState<number | ''>(editing?.budget ?? '');
  const [notes, setNotes] = useState(editing?.notes || '');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { alert('Stop name required'); return; }
    onSave({ id: editing?.id || `city_${Date.now()}`, name: name.trim(), stateOrCountry: state, startDate, endDate, budget: Number(budget) || 0, notes });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
      <form onSubmit={submit} className="bg-white max-w-md w-full rounded-3xl p-6 space-y-3 shadow-2xl">
        <div className="flex items-center justify-between">
          <h4 className="font-extrabold">{editing ? 'Edit Stop' : 'Add Stop'}</h4>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Stop name *" className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-bold" />
        <input value={state} onChange={(e) => setState(e.target.value)} placeholder="State / Country" className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs" />
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-[11px] font-bold text-slate-500">Start</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="date-input" /></div>
          <div><label className="text-[11px] font-bold text-slate-500">End</label><input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="date-input" /></div>
        </div>
        <input type="number" value={budget} onChange={(e) => setBudget(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Budget ₹" className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-bold" />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" rows={2} className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs" />
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-500 cursor-pointer">Cancel</button><button className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold cursor-pointer">{editing ? 'Save' : 'Add Stop'}</button></div>
      </form>
    </div>
  );
}

function TransitFormModal({ tripId, editing, onClose, onSave }: { tripId: string; editing: TransitReminder | null; onClose: () => void; onSave: (r: TransitReminder) => void }) {
  const [title, setTitle] = useState(editing?.title || '');
  const [type, setType] = useState<TransitReminder['type']>(editing?.type || 'flight');
  const [operator, setOperator] = useState(editing?.operator || '');
  const [transitNumber, setTransitNumber] = useState(editing?.transitNumber || '');
  const [from, setFrom] = useState(editing?.departureLocation || '');
  const [to, setTo] = useState(editing?.arrivalLocation || '');
  const [dep, setDep] = useState(editing?.departureTime || '');
  const [arr, setArr] = useState(editing?.arrivalTime || '');
  const [pnr, setPnr] = useState(editing?.pnrOrBookingRef || '');
  const [seat, setSeat] = useState(editing?.seatOrBerth || '');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !from.trim() || !dep) { alert('Title, departure + time required'); return; }
    onSave({ id: editing?.id || `rem_${Date.now()}`, tripId, title: title.trim(), type, operator, transitNumber, departureLocation: from.trim(), arrivalLocation: to.trim(), departureTime: dep, arrivalTime: arr || dep, pnrOrBookingRef: pnr, seatOrBerth: seat, reminderHoursBefore: editing?.reminderHoursBefore || 3 });
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
      <form onSubmit={submit} className="bg-white max-w-md w-full rounded-3xl p-6 space-y-3 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h4 className="font-extrabold">{editing ? 'Edit Transit' : 'Add Transit'}</h4>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title * e.g. IndiGo 6E-204" className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-bold" />
        <div className="grid grid-cols-3 gap-2">
          <select value={type} onChange={(e) => setType(e.target.value as any)} className="rounded-xl bg-slate-50 border px-2 py-2 text-xs font-bold">
            <option value="flight">Flight</option><option value="train">Train</option><option value="bus">Bus</option><option value="cab">Cab</option><option value="hotel_checkin">Hotel</option>
          </select>
          <input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="Operator" className="rounded-xl bg-slate-50 border px-3 py-2 text-xs" />
          <input value={transitNumber} onChange={(e) => setTransitNumber(e.target.value)} placeholder="No." className="rounded-xl bg-slate-50 border px-3 py-2 text-xs" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From *" className="rounded-xl bg-slate-50 border px-3 py-2 text-xs" />
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" className="rounded-xl bg-slate-50 border px-3 py-2 text-xs" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-[11px] font-bold text-slate-500">Departure *</label><input type="datetime-local" value={dep} onChange={(e) => setDep(e.target.value)} className="date-input" /></div>
          <div><label className="text-[11px] font-bold text-slate-500">Arrival</label><input type="datetime-local" value={arr} min={dep} onChange={(e) => setArr(e.target.value)} className="date-input" /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input value={pnr} onChange={(e) => setPnr(e.target.value)} placeholder="PNR / Ref" className="rounded-xl bg-slate-50 border px-3 py-2 text-xs font-mono font-bold" />
          <input value={seat} onChange={(e) => setSeat(e.target.value)} placeholder="Seat / Berth" className="rounded-xl bg-slate-50 border px-3 py-2 text-xs" />
        </div>
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-500 cursor-pointer">Cancel</button><button className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold cursor-pointer">{editing ? 'Save' : 'Add Transit'}</button></div>
      </form>
    </div>
  );
}
