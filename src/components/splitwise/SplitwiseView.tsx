import React, { useState } from 'react';
import { Trip, Expense, SettlementDebt, TripMember } from '../../types';
import { calculateMemberBalances, simplifyDebts } from '../../utils/debtSimplifier';
import { 
  Users, 
  ArrowRight, 
  CheckCircle2, 
  QrCode, 
  Share2, 
  Sparkles, 
  Wallet, 
  TrendingUp, 
  Send, 
  Plus, 
  Coins 
} from 'lucide-react';
import { Badge } from '../common/Badge';
import confetti from 'canvas-confetti';

interface SplitwiseViewProps {
  trip: Trip;
  expenses: Expense[];
  onOpenAddExpense: () => void;
  onRecordSettlement?: (debt: SettlementDebt) => void;
}

export const SplitwiseView: React.FC<SplitwiseViewProps> = ({
  trip,
  expenses,
  onOpenAddExpense,
  onRecordSettlement,
}) => {
  const [selectedQRDebt, setSelectedQRDebt] = useState<SettlementDebt | null>(null);
  const [settledDebtIds, setSettledDebtIds] = useState<string[]>([]);

  // Calculate balances & simplified transactions
  const balances = calculateMemberBalances(trip.members, expenses);
  const settlements = simplifyDebts(balances);

  const getMember = (id: string): TripMember => {
    return trip.members.find((m) => m.id === id) || {
      id,
      name: 'Friend',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80',
    };
  };

  const handleSettle = (debt: SettlementDebt, debtKey: string) => {
    // Trigger celebratory confetti
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.7 },
    });

    setSettledDebtIds((prev) => [...prev, debtKey]);
    if (onRecordSettlement) {
      onRecordSettlement(debt);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="glass-card rounded-3xl p-6 sm:p-8 border border-white/10 bg-gradient-to-br from-indigo-950/50 via-slate-900 to-slate-950 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-xl">
            <Badge variant="indigo" size="md">
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              <span>4-Friend Smart Split Engine</span>
            </Badge>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-white font-display">
              Group Balance & Debt Simplification
            </h2>

            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
              Auto-optimizes all shared dinners, pool villa stay, and rental scooty expenses into the minimum possible transactions.
            </p>
          </div>

          <button
            onClick={onOpenAddExpense}
            className="flex items-center justify-center gap-2 py-3 px-5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 transition-all transform active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Shared Bill</span>
          </button>
        </div>
      </div>

      {/* Simplified Debts (The core Splitwise magic) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white font-display flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Optimized Settlements ({settlements.length} Payments Needed)</span>
            </h3>
            <p className="text-xs text-slate-400">The fastest way to settle everyone's balances with zero confusion</p>
          </div>
        </div>

        {settlements.length === 0 ? (
          <div className="glass-card rounded-2xl p-8 text-center border border-white/10">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-white mb-1">All Squared Up!</h4>
            <p className="text-xs text-slate-400">No pending debts between friends right now.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {settlements.map((debt, index) => {
              const fromMember = getMember(debt.fromMemberId);
              const toMember = getMember(debt.toMemberId);
              const debtKey = `${debt.fromMemberId}_${debt.toMemberId}_${debt.amount}`;
              const isSettled = settledDebtIds.includes(debtKey);

              // Generate UPI Pay URL for India
              const upiLink = toMember.upiId 
                ? `upi://pay?pa=${toMember.upiId}&pn=${encodeURIComponent(toMember.name)}&am=${debt.amount}&cu=INR&tn=${encodeURIComponent(`Goa Trip Settlement - ${trip.title}`)}`
                : null;

              return (
                <div
                  key={index}
                  className={`glass-card rounded-2xl p-5 border transition-all ${
                    isSettled 
                      ? 'border-emerald-500/30 bg-emerald-950/20 opacity-75' 
                      : 'border-white/10 hover:border-indigo-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 mb-4">
                    {/* Debtor */}
                    <div className="flex items-center gap-2.5">
                      <img
                        src={fromMember.avatar}
                        alt={fromMember.name}
                        className="w-10 h-10 rounded-full object-cover border-2 border-rose-500/40"
                      />
                      <div>
                        <span className="text-xs font-bold text-white block">
                          {fromMember.name} {fromMember.isCurrentUser ? '(You)' : ''}
                        </span>
                        <span className="text-[10px] text-rose-400 font-semibold">Owes Payment</span>
                      </div>
                    </div>

                    <ArrowRight className="w-5 h-5 text-slate-500" />

                    {/* Creditor */}
                    <div className="flex items-center gap-2.5 text-right">
                      <div>
                        <span className="text-xs font-bold text-white block">
                          {toMember.name} {toMember.isCurrentUser ? '(You)' : ''}
                        </span>
                        <span className="text-[10px] text-emerald-400 font-semibold">Receives</span>
                      </div>
                      <img
                        src={toMember.avatar}
                        alt={toMember.name}
                        className="w-10 h-10 rounded-full object-cover border-2 border-emerald-500/40"
                      />
                    </div>
                  </div>

                  {/* Settlement Amount & Action */}
                  <div className="bg-slate-900/80 rounded-xl p-3 border border-white/5 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Settlement Sum</span>
                      <span className="text-xl font-black text-white font-display">
                        ₹{debt.amount.toLocaleString('en-IN')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {toMember.upiId && !isSettled && (
                        <button
                          onClick={() => setSelectedQRDebt(debt)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 text-xs font-semibold border border-sky-500/30 transition-colors"
                          title="View UPI QR Code"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>Pay UPI</span>
                        </button>
                      )}

                      <button
                        disabled={isSettled}
                        onClick={() => handleSettle(debt, debtKey)}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          isSettled
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 cursor-default'
                            : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-600/20'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{isSettled ? 'Settled ✓' : 'Mark Settled'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Individual Net Balances Table */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-white font-display">Member Balances Overview</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {balances.map((b) => (
            <div
              key={b.memberId}
              className="glass-card rounded-2xl p-5 border border-white/10 flex flex-col justify-between"
            >
              <div className="flex items-center gap-3 mb-3">
                <img
                  src={b.member.avatar}
                  alt={b.member.name}
                  className="w-10 h-10 rounded-full object-cover border border-white/10"
                />
                <div>
                  <h4 className="text-sm font-bold text-white">
                    {b.member.name} {b.member.isCurrentUser ? '(You)' : ''}
                  </h4>
                  <span className="text-[11px] text-slate-400">{b.member.upiId || 'No UPI ID'}</span>
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-white/5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Total Paid Out:</span>
                  <span className="font-semibold text-slate-200">₹{b.totalPaid.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Total Share Owed:</span>
                  <span className="font-semibold text-slate-200">₹{b.totalOwed.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-white/5 font-bold">
                  <span>Net Status:</span>
                  <span className={b.netBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {b.netBalance >= 0 ? `+₹${b.netBalance.toLocaleString('en-IN')} (Gets back)` : `-₹${Math.abs(b.netBalance).toLocaleString('en-IN')} (Owes)`}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* UPI QR Payment Modal */}
      {selectedQRDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="glass-panel max-w-sm w-full rounded-3xl p-6 border border-white/10 bg-slate-900 text-center shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1 font-display">Instant UPI Payment</h3>
            <p className="text-xs text-slate-400 mb-4">
              Pay <strong>{getMember(selectedQRDebt.toMemberId).name}</strong> ₹{selectedQRDebt.amount.toLocaleString('en-IN')}
            </p>

            {/* Simulated UPI QR Code image */}
            <div className="bg-white p-4 rounded-2xl inline-block mb-4 shadow-lg">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                  `upi://pay?pa=${getMember(selectedQRDebt.toMemberId).upiId}&pn=${encodeURIComponent(getMember(selectedQRDebt.toMemberId).name)}&am=${selectedQRDebt.amount}&cu=INR`
                )}`}
                alt="UPI QR Code"
                className="w-44 h-44 mx-auto"
              />
            </div>

            <div className="text-xs text-slate-300 font-mono bg-slate-800/80 p-2 rounded-xl mb-4">
              UPI ID: {getMember(selectedQRDebt.toMemberId).upiId}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedQRDebt(null)}
                className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold"
              >
                Close
              </button>
              <button
                onClick={() => {
                  handleSettle(selectedQRDebt, `${selectedQRDebt.fromMemberId}_${selectedQRDebt.toMemberId}_${selectedQRDebt.amount}`);
                  setSelectedQRDebt(null);
                }}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20"
              >
                Done / Paid ✓
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
