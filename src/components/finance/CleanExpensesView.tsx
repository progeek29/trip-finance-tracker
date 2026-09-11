import React, { useState } from 'react';
import { Trip, Expense, Settlement, ExpenseEvent } from '../../types';
import { calculateMemberBalances, simplifyDebts } from '../../utils/debtSimplifier';
import { Search, Edit2, Trash2, Download, Users, ArrowRight, CheckCircle2, History, Receipt } from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { MemberAvatar } from '../common/MemberAvatar';

interface CleanExpensesViewProps {
  trip: Trip;
  expenses: Expense[];
  settlements: Settlement[];
  expenseEvents: ExpenseEvent[];
  onEditExpense: (exp: Expense) => void;
  onDeleteExpense: (id: string) => void;
  onGoSplit: () => void;
  onSettle: (fromMemberId: string, toMemberId: string, amount: number) => void;
  myUid?: string | null;
}

export const CleanExpensesView: React.FC<CleanExpensesViewProps> = ({
  trip,
  expenses,
  settlements,
  expenseEvents,
  onEditExpense,
  onDeleteExpense,
  onGoSplit,
  onSettle,
  myUid,
}) => {
  const [view, setView] = useState<'balances' | 'all'>('balances');
  const [search, setSearch] = useState<string>('');
  const [confirmExp, setConfirmExp] = useState<Expense | null>(null);
  const [confirmSettle, setConfirmSettle] = useState<{ from: string; to: string; amount: number } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const totalSpent = expenses.reduce((a, b) => a + (Number(b.amount) || 0), 0);

  const me = (myUid ? trip.members.find((m) => m.uid === myUid) : undefined)
    || trip.members.find((m) => m.isCurrentUser) || trip.members[0];
  const balances = calculateMemberBalances(trip.members, expenses, settlements);
  const debts = simplifyDebts(balances);
  const myBalance = balances.find((b) => b.memberId === me?.id)?.netBalance || 0;
  const getMember = (id: string) => trip.members.find((m) => m.id === id) || { id, name: 'Friend', avatar: '' };

  const filtered = expenses.filter(e => {
    if (search) {
      const q = search.toLowerCase();
      return e.title.toLowerCase().includes(q) || e.notes?.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-5 max-w-3xl mx-auto pb-24">
      {/* View toggle: Balances (default) · All Expenses */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-full">
        {(['balances', 'all'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 py-2 rounded-full text-xs font-bold cursor-pointer transition-all ${view === v ? 'bg-white text-[#4f46e5] font-extrabold shadow-[0_2px_8px_rgba(0,0,0,0.1)]' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {v === 'balances' ? 'Balances' : `All Expenses (${expenses.length})`}
          </button>
        ))}
      </div>

      {view === 'balances' ? (
        <>
          {/* My balance card */}
          <div className="ui-card p-6">
            <span className="ui-label">Your Balance</span>
            <div className={`ui-metric mt-1 ${myBalance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {myBalance >= 0 ? `+₹${myBalance.toLocaleString('en-IN')}` : `-₹${Math.abs(myBalance).toLocaleString('en-IN')}`}
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1">
              {myBalance >= 0 ? 'Friends owe you money.' : 'You owe money to settle up your share.'}
            </p>
          </div>

          {/* Who owes whom */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="ui-section">Who Owes Whom</h3>
              <button onClick={onGoSplit} className="ui-link">Full splitwise →</button>
            </div>
            {debts.length === 0 ? (
              <div className="ui-card p-6 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-xs text-slate-700 font-bold">All settled — nobody owes anybody.</p>
              </div>
            ) : (
              debts.map((debt, idx) => {
                const from = getMember(debt.fromMemberId);
                const to = getMember(debt.toMemberId);
                return (
                  <div key={idx} className="ui-card p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex -space-x-2 flex-shrink-0">
                        <MemberAvatar name={from.name} avatar={from.avatar} memberId={from.id} size="sm" />
                        <MemberAvatar name={to.name} avatar={to.avatar} memberId={to.id} size="sm" />
                      </div>
                      <p className="text-xs font-extrabold text-slate-900 truncate">
                        {from.name.split(' ')[0]} <ArrowRight className="w-3 h-3 text-slate-400 inline" /> {to.name.split(' ')[0]}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-extrabold text-slate-900">₹{Number(debt.amount).toLocaleString('en-IN')}</span>
                      <button onClick={() => setConfirmSettle({ from: debt.fromMemberId, to: debt.toMemberId, amount: debt.amount })} className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer">
                        Settle
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Member nets */}
          <div className="space-y-2.5">
            <h3 className="ui-section">Member Balances</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {balances.map((b, i) => (
                <div key={b.memberId} className="ui-card p-4 space-y-2 text-center">
                  <div className="flex justify-center"><MemberAvatar name={b.member.name} avatar={b.member.avatar} memberId={b.memberId} index={i} size="lg" /></div>
                  <span className="text-xs font-extrabold text-slate-900 block truncate">{b.member.name}</span>
                  <span className={`text-xs font-extrabold block px-2 py-0.5 rounded-full ${b.netBalance >= 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                    {b.netBalance >= 0 ? `+₹${b.netBalance.toLocaleString('en-IN')}` : `-₹${Math.abs(b.netBalance).toLocaleString('en-IN')}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* 1. Large Spend Header */}
          <div className="ui-card p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="ui-label block">
                Total Trip Spend
              </span>
              <div className="ui-metric text-slate-900 mt-1">
                ₹{totalSpent.toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-slate-500 font-medium mt-1">
                of ₹{Number(trip.totalBudget).toLocaleString('en-IN')} trip budget
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 transition-colors cursor-pointer"
                title="Download full history as PDF"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={onGoSplit}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm shadow-emerald-200 transition-all cursor-pointer"
                title="Open Splitwise"
              >
                <Users className="w-4 h-4" />
                <span>Splitwise</span>
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1">
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
              const myShare = me ? exp.splits.find((s) => s.memberId === me.id)?.amount : undefined;
              return (
                <div
                  key={exp.id}
                  className="ui-card p-4 hover:border-indigo-300 flex items-center justify-between gap-4 transition-all"
                >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                  <Receipt size={16} />
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
                        {exp.splits.length > 1 && ` • Split ${exp.splits.length} ways`}
                        {myShare !== undefined && exp.splits.length > 1 && ` • your share ₹${Number(myShare).toLocaleString('en-IN')}`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="font-extrabold text-slate-900 text-base font-display">
                        ₹{Number(exp.amount).toLocaleString('en-IN')}
                      </span>
                      {exp.splits.length > 1 && (
                        <span className="text-[10px] text-slate-400 font-semibold block">₹{Number(exp.splits[0]?.amount || 0).toLocaleString('en-IN')}/each</span>
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
                        onClick={() => setConfirmExp(exp)}
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

          {/* 4. History — every edit/delete with timestamp */}
          <div className="space-y-2">
            <button onClick={() => setHistoryOpen(!historyOpen)} className="flex items-center gap-1.5 text-xs font-extrabold text-slate-700 hover:text-indigo-600 cursor-pointer">
              <History size={13} /> Expense History ({expenseEvents.length}) {historyOpen ? '▲' : '▼'}
            </button>
            {historyOpen && (
              <div className="space-y-1.5">
                {expenseEvents.length === 0 && (
                  <p className="text-[11px] text-slate-400 font-medium">No edits yet.</p>
                )}
                {expenseEvents.map((ev) => (
                  <div key={ev.id} className="bg-white border border-gray-100 rounded-2xl px-3 py-2 flex items-center justify-between gap-2 shadow-[0_8px_30px_rgb(0,0,0,0.03)]">
                    <p className="text-[11px] text-slate-600 font-medium truncate">
                      <strong className="text-slate-800">{ev.byName}</strong> {ev.action} <strong className="text-slate-800">"{ev.title}"</strong> (Rs.{Number(ev.amount).toLocaleString('en-IN')})
                    </p>
                    <span className="text-[10px] text-slate-400 font-medium flex-shrink-0">
                      {new Date(ev.at).toLocaleDateString([], { day: 'numeric', month: 'short' })}, {new Date(ev.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Printable full-history statement (hidden on screen, included in PDF) */}
          <div id="expense-statement" className="hidden print:block">
            <h1 style={{ fontSize: 20, fontWeight: 800 }}>{trip.title} — Expense History</h1>
            <p style={{ fontSize: 12, color: '#475569' }}>
              {trip.startDate} to {trip.endDate} • Total: Rs.{totalSpent.toLocaleString('en-IN')} of Rs.{Number(trip.totalBudget).toLocaleString('en-IN')}
            </p>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', marginTop: 12 }}>
              <thead>
                <tr>
                  {['Date', 'Title', 'Paid By', 'Amount'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', borderBottom: '2px solid #0f172a', padding: '6px 4px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td style={{ borderBottom: '1px solid #e2e8f0', padding: '6px 4px' }}>{e.date}</td>
                    <td style={{ borderBottom: '1px solid #e2e8f0', padding: '6px 4px' }}>{e.title}</td>
                    <td style={{ borderBottom: '1px solid #e2e8f0', padding: '6px 4px' }}>{trip.members.find((m) => m.id === e.paidByMemberId)?.name || ''}</td>
                    <td style={{ borderBottom: '1px solid #e2e8f0', padding: '6px 4px', textAlign: 'right' }}>Rs.{Number(e.amount).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {confirmExp && (
        <ConfirmDialog
          message={`"${confirmExp.title}" (Rs.${Number(confirmExp.amount).toLocaleString('en-IN')}) will be deleted.`}
          onConfirm={() => onDeleteExpense(confirmExp.id)}
          onClose={() => setConfirmExp(null)}
        />
      )}
      {confirmSettle && (
        <ConfirmDialog
          message={`Record pay-back of Rs.${Number(confirmSettle.amount).toLocaleString('en-IN')}? Spend totals don't change.`}
          onConfirm={() => { onSettle(confirmSettle.from, confirmSettle.to, confirmSettle.amount); setConfirmSettle(null); }}
          onClose={() => setConfirmSettle(null)}
        />
      )}
    </div>
  );
};
