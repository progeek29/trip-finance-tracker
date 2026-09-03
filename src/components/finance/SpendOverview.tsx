import React from 'react';
import { Expense, Trip } from '../../types';
import { 
  TrendingUp, 
  Wallet, 
  Coins, 
  CreditCard, 
  PieChart, 
  DollarSign, 
  Flame, 
  AlertCircle 
} from 'lucide-react';

interface SpendOverviewProps {
  trip: Trip;
  expenses: Expense[];
  onOpenAddExpense: () => void;
}

export const SpendOverview: React.FC<SpendOverviewProps> = ({
  trip,
  expenses,
  onOpenAddExpense,
}) => {
  const totalSpent = expenses.reduce((acc, e) => acc + e.amount, 0);
  const remainingBudget = trip.totalBudget - totalSpent;
  const budgetBurnRate = Math.min(Math.round((totalSpent / trip.totalBudget) * 100), 100);

  // Cash vs Digital spend breakdown
  const cashSpent = expenses
    .filter(e => e.paymentMode === 'cash')
    .reduce((acc, e) => acc + e.amount, 0);
  const digitalSpent = totalSpent - cashSpent;

  // Calculate days of trip
  const start = new Date(trip.startDate).getTime();
  const end = new Date(trip.endDate).getTime();
  const totalDays = Math.max(Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1, 1);
  const avgDailySpend = Math.round(totalSpent / totalDays);
  const targetDailyBudget = Math.round(trip.totalBudget / totalDays);

  // Top category
  const catMap: { [key: string]: number } = {};
  expenses.forEach(e => {
    catMap[e.category] = (catMap[e.category] || 0) + e.amount;
  });
  let topCategory = 'None';
  let topCatAmount = 0;
  Object.entries(catMap).forEach(([cat, amt]) => {
    if (amt > topCatAmount) {
      topCategory = cat;
      topCatAmount = amt;
    }
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* 1. Total Spend & Target */}
      <div className="glass-card rounded-2xl p-5 border border-white/10 relative overflow-hidden group">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-slate-400">Total Trip Spend</span>
          <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Wallet className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-extrabold text-white font-display">
          ₹{totalSpent.toLocaleString('en-IN')}
        </div>
        <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
          <span>Budget: ₹{trip.totalBudget.toLocaleString('en-IN')}</span>
          <span className={`font-semibold ${budgetBurnRate > 80 ? 'text-amber-400' : 'text-emerald-400'}`}>
            ({budgetBurnRate}% used)
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800">
          <div 
            className="h-full bg-gradient-to-r from-indigo-500 to-pink-500 transition-all"
            style={{ width: `${budgetBurnRate}%` }}
          />
        </div>
      </div>

      {/* 2. Remaining Balance */}
      <div className="glass-card rounded-2xl p-5 border border-white/10 relative overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-slate-400">Remaining Buffer</span>
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
            remainingBudget >= 0 
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
              : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
          }`}>
            <Coins className="w-4 h-4" />
          </div>
        </div>
        <div className={`text-2xl font-extrabold font-display ${remainingBudget >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          ₹{remainingBudget.toLocaleString('en-IN')}
        </div>
        <div className="text-xs text-slate-400 mt-1">
          {remainingBudget >= 0 ? 'Safe & on track' : 'Over budget threshold'}
        </div>
      </div>

      {/* 3. Daily Average vs Target */}
      <div className="glass-card rounded-2xl p-5 border border-white/10 relative overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-slate-400">Daily Spend Rate</span>
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Flame className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-extrabold text-white font-display">
          ₹{avgDailySpend.toLocaleString('en-IN')}<span className="text-xs font-normal text-slate-400">/day</span>
        </div>
        <div className="text-xs text-slate-400 mt-1">
          Target: ₹{targetDailyBudget.toLocaleString('en-IN')}/day ({totalDays} days)
        </div>
      </div>

      {/* 4. Cash vs Digital Tracker */}
      <div className="glass-card rounded-2xl p-5 border border-white/10 relative overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-slate-400">Cash vs Online/UPI</span>
          <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <CreditCard className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold text-amber-300">₹{cashSpent.toLocaleString('en-IN')}</span>
          <span className="text-xs text-slate-400">cash</span>
          <span className="text-slate-600">•</span>
          <span className="text-lg font-bold text-sky-300">₹{digitalSpent.toLocaleString('en-IN')}</span>
          <span className="text-xs text-slate-400">digital</span>
        </div>
        <div className="text-xs text-slate-400 mt-1">
          Top Category: <span className="font-semibold text-slate-200 capitalize">{topCategory}</span> (₹{topCatAmount.toLocaleString('en-IN')})
        </div>
      </div>
    </div>
  );
};
