import React, { useState } from 'react';
import { Trip, Expense, TripMember } from '../../types';
import { calculateMemberBalances, simplifyDebts } from '../../utils/debtSimplifier';
import { ArrowRight, CheckCircle2, Edit2, Trash2, Receipt, ChevronLeft } from 'lucide-react';
import confetti from 'canvas-confetti';
import { MemberAvatar } from '../common/MemberAvatar';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface CleanSplitViewProps {
  trip: Trip;
  expenses: Expense[];
  onOpenQuickAdd: () => void;
  onEditExpense: (e: Expense) => void;
  onDeleteExpense: (id: string) => void;
  onBackToExpenses: () => void;
}

export const CleanSplitView: React.FC<CleanSplitViewProps> = ({
  trip,
  expenses,
  onOpenQuickAdd,
  onEditExpense,
  onDeleteExpense,
  onBackToExpenses,
}) => {
  const [settledIds, setSettledIds] = useState<string[]>([]);
  const [confirmBill, setConfirmBill] = useState<Expense | null>(null);

  const balances = calculateMemberBalances(trip.members, expenses);
  const settlements = simplifyDebts(balances);
  const groupBills = expenses.filter((e) => e.isGroupExpense);

  const currentMember = trip.members.find((m) => m.isCurrentUser) || trip.members[0];
  const myBalance = balances.find((b) => b.memberId === currentMember?.id)?.netBalance || 0;

  const handleSettle = (key: string) => {
    confetti({ particleCount: 70, spread: 60, origin: { y: 0.7 } });
    setSettledIds((prev) => [...prev, key]);
  };

  const getMember = (id: string): TripMember => {
    return trip.members.find((m) => m.id === id) || { id, name: 'Friend', avatar: '' };
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <button onClick={onBackToExpenses} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-indigo-600 cursor-pointer">
        <ChevronLeft size={14} /> Back to Expenses
      </button>
      <div className="clean-card rounded-3xl p-6 sm:p-7 border border-slate-200 bg-white shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Your Personal Group Balance</span>
          <div className={`text-3xl sm:text-4xl font-extrabold font-display mt-1 tracking-tight ${myBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {myBalance >= 0 ? `+₹${myBalance.toLocaleString('en-IN')}` : `-₹${Math.abs(myBalance).toLocaleString('en-IN')}`}
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            {myBalance >= 0 ? 'You are in positive balance. Friends owe you money.' : 'You owe money to settle up your share of group expenses.'}
          </p>
        </div>
        <button onClick={onOpenQuickAdd} className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm shadow-indigo-200 transition-colors cursor-pointer">
          <span>Add Shared Bill</span>
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-900 font-display">Suggested Transfers to Settle Up</h3>
          <span className="text-xs text-slate-500 font-medium">Simplified 1-on-1 Payments</span>
        </div>
        {settlements.length === 0 ? (
          <div className="clean-card rounded-2xl p-6 text-center border border-slate-200 bg-white">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-xs text-slate-700 font-bold">All group expenses are completely settled!</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {settlements.map((debt, idx) => {
              const from = getMember(debt.fromMemberId);
              const to = getMember(debt.toMemberId);
              const key = `${debt.fromMemberId}_${debt.toMemberId}_${debt.amount}`;
              const isSettled = settledIds.includes(key);
              return (
                <div key={idx} className={`clean-card rounded-2xl p-4 border flex items-center justify-between gap-4 transition-all ${isSettled ? 'opacity-60 bg-emerald-50/60 border-emerald-200' : 'border-slate-200 bg-white hover:border-indigo-300 shadow-2xs'}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                      <MemberAvatar name={from.name} avatar={from.avatar} memberId={from.id} size="sm" />
                      <MemberAvatar name={to.name} avatar={to.avatar} memberId={to.id} size="sm" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900">
                        <span>{from.name.split(' ')[0]}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        <span>{to.name.split(' ')[0]}</span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium">{from.name} pays {to.name}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-extrabold text-slate-900 font-display">₹{debt.amount.toLocaleString('en-IN')}</span>
                    <button disabled={isSettled} onClick={() => handleSettle(key)} className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${isSettled ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs shadow-emerald-200'}`}>
                      {isSettled ? 'Settled' : 'Settle'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Group bills with add/edit/delete */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-900 font-display">Shared Bills ({groupBills.length})</h3>
          <button onClick={onOpenQuickAdd} className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-bold cursor-pointer">
            Add Bill
          </button>
        </div>
        {groupBills.length === 0 && (
          <div className="clean-card rounded-2xl p-5 text-center border border-dashed border-slate-300 bg-white">
            <Receipt className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
            <p className="text-xs text-slate-500 font-medium">No shared bills yet — the trip creator or anyone can add one.</p>
          </div>
        )}
        <div className="space-y-2">
          {groupBills.map((e) => {
            const payer = getMember(e.paidByMemberId);
            return (
              <div key={e.id} className="clean-card rounded-2xl p-3.5 border border-slate-200 bg-white flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <MemberAvatar name={payer.name} avatar={payer.avatar} memberId={payer.id} size="sm" />
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-slate-900 truncate">{e.title}</p>
                    <p className="text-[11px] text-slate-500">Paid by {payer.name} • ₹{e.amount.toLocaleString('en-IN')} • split {e.splits.length} ways</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => onEditExpense(e)} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer" title="Edit bill"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setConfirmBill(e)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer" title="Delete bill"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 pt-1">
        <h3 className="text-sm font-extrabold text-slate-900 font-display">Group Member Net Balances</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {balances.map((b, i) => (
            <div key={b.memberId} className="clean-card rounded-2xl p-4 border border-slate-200 bg-white space-y-2 text-center shadow-2xs">
              <div className="flex justify-center"><MemberAvatar name={b.member.name} avatar={b.member.avatar} memberId={b.memberId} index={i} size="lg" /></div>
              <span className="text-xs font-extrabold text-slate-900 block truncate">{b.member.name}</span>
              <span className={`text-xs font-extrabold block px-2 py-0.5 rounded-full ${b.netBalance >= 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                {b.netBalance >= 0 ? `+₹${b.netBalance.toLocaleString('en-IN')}` : `-₹${Math.abs(b.netBalance).toLocaleString('en-IN')}`}
              </span>
            </div>
          ))}
        </div>
      </div>
      {confirmBill && (
        <ConfirmDialog
          message={`"${confirmBill.title}" will be deleted.`}
          onConfirm={() => onDeleteExpense(confirmBill.id)}
          onClose={() => setConfirmBill(null)}
        />
      )}
    </div>
  );
};
