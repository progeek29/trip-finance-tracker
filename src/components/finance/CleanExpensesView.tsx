import React, { useState } from 'react';
import { Trip, Expense } from '../../types';
import { Plus, Search, Edit2, Trash2, Download } from 'lucide-react';

interface CleanExpensesViewProps {
  trip: Trip;
  expenses: Expense[];
  onOpenQuickAdd: () => void;
  onEditExpense: (exp: Expense) => void;
  onDeleteExpense: (id: string) => void;
}

export const CleanExpensesView: React.FC<CleanExpensesViewProps> = ({
  trip,
  expenses,
  onOpenQuickAdd,
  onEditExpense,
  onDeleteExpense,
}) => {
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  const totalSpent = expenses.reduce((a, b) => a + b.amount, 0);
  const cashSpent = expenses.filter(e => e.paymentMode === 'cash').reduce((a, b) => a + b.amount, 0);
  const digitalSpent = totalSpent - cashSpent;

  const filtered = expenses.filter(e => {
    if (filter === 'cash' && e.paymentMode !== 'cash') return false;
    if (filter !== 'all' && filter !== 'cash' && e.category !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return e.title.toLowerCase().includes(q) || e.notes?.toLowerCase().includes(q);
    }
    return true;
  });

  const handleExportCSV = () => {
    const headers = ['Date', 'Title', 'Category', 'Amount (INR)', 'Payment Mode', 'Paid By', 'Notes'];
    const rows = expenses.map(e => [
      e.date,
      `"${e.title.replace(/"/g, '""')}"`,
      e.category,
      e.amount,
      e.paymentMode,
      trip.members.find(m => m.id === e.paidByMemberId)?.name || e.paidByMemberId,
      `"${(e.notes || '').replace(/"/g, '""')}"`
    ]);
    const blob = new Blob([[headers.join(','), ...rows.map(r => r.join(','))].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Goa_Trip_Expenses.csv`;
    link.click();
  };

  const getCategoryBg = (cat: string) => {
    switch (cat) {
      case 'food': return 'bg-amber-100 text-amber-800';
      case 'drinks': return 'bg-pink-100 text-pink-800';
      case 'stay': return 'bg-indigo-100 text-indigo-800';
      case 'transit': return 'bg-sky-100 text-sky-800';
      case 'activities': return 'bg-emerald-100 text-emerald-800';
      case 'shopping': return 'bg-purple-100 text-purple-800';
      case 'fuel': return 'bg-orange-100 text-orange-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* 1. Large Spend Header */}
      <div className="clean-card rounded-3xl p-6 sm:p-7 border border-slate-200 bg-white shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-extrabold text-slate-400 block uppercase tracking-wider">
            Total Trip Spend
          </span>
          <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 font-display mt-1 tracking-tight">
            ₹{totalSpent.toLocaleString('en-IN')}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs mt-2.5">
            <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 font-bold border border-amber-200">
              ₹{cashSpent.toLocaleString('en-IN')} cash
            </span>
            <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-800 font-bold border border-indigo-200">
              ₹{digitalSpent.toLocaleString('en-IN')} online / UPI
            </span>
            <span className="text-slate-500 font-medium">
              of ₹{trip.totalBudget.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-bold text-slate-700 transition-colors cursor-pointer"
            title="Download CSV report"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
          <button
            onClick={onOpenQuickAdd}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm shadow-indigo-200 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>+ Add Spend</span>
          </button>
        </div>
      </div>

      {/* 2. Filter Pills & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'all', label: 'All' },
            { id: 'cash', label: '💵 Cash' },
            { id: 'food', label: '🍔 Food' },
            { id: 'drinks', label: '🍹 Drinks' },
            { id: 'stay', label: '🏨 Stay' },
            { id: 'transit', label: '🚕 Transit' },
            { id: 'activities', label: '🤿 Activities' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filter === item.id
                  ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-200'
                  : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="relative flex-shrink-0 sm:w-48">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search spends..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      </div>

      {/* 3. Expenses List */}
      <div className="space-y-2.5">
        {filtered.map((exp) => {
          const payer = trip.members.find(m => m.id === exp.paidByMemberId)?.name || 'Friend';
          return (
            <div
              key={exp.id}
              className="clean-card rounded-2xl p-4 border border-slate-200 bg-white hover:border-indigo-300 flex items-center justify-between gap-4 transition-all shadow-2xs"
            >
              <div className="flex items-center gap-3.5">
                <div className={`w-10 h-10 rounded-xl ${getCategoryBg(exp.category)} flex items-center justify-center text-lg flex-shrink-0 font-medium`}>
                  {exp.category === 'food' && '🍔'}
                  {exp.category === 'drinks' && '🍹'}
                  {exp.category === 'stay' && '🏨'}
                  {exp.category === 'transit' && '🚕'}
                  {exp.category === 'activities' && '🤿'}
                  {exp.category === 'fuel' && '⛽'}
                  {exp.category === 'shopping' && '🛍'}
                  {exp.category === 'emergency' && '🩺'}
                  {exp.category === 'other' && '📦'}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-extrabold text-slate-900 text-sm">{exp.title}</h4>
                    {exp.paymentMode === 'cash' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 font-bold border border-amber-200">
                        Cash
                      </span>
                    )}
                    {exp.isAutoParsedSMS && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                        SMS Auto
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-500 mt-0.5 font-medium">
                    Paid by <strong className="text-slate-700">{payer}</strong> • {new Date(exp.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    {exp.splits.length > 1 && ` • Split 4 ways`}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="font-extrabold text-slate-900 text-base font-display">
                    ₹{exp.amount.toLocaleString('en-IN')}
                  </span>
                  {exp.splits.length > 1 && (
                    <span className="text-[10px] text-slate-400 font-semibold block">₹{exp.splits[0].amount}/each</span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onEditExpense(exp)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                    title="Edit Expense"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteExpense(exp.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Delete Expense"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
