import React, { useState } from 'react';
import { Expense, Trip, ExpenseCategory, PaymentMode } from '../../types';
import { 
  Utensils, 
  Car, 
  Hotel, 
  Ticket, 
  ShoppingBag, 
  Fuel, 
  HeartPulse, 
  Wine, 
  MoreHorizontal,
  Search,
  Filter,
  Edit2,
  Trash2,
  CreditCard,
  Banknote,
  Smartphone,
  Sparkles,
  User,
  Plus
} from 'lucide-react';
import { Badge } from '../common/Badge';

interface ExpenseListProps {
  trip: Trip;
  expenses: Expense[];
  selectedCityId: string | 'all';
  onEditExpense: (expense: Expense) => void;
  onDeleteExpense: (expenseId: string) => void;
  onOpenAddExpense: () => void;
}

const CATEGORY_ICONS: { [key in ExpenseCategory]: React.ElementType } = {
  food: Utensils,
  transit: Car,
  stay: Hotel,
  activities: Ticket,
  shopping: ShoppingBag,
  fuel: Fuel,
  emergency: HeartPulse,
  drinks: Wine,
  other: MoreHorizontal,
};

export const ExpenseList: React.FC<ExpenseListProps> = ({
  trip,
  expenses,
  selectedCityId,
  onEditExpense,
  onDeleteExpense,
  onOpenAddExpense,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedMode, setSelectedMode] = useState<string>('all');

  // Filter expenses
  const filtered = expenses.filter((e) => {
    // City filter
    if (selectedCityId !== 'all' && e.cityId && e.cityId !== selectedCityId) {
      return false;
    }
    // Category filter
    if (selectedCategory !== 'all' && e.category !== selectedCategory) {
      return false;
    }
    // Payment mode filter
    if (selectedMode !== 'all' && e.paymentMode !== selectedMode) {
      return false;
    }
    // Search query
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchTitle = e.title.toLowerCase().includes(q);
      const matchNotes = e.notes?.toLowerCase().includes(q);
      const matchSMS = e.originalSMS?.toLowerCase().includes(q);
      if (!matchTitle && !matchNotes && !matchSMS) return false;
    }
    return true;
  });

  const getPayerName = (memberId: string) => {
    const m = trip.members.find((mem) => mem.id === memberId);
    return m ? m.name : 'Unknown';
  };

  const getPaymentModeBadge = (mode: PaymentMode, isAutoSMS?: boolean) => {
    if (isAutoSMS || mode === 'sms_auto') {
      return (
        <Badge variant="emerald" size="sm">
          <Sparkles className="w-3 h-3 text-emerald-400" />
          <span>SMS Auto-Debit</span>
        </Badge>
      );
    }
    switch (mode) {
      case 'cash':
        return (
          <Badge variant="amber" size="sm">
            <Banknote className="w-3 h-3 text-amber-400" />
            <span>Cash</span>
          </Badge>
        );
      case 'card':
        return (
          <Badge variant="purple" size="sm">
            <CreditCard className="w-3 h-3 text-purple-400" />
            <span>Card</span>
          </Badge>
        );
      default:
        return (
          <Badge variant="sky" size="sm">
            <Smartphone className="w-3 h-3 text-sky-400" />
            <span>UPI</span>
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-white font-display">Itemized Expenses</h3>
            <Badge variant="indigo" size="sm">
              {filtered.length} of {expenses.length} Records
            </Badge>
          </div>
          <p className="text-xs text-slate-400">All cash, card, UPI, and bank SMS auto-logged transactions</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search expenses, shacks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-xl glass-input text-xs w-48 sm:w-60"
            />
          </div>

          {/* Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded-xl glass-input px-2.5 py-1.5 text-xs bg-slate-900"
          >
            <option value="all">All Categories</option>
            <option value="food">Food & Cafe</option>
            <option value="drinks">Drinks & Nightlife</option>
            <option value="stay">Stay / Hotels</option>
            <option value="transit">Transit & Cabs</option>
            <option value="activities">Activities & Sports</option>
            <option value="fuel">Fuel / Petrol</option>
            <option value="shopping">Shopping</option>
            <option value="emergency">Emergency</option>
          </select>

          {/* Payment Mode Dropdown */}
          <select
            value={selectedMode}
            onChange={(e) => setSelectedMode(e.target.value)}
            className="rounded-xl glass-input px-2.5 py-1.5 text-xs bg-slate-900"
          >
            <option value="all">All Modes</option>
            <option value="cash">Cash Only</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="sms_auto">SMS Auto-Debit</option>
          </select>

          <button
            onClick={onOpenAddExpense}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Add</span>
          </button>
        </div>
      </div>

      {/* Expense Cards List */}
      {filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center border border-white/10">
          <p className="text-slate-400 text-sm">No expenses matched your search or filters.</p>
          <button
            onClick={onOpenAddExpense}
            className="mt-3 px-4 py-2 rounded-xl bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 text-xs font-semibold border border-indigo-500/30 transition-colors"
          >
            Log a new expense or cash payment
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((exp) => {
            const Icon = CATEGORY_ICONS[exp.category] || MoreHorizontal;
            const payerName = getPayerName(exp.paidByMemberId);
            const city = trip.cities.find((c) => c.id === exp.cityId);

            return (
              <div
                key={exp.id}
                className="glass-card rounded-2xl p-4 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-indigo-500/30 transition-all group"
              >
                {/* Left: Icon & Details */}
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center text-indigo-400 flex-shrink-0 mt-0.5">
                    <Icon className="w-5 h-5" />
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-bold text-white text-sm sm:text-base">{exp.title}</h4>
                      {getPaymentModeBadge(exp.paymentMode, exp.isAutoParsedSMS)}
                      {city && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-white/5">
                          {city.name.split('(')[0].trim()}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1 text-slate-300">
                        <User className="w-3 h-3 text-indigo-400" />
                        Paid by <strong>{payerName}</strong>
                      </span>
                      <span>•</span>
                      <span>{new Date(exp.date).toLocaleDateString([], { month: 'short', day: 'numeric' })} {exp.time && `at ${exp.time}`}</span>
                      <span>•</span>
                      <span>
                        {exp.splits.length > 1 
                          ? `Split ${exp.splits.length} ways (₹${exp.splits[0]?.amount}/person)` 
                          : 'Personal Expense'}
                      </span>
                    </div>

                    {exp.notes && (
                      <p className="text-xs text-slate-300 italic pt-0.5">
                        "{exp.notes}"
                      </p>
                    )}

                    {exp.isAutoParsedSMS && exp.originalSMS && (
                      <div className="mt-1 text-[11px] font-mono text-emerald-300/80 bg-emerald-950/40 p-1.5 rounded-lg border border-emerald-500/20">
                        SMS: {exp.originalSMS}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Amount & Actions */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 border-t sm:border-t-0 pt-2 sm:pt-0 border-white/5">
                  <div className="text-right">
                    <span className="text-lg font-extrabold text-white font-display">
                      ₹{exp.amount.toLocaleString('en-IN')}
                    </span>
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">
                      {exp.category}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onEditExpense(exp)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
                      title="Edit Expense or Cash Amount"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDeleteExpense(exp.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Delete Record"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
