import React, { useState, useEffect } from 'react';
import { Trip, CityStop, Expense } from '../../types';
import { 
  Calendar, 
  MapPin, 
  Users, 
  Wallet, 
  Sparkles, 
  PlusCircle, 
  Clock, 
  Edit3, 
  TrendingUp,
  Share2,
  CheckCircle2
} from 'lucide-react';
import { Badge } from '../common/Badge';

interface TripHeaderProps {
  trip: Trip;
  expenses: Expense[];
  selectedCityId: string | 'all';
  onSelectCity: (cityId: string | 'all') => void;
  onOpenAddExpense: () => void;
  onOpenTripEditor: () => void;
}

export const TripHeader: React.FC<TripHeaderProps> = ({
  trip,
  expenses,
  selectedCityId,
  onSelectCity,
  onOpenAddExpense,
  onOpenTripEditor,
}) => {
  const [copied, setCopied] = useState(false);

  // Total spent calculation
  const totalSpent = expenses.reduce((acc, exp) => acc + exp.amount, 0);
  const remainingBudget = trip.totalBudget - totalSpent;
  const budgetPercent = Math.min(Math.round((totalSpent / trip.totalBudget) * 100), 100);

  // Countdown to trip start (20 Sep 2026)
  const calculateCountdown = () => {
    const start = new Date(trip.startDate + 'T00:00:00').getTime();
    const now = new Date().getTime();
    const diff = start - now;

    if (diff <= 0) {
      // Trip is active or completed
      const end = new Date(trip.endDate + 'T23:59:59').getTime();
      if (now <= end) {
        const daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
        return { status: 'LIVE ONGOING', text: `Day of Trip • ${daysLeft} days remaining`, color: 'emerald' as const };
      }
      return { status: 'COMPLETED', text: 'Memories Saved', color: 'slate' as const };
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    return { status: 'UPCOMING', text: `${days} Days to Takeoff`, color: 'indigo' as const };
  };

  const countdown = calculateCountdown();

  const handleShareTrip = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="relative rounded-3xl overflow-hidden glass-panel border border-white/10 p-6 md:p-8 mb-8 shadow-2xl">
      {/* Background Cover Overlay with Ambient Glow */}
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-25 scale-105 filter blur-sm transition-transform duration-1000"
        style={{ backgroundImage: `url(${trip.coverImage})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent" />
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-pink-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main Content */}
      <div className="relative z-10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Title & Dates */}
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge variant={countdown.color} size="md">
                <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                {countdown.status}: {countdown.text}
              </Badge>

              <button 
                onClick={handleShareTrip}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium border border-white/10 transition-colors"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                <span>{copied ? 'Link Copied!' : 'Invite Friends'}</span>
              </button>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight font-display">
              {trip.title}
            </h1>

            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              {trip.description}
            </p>

            {/* Trip Info Badges */}
            <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-slate-300 pt-1">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-indigo-400" />
                <span>{new Date(trip.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(trip.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-pink-400" />
                <span>{trip.cities.map(c => c.name.split('(')[0]).join(' & ')}</span>
              </div>

              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-400" />
                <div className="flex -space-x-2">
                  {trip.members.map((m) => (
                    <img
                      key={m.id}
                      src={m.avatar}
                      alt={m.name}
                      title={m.name}
                      className="w-6 h-6 rounded-full border-2 border-slate-900 object-cover"
                    />
                  ))}
                </div>
                <span className="text-xs text-slate-400">({trip.members.length} Squad)</span>
              </div>
            </div>
          </div>

          {/* Budget Widget & Fast Action */}
          <div className="lg:w-80 flex flex-col gap-4">
            <div className="glass-card rounded-2xl p-4.5 border border-white/10 bg-slate-900/70">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span>Trip Spend Target</span>
                <span className="font-semibold text-slate-200">
                  ₹{totalSpent.toLocaleString('en-IN')} / ₹{trip.totalBudget.toLocaleString('en-IN')}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden mb-2.5">
                <div 
                  className={`h-full transition-all duration-500 rounded-full ${
                    budgetPercent > 90 
                      ? 'bg-rose-500' 
                      : budgetPercent > 70 
                      ? 'bg-amber-500' 
                      : 'bg-gradient-to-r from-indigo-500 to-emerald-400'
                  }`}
                  style={{ width: `${budgetPercent}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Remaining</span>
                <span className={`font-bold ${remainingBudget >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ₹{remainingBudget.toLocaleString('en-IN')} ({100 - budgetPercent}% left)
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5">
              <button
                onClick={onOpenAddExpense}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-pink-500 hover:from-indigo-500 hover:to-pink-400 text-white font-semibold text-sm shadow-lg shadow-indigo-500/25 transition-all transform active:scale-95"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ Add Expense</span>
              </button>

              <button
                onClick={onOpenTripEditor}
                className="p-3 rounded-xl glass-card text-slate-300 hover:text-white border border-white/10 transition-colors"
                title="Edit Trip Details & Budget"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* City Filter Pills */}
        <div className="mt-8 pt-6 border-t border-white/10 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">City Filter:</span>
          <button
            onClick={() => onSelectCity('all')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
              selectedCityId === 'all'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
            }`}
          >
            All Destinations ({trip.cities.length})
          </button>

          {trip.cities.map((city) => (
            <button
              key={city.id}
              onClick={() => onSelectCity(city.id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                selectedCityId === city.id
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <MapPin className="w-3 h-3 text-pink-400" />
              <span>{city.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
