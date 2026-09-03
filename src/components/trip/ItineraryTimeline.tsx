import React from 'react';
import { Trip, CityStop, Expense } from '../../types';
import { MapPin, Calendar, Clock, DollarSign, Plus, ChevronRight, FileText } from 'lucide-react';
import { Badge } from '../common/Badge';

interface ItineraryTimelineProps {
  trip: Trip;
  expenses: Expense[];
  onSelectCity: (cityId: string) => void;
}

export const ItineraryTimeline: React.FC<ItineraryTimelineProps> = ({
  trip,
  expenses,
  onSelectCity,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white font-display">City Itinerary & Stops</h3>
          <p className="text-xs text-slate-400">Chronological travel trail with city budgets and notes</p>
        </div>
      </div>

      <div className="relative border-l-2 border-indigo-500/30 ml-4 pl-6 space-y-6 my-4">
        {trip.cities.map((city, idx) => {
          const cityExpenses = expenses.filter(e => e.cityId === city.id);
          const citySpent = cityExpenses.reduce((sum, e) => sum + e.amount, 0);
          const percent = city.budget > 0 ? Math.min(Math.round((citySpent / city.budget) * 100), 100) : 0;

          return (
            <div key={city.id} className="relative group">
              {/* Timeline marker */}
              <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-slate-950 border-2 border-indigo-500 group-hover:scale-125 group-hover:bg-indigo-500 transition-all shadow-md shadow-indigo-500/50" />

              <div className="glass-card rounded-2xl p-5 border border-white/10 hover:border-indigo-500/30 transition-all">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">Stop #{idx + 1}</span>
                      <Badge variant="purple" size="sm">
                        {city.stateOrCountry}
                      </Badge>
                    </div>

                    <h4 className="text-lg font-bold text-white">{city.name}</h4>

                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                        <span>{new Date(city.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(city.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Spent: ₹{citySpent.toLocaleString('en-IN')} / ₹{city.budget.toLocaleString('en-IN')}</span>
                      </div>
                    </div>

                    {city.notes && (
                      <p className="text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-xl border border-white/5 flex items-start gap-2">
                        <FileText className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                        <span>{city.notes}</span>
                      </p>
                    )}
                  </div>

                  {/* Budget Mini Meter */}
                  <div className="sm:w-44 flex flex-col justify-between">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>City Budget</span>
                        <span className="font-semibold text-slate-200">{percent}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-indigo-500 to-pink-500 rounded-full transition-all"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>

                    <button
                      onClick={() => onSelectCity(city.id)}
                      className="mt-3 flex items-center justify-center gap-1 w-full py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-xs font-semibold border border-indigo-500/30 transition-colors"
                    >
                      <span>Filter Expenses</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
