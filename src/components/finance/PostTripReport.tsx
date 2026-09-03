import React from 'react';
import { Trip, Expense } from '../../types';
import { calculateMemberBalances } from '../../utils/debtSimplifier';
import { 
  FileSpreadsheet, 
  Download, 
  Printer, 
  CheckCircle2, 
  TrendingUp, 
  Wallet, 
  DollarSign, 
  Calendar, 
  Award,
  Sparkles,
  PieChart
} from 'lucide-react';
import { Badge } from '../common/Badge';

interface PostTripReportProps {
  trip: Trip;
  expenses: Expense[];
  onOpenAddExpense: () => void;
}

export const PostTripReport: React.FC<PostTripReportProps> = ({
  trip,
  expenses,
  onOpenAddExpense,
}) => {
  const totalSpent = expenses.reduce((acc, e) => acc + e.amount, 0);
  const remaining = trip.totalBudget - totalSpent;
  const balances = calculateMemberBalances(trip.members, expenses);

  // Group by category
  const categoryTotals: { [key: string]: number } = {};
  expenses.forEach(e => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
  });

  const handleExportCSV = () => {
    const headers = ['Date', 'Title', 'Category', 'Amount (INR)', 'Payment Mode', 'Paid By', 'Is Group Expense', 'Notes'];
    const rows = expenses.map(e => [
      e.date,
      `"${e.title.replace(/"/g, '""')}"`,
      e.category,
      e.amount,
      e.paymentMode,
      trip.members.find(m => m.id === e.paidByMemberId)?.name || e.paidByMemberId,
      e.isGroupExpense ? 'Yes' : 'No',
      `"${(e.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${trip.title.replace(/\s+/g, '_')}_Financial_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-white/10 bg-slate-900/90 shadow-2xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-2xl font-black text-white font-display">Post-Trip Financial Report</h3>
            <Badge variant={remaining >= 0 ? 'emerald' : 'rose'} size="md">
              {remaining >= 0 ? 'Under Budget ✓' : 'Over Budget'}
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Complete audited summary of all group expenses, cash payments, and member shares for {trip.title}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-bold border border-emerald-500/30 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl glass-card text-slate-300 hover:text-white text-xs font-semibold border border-white/10 transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Summary Scorecards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card rounded-2xl p-4 bg-slate-950/40 border border-white/5">
          <span className="text-xs font-medium text-slate-400 block">Total Realized Spend</span>
          <span className="text-2xl font-extrabold text-white font-display">
            ₹{totalSpent.toLocaleString('en-IN')}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">Budget: ₹{trip.totalBudget.toLocaleString('en-IN')}</span>
        </div>

        <div className="glass-card rounded-2xl p-4 bg-slate-950/40 border border-white/5">
          <span className="text-xs font-medium text-slate-400 block">Total Group Savings</span>
          <span className={`text-2xl font-extrabold font-display ${remaining >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            ₹{Math.abs(remaining).toLocaleString('en-IN')}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">
            {remaining >= 0 ? 'Saved under target' : 'Over estimated budget'}
          </span>
        </div>

        <div className="glass-card rounded-2xl p-4 bg-slate-950/40 border border-white/5">
          <span className="text-xs font-medium text-slate-400 block">Total Transactions</span>
          <span className="text-2xl font-extrabold text-indigo-400 font-display">
            {expenses.length} Records
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">
            {expenses.filter(e => e.paymentMode === 'cash').length} Cash, {expenses.filter(e => e.paymentMode === 'sms_auto').length} Auto SMS
          </span>
        </div>
      </div>

      {/* Member contribution breakdown */}
      <div>
        <h4 className="text-sm font-bold text-white mb-3">Individual Member Share Breakdown</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950/60 text-slate-400 uppercase font-semibold text-[10px] border-b border-white/10">
              <tr>
                <th className="p-3">Member</th>
                <th className="p-3">Total Paid</th>
                <th className="p-3">Fair Share Owed</th>
                <th className="p-3 text-right">Final Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {balances.map((b) => (
                <tr key={b.memberId} className="hover:bg-white/5">
                  <td className="p-3 font-semibold text-white flex items-center gap-2">
                    <img src={b.member.avatar} alt={b.member.name} className="w-6 h-6 rounded-full object-cover" />
                    <span>{b.member.name}</span>
                  </td>
                  <td className="p-3">₹{b.totalPaid.toLocaleString('en-IN')}</td>
                  <td className="p-3">₹{b.totalOwed.toLocaleString('en-IN')}</td>
                  <td className={`p-3 text-right font-bold ${b.netBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {b.netBalance >= 0 ? `+₹${b.netBalance.toLocaleString('en-IN')} (Credit)` : `-₹${Math.abs(b.netBalance).toLocaleString('en-IN')} (Debit)`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
