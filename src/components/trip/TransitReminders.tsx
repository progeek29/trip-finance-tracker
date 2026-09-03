import React, { useState } from 'react';
import { TransitReminder } from '../../types';
import { 
  Plane, 
  Train, 
  Bus, 
  Car, 
  Hotel, 
  Clock, 
  Bell, 
  BellRing, 
  Copy, 
  Check, 
  ExternalLink, 
  CalendarPlus,
  ArrowRight,
  Plus,
  Trash2
} from 'lucide-react';
import { Badge } from '../common/Badge';

interface TransitRemindersProps {
  reminders: TransitReminder[];
  onAddReminder: (reminder: TransitReminder) => void;
  onDeleteReminder: (id: string) => void;
  onOpenDocVault?: (docId?: string) => void;
}

export const TransitReminders: React.FC<TransitRemindersProps> = ({
  reminders,
  onAddReminder,
  onDeleteReminder,
  onOpenDocVault,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [notificationStatus, setNotificationStatus] = useState<'default' | 'granted' | 'denied'>('default');
  const [showAddModal, setShowAddModal] = useState(false);

  // New reminder form state
  const [newReminder, setNewReminder] = useState<Partial<TransitReminder>>({
    title: '',
    type: 'flight',
    departureLocation: '',
    arrivalLocation: '',
    departureTime: '',
    arrivalTime: '',
    pnrOrBookingRef: '',
    seatOrBerth: '',
    terminalGate: '',
    reminderHoursBefore: 3,
  });

  const handleCopyPNR = (id: string, text?: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRequestNotification = async () => {
    if (!('Notification' in window)) {
      alert('Browser does not support desktop notifications.');
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationStatus(permission);
    if (permission === 'granted') {
      new Notification('✈ WanderSync Transit Alert Activated!', {
        body: 'You will receive boarding & departure reminders for your Goa trip tickets.',
        icon: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=128&q=80',
      });
    }
  };

  // Generate .ics calendar download
  const handleExportToCalendar = (rem: TransitReminder) => {
    const startDate = new Date(rem.departureTime).toISOString().replace(/-|:|\.\d\d\d/g, '');
    const endDate = new Date(rem.arrivalTime || rem.departureTime).toISOString().replace(/-|:|\.\d\d\d/g, '');
    
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//WanderSync//Trip Reminder//EN',
      'BEGIN:VEVENT',
      `SUMMARY:${rem.title} (${rem.operator || rem.type.toUpperCase()})`,
      `DESCRIPTION:PNR: ${rem.pnrOrBookingRef || 'N/A'}\\nSeats: ${rem.seatOrBerth || 'N/A'}\\nGate: ${rem.terminalGate || 'N/A'}`,
      `LOCATION:${rem.departureLocation}`,
      `DTSTART:${startDate}`,
      `DTEND:${endDate}`,
      'BEGIN:VALARM',
      `TRIGGER:-PT${rem.reminderHoursBefore || 2}H`,
      'ACTION:DISPLAY',
      `DESCRIPTION:Transit Reminder: ${rem.title}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${rem.title.replace(/\s+/g, '_')}_reminder.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getTypeIcon = (type: TransitReminder['type']) => {
    switch (type) {
      case 'flight': return Plane;
      case 'train': return Train;
      case 'bus': return Bus;
      case 'cab': return Car;
      default: return Hotel;
    }
  };

  const getTypeColor = (type: TransitReminder['type']) => {
    switch (type) {
      case 'flight': return 'indigo';
      case 'train': return 'emerald';
      case 'bus': return 'amber';
      case 'cab': return 'sky';
      default: return 'purple';
    }
  };

  const handleCreateReminder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReminder.title || !newReminder.departureLocation || !newReminder.departureTime) {
      alert('Please fill in required fields');
      return;
    }

    const created: TransitReminder = {
      id: 'rem_' + Date.now(),
      tripId: 'trip_goa_2026',
      title: newReminder.title,
      type: newReminder.type || 'flight',
      operator: newReminder.operator || '',
      transitNumber: newReminder.transitNumber || '',
      departureLocation: newReminder.departureLocation,
      arrivalLocation: newReminder.arrivalLocation || '',
      departureTime: newReminder.departureTime,
      arrivalTime: newReminder.arrivalTime || newReminder.departureTime,
      pnrOrBookingRef: newReminder.pnrOrBookingRef || '',
      seatOrBerth: newReminder.seatOrBerth || '',
      terminalGate: newReminder.terminalGate || '',
      reminderHoursBefore: Number(newReminder.reminderHoursBefore) || 3,
      isCompleted: false,
    };

    onAddReminder(created);
    setShowAddModal(false);
    setNewReminder({
      title: '',
      type: 'flight',
      departureLocation: '',
      arrivalLocation: '',
      departureTime: '',
      arrivalTime: '',
      pnrOrBookingRef: '',
      seatOrBerth: '',
      terminalGate: '',
      reminderHoursBefore: 3,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white font-display">Transit & Ticket Reminders</h2>
            <Badge variant="indigo" size="sm">
              {reminders.length} Scheduled
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Automatic departure countdowns, PNR copies, and 1-click sync to your phone calendar.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRequestNotification}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              notificationStatus === 'granted'
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                : 'glass-card text-slate-300 hover:text-white border-white/10'
            }`}
          >
            {notificationStatus === 'granted' ? (
              <>
                <BellRing className="w-3.5 h-3.5 text-emerald-400" />
                <span>Alerts Active</span>
              </>
            ) : (
              <>
                <Bell className="w-3.5 h-3.5 text-indigo-400" />
                <span>Enable Push Alerts</span>
              </>
            )}
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors shadow-md shadow-indigo-600/20"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Ticket Reminder</span>
          </button>
        </div>
      </div>

      {/* Reminder Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reminders.map((rem) => {
          const Icon = getTypeIcon(rem.type);
          const colorVariant = getTypeColor(rem.type);
          const depDate = new Date(rem.departureTime);
          const arrDate = rem.arrivalTime ? new Date(rem.arrivalTime) : null;

          return (
            <div 
              key={rem.id}
              className="glass-card rounded-2xl p-5 border border-white/10 flex flex-col justify-between hover:border-indigo-500/40 relative group"
            >
              <div>
                {/* Type & Operator Bar */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-200 block">{rem.operator || rem.type.toUpperCase()}</span>
                      {rem.transitNumber && (
                        <span className="text-[11px] font-mono text-indigo-400">{rem.transitNumber}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Badge variant={colorVariant} size="sm">
                      {rem.type.toUpperCase()}
                    </Badge>
                    <button
                      onClick={() => onDeleteReminder(rem.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                      title="Delete Reminder"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <h3 className="font-bold text-slate-100 text-sm mb-2">{rem.title}</h3>

                {/* Route & Times */}
                <div className="bg-slate-900/60 rounded-xl p-3 border border-white/5 space-y-2 mb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] uppercase text-slate-400 font-semibold block">Departing</span>
                      <span className="text-xs font-medium text-slate-200">{rem.departureLocation}</span>
                      <span className="text-xs text-indigo-300 font-semibold block mt-0.5">
                        {depDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {depDate.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                    </div>

                    <ArrowRight className="w-4 h-4 text-slate-500 mt-2 flex-shrink-0" />

                    <div className="text-right">
                      <span className="text-[10px] uppercase text-slate-400 font-semibold block">Arrival</span>
                      <span className="text-xs font-medium text-slate-200">{rem.arrivalLocation}</span>
                      {arrDate && (
                        <span className="text-xs text-slate-300 block mt-0.5">
                          {arrDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Meta details (PNR, Gate, Seat) */}
                <div className="space-y-1.5 text-xs text-slate-300 mb-4">
                  {rem.pnrOrBookingRef && (
                    <div className="flex items-center justify-between bg-slate-900/40 px-2.5 py-1.5 rounded-lg border border-white/5">
                      <span className="text-slate-400">PNR / Ref:</span>
                      <button
                        onClick={() => handleCopyPNR(rem.id, rem.pnrOrBookingRef)}
                        className="flex items-center gap-1 font-mono font-bold text-indigo-300 hover:text-indigo-200"
                      >
                        <span>{rem.pnrOrBookingRef}</span>
                        {copiedId === rem.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                      </button>
                    </div>
                  )}

                  {rem.seatOrBerth && (
                    <div className="flex items-center justify-between px-1">
                      <span className="text-slate-400">Seats:</span>
                      <span className="font-medium text-slate-200">{rem.seatOrBerth}</span>
                    </div>
                  )}

                  {rem.terminalGate && (
                    <div className="flex items-center justify-between px-1">
                      <span className="text-slate-400">Gate / Terminal:</span>
                      <span className="font-medium text-slate-200">{rem.terminalGate}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleExportToCalendar(rem)}
                  className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                  title="Add to Google/Apple Calendar (.ics)"
                >
                  <CalendarPlus className="w-3.5 h-3.5" />
                  <span>Sync Calendar</span>
                </button>

                {onOpenDocVault && (
                  <button
                    onClick={() => onOpenDocVault(rem.ticketDocumentId)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    <span>View Ticket</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Reminder Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="glass-panel max-w-lg w-full rounded-2xl p-6 border border-white/10 bg-slate-900 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4 font-display">Add Transit / Ticket Reminder</h3>
            
            <form onSubmit={handleCreateReminder} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Reminder Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Indigo Flight 6E-204 (DEL -> GOI)"
                  value={newReminder.title}
                  onChange={(e) => setNewReminder({ ...newReminder, title: e.target.value })}
                  className="w-full rounded-xl glass-input px-3.5 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Transit Type</label>
                  <select
                    value={newReminder.type}
                    onChange={(e) => setNewReminder({ ...newReminder, type: e.target.value as any })}
                    className="w-full rounded-xl glass-input px-3 py-2 text-sm bg-slate-900"
                  >
                    <option value="flight">Flight ✈</option>
                    <option value="train">Train 🚆</option>
                    <option value="bus">Bus 🚌</option>
                    <option value="cab">Cab / Taxi 🚖</option>
                    <option value="hotel_checkin">Hotel Check-in 🏨</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Operator / Airline</label>
                  <input
                    type="text"
                    placeholder="e.g. IndiGo, IRCTC"
                    value={newReminder.operator}
                    onChange={(e) => setNewReminder({ ...newReminder, operator: e.target.value })}
                    className="w-full rounded-xl glass-input px-3.5 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Departure Location *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. DEL Airport T3"
                    value={newReminder.departureLocation}
                    onChange={(e) => setNewReminder({ ...newReminder, departureLocation: e.target.value })}
                    className="w-full rounded-xl glass-input px-3.5 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Arrival Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Goa Dabolim (GOI)"
                    value={newReminder.arrivalLocation}
                    onChange={(e) => setNewReminder({ ...newReminder, arrivalLocation: e.target.value })}
                    className="w-full rounded-xl glass-input px-3.5 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Departure Date & Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={newReminder.departureTime}
                    onChange={(e) => setNewReminder({ ...newReminder, departureTime: e.target.value })}
                    className="w-full rounded-xl glass-input px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Arrival Time</label>
                  <input
                    type="datetime-local"
                    value={newReminder.arrivalTime}
                    onChange={(e) => setNewReminder({ ...newReminder, arrivalTime: e.target.value })}
                    className="w-full rounded-xl glass-input px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">PNR / Booking Ref</label>
                  <input
                    type="text"
                    placeholder="e.g. R7KP9Q"
                    value={newReminder.pnrOrBookingRef}
                    onChange={(e) => setNewReminder({ ...newReminder, pnrOrBookingRef: e.target.value })}
                    className="w-full rounded-xl glass-input px-3 py-2 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Seats / Berth</label>
                  <input
                    type="text"
                    placeholder="e.g. 14B, 14C"
                    value={newReminder.seatOrBerth}
                    onChange={(e) => setNewReminder({ ...newReminder, seatOrBerth: e.target.value })}
                    className="w-full rounded-xl glass-input px-3 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Alert Hours Before</label>
                  <select
                    value={newReminder.reminderHoursBefore}
                    onChange={(e) => setNewReminder({ ...newReminder, reminderHoursBefore: Number(e.target.value) })}
                    className="w-full rounded-xl glass-input px-3 py-2 text-xs bg-slate-900"
                  >
                    <option value={1}>1 Hour</option>
                    <option value={2}>2 Hours</option>
                    <option value={3}>3 Hours (Flight)</option>
                    <option value={6}>6 Hours</option>
                    <option value={24}>24 Hours</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-md shadow-indigo-600/20"
                >
                  Save Reminder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
