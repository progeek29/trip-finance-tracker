import React, { useEffect, useState } from 'react';
import { Trip, Expense } from '../../types';
import { X } from 'lucide-react';
import { CustomSelect } from '../common/CustomSelect';
import { formatPhoneDisplay } from '../common/PhoneInput';

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: Trip;
  onSaveExpense: (expense: Expense) => void;
  initialExpense?: Expense | null;
}

type SplitMode = 'equal' | 'custom';

const round2 = (n: number) => Math.round(n * 100) / 100;

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen,
  onClose,
  trip,
  onSaveExpense,
  initialExpense,
}) => {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [paidByMemberId, setPaidByMemberId] = useState<string>('');
  const [splitMemberIds, setSplitMemberIds] = useState<string[]>([]);
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [customAmounts, setCustomAmounts] = useState<Record<string, number | ''>>({});
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<'title' | 'amount' | 'split' | null>(null);

  // Sync state ONLY on open / editing target change — not on every trip object re-render
  const prevOpenRef = React.useRef(false);
  const prevExpenseIdRef = React.useRef<string | null>(null);
  useEffect(() => {
    const expId = initialExpense?.id || null;
    const shouldReset = isOpen && (!prevOpenRef.current || prevExpenseIdRef.current !== expId);
    prevOpenRef.current = isOpen;
    prevExpenseIdRef.current = expId;
    if (!shouldReset) return;
    setTitle(initialExpense?.title || '');
    setAmount(initialExpense?.amount ?? '');
    setPaidByMemberId(
      initialExpense?.paidByMemberId ||
        trip.members.find((m) => m.isCurrentUser)?.id ||
        trip.members[0]?.id ||
        ''
    );
    const defaultSplit = initialExpense
      ? initialExpense.splits.map((s) => s.memberId)
      : trip.members.map((m) => m.id);
    setSplitMemberIds(defaultSplit);
    setCustomAmounts({});
    // Editing an unequal bill → reopen in custom mode with values prefilled
    if (initialExpense && initialExpense.splits.length > 1) {
      const amts = initialExpense.splits.map((s) => Number(s.amount));
      const allEqual = amts.every((a) => Math.abs(a - amts[0]) < 0.005);
      if (!allEqual) {
        setSplitMode('custom');
        const pre: Record<string, number> = {};
        initialExpense.splits.forEach((s) => { pre[s.memberId] = Number(s.amount); });
        setCustomAmounts(pre);
      } else {
        setSplitMode('equal');
      }
    } else {
      setSplitMode('equal');
    }
    setNotes(initialExpense?.notes || '');
    setFormError(null);
  }, [isOpen, initialExpense]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!title.trim()) {
      setFormError('title');
      return;
    }
    if (!numAmount || numAmount <= 0) {
      setFormError('amount');
      return;
    }
    // Whom to split with — chips below, defaults to full squad
    const activeSplitIds = splitMemberIds.length > 0 ? splitMemberIds : trip.members.map((m) => m.id);
    let splits: { memberId: string; amount: number }[];
    if (splitMode === 'custom' && activeSplitIds.length > 1) {
      splits = activeSplitIds.map((memberId) => ({ memberId, amount: Number(customAmounts[memberId]) || 0 }));
      const sum = round2(splits.reduce((a, s) => a + s.amount, 0));
      if (Math.abs(sum - numAmount) > 0.01) {
        setFormError('split');
        return;
      }
    } else {
      const perHead = round2(numAmount / activeSplitIds.length);
      splits = activeSplitIds.map((memberId) => ({ memberId, amount: perHead }));
    }
    setFormError(null);

    const now = new Date();
    const expenseData: Expense = {
      id: initialExpense?.id || 'exp_' + Date.now(),
      tripId: trip.id,
      cityId: initialExpense?.cityId || trip.cities[0]?.id,
      title: title.trim(),
      amount: numAmount,
      currency: 'INR',
      category: initialExpense?.category || 'other',
      paymentMode: initialExpense?.paymentMode || 'upi',
      paidByMemberId,
      date: initialExpense?.date || now.toISOString().split('T')[0],
      time: initialExpense?.time || now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      notes,
      isGroupExpense: activeSplitIds.length > 1,
      splits,
      isAutoParsedSMS: initialExpense?.isAutoParsedSMS,
      originalSMS: initialExpense?.originalSMS,
    };

    onSaveExpense(expenseData);
    onClose();
  };

  const toggleSplitMember = (id: string) => {
    setSplitMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="modal-enter max-w-md w-full rounded-3xl p-5 sm:p-6 border border-gray-100 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.08)] max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <h3 className="text-sm font-extrabold text-slate-900 font-display tracking-tight">{initialExpense ? 'Edit Expense' : 'Add Expense'}</h3>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block ui-label mb-1.5">Amount *</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg text-slate-400 select-none">₹</span>
                <input
                  type="number"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value === '' ? '' : Number(e.target.value));
                    if (formError === 'amount' && Number(e.target.value) > 0) setFormError(null);
                  }}
                  className={`w-full rounded-2xl border pl-10 pr-4 py-2.5 text-lg text-slate-900 tabular-nums focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 font-display placeholder:text-slate-300 ${
                    formError === 'amount' ? 'bg-rose-50 border-rose-400 placeholder-rose-200 focus:border-rose-400' : 'bg-slate-50 border-slate-200 focus:border-indigo-500'
                  }`}
                />
              </div>
            </div>

            <div>
              <label className="block ui-label mb-1.5">What you paid for *</label>
              <input
                type="text"
                placeholder="e.g. Thalassa Restaurant, Cab to Airport..."
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (formError === 'title' && e.target.value.trim()) setFormError(null);
                }}
                className={`w-full rounded-xl border px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 font-display placeholder:text-slate-300 ${
                  formError === 'title' ? 'bg-rose-50 border-rose-400 placeholder-rose-300 focus:border-rose-400' : 'bg-slate-50 border-slate-200 focus:border-indigo-500'
                  }`}
              />
              </div>

            <div>
              <CustomSelect
                label="Who Paid?"
                value={paidByMemberId}
                onChange={setPaidByMemberId}
                options={trip.members.map((m) => ({
                  value: m.id,
                  label: m.isCurrentUser ? `${m.name.replace(/\(You\)/g, '').trim()} (You)` : m.name,
                  hint: formatPhoneDisplay(m.phone) || undefined,
                }))}
              />
            </div>

            <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700">Split between</span>
                <div className="flex gap-1 p-0.5 bg-white rounded-lg border border-indigo-100">
                  {(['equal', 'custom'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setSplitMode(m); setFormError(null); }}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold capitalize cursor-pointer ${splitMode === m ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-indigo-600'}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {trip.members.map((m) => {
                  const selected = splitMemberIds.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleSplitMember(m.id)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                        selected
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                      }`}
                      title={selected ? 'Tap to exclude' : 'Tap to include'}
                    >
                      {selected ? '✓ ' : ''}{m.name.split(' ')[0]}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setSplitMemberIds(trip.members.map((m) => m.id))}
                  className="px-2.5 py-1 rounded-full text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
                >
                  All
                </button>
              </div>
              {splitMemberIds.length > 0 && amount ? (
                splitMode === 'equal' ? (
                  <p className="text-[11px] text-slate-600 font-medium">
                    ₹{Number(amount).toLocaleString('en-IN')} ÷ {splitMemberIds.length} = <strong>₹{(Math.round((Number(amount) / splitMemberIds.length) * 100) / 100).toLocaleString('en-IN')} each</strong>
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {splitMemberIds.map((id) => {
                      const m = trip.members.find((x) => x.id === id);
                      if (!m) return null;
                      return (
                        <div key={id} className="flex items-center gap-2">
                          <span className="flex-1 text-[11px] font-bold text-slate-700 truncate">{m.name.split(' ')[0]}</span>
                          <span className="flex items-center gap-1">
                            <span className="text-[11px] text-slate-400 font-bold">₹</span>
                            <input
                              type="number"
                              min={0}
                              value={customAmounts[id] ?? ''}
                              onChange={(e) => { setCustomAmounts((p) => ({ ...p, [id]: e.target.value === '' ? '' : Number(e.target.value) })); setFormError(null); }}
                              placeholder="0"
                              className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-800 focus:outline-none focus:border-indigo-400"
                            />
                          </span>
                        </div>
                      );
                    })}
                    {(() => {
                      const numAmount = Number(amount) || 0;
                      const sum = round2(splitMemberIds.reduce((a, id) => a + (Number(customAmounts[id]) || 0), 0));
                      const left = round2(numAmount - sum);
                      return (
                        <p className={`text-[11px] font-bold ${Math.abs(left) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          Split total ₹{sum.toLocaleString('en-IN')} · {Math.abs(left) < 0.01 ? 'matches bill' : `₹${Math.abs(left).toLocaleString('en-IN')} ${left > 0 ? 'left' : 'over'}`}
                        </p>
                      );
                    })()}
                  </div>
                )
              ) : null}
              {formError === 'split' && (
                <p className="text-[11px] text-rose-500 font-bold">
                  Custom amounts must add up to the bill amount.
                </p>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100">
              <button type="submit" className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm shadow-indigo-200 cursor-pointer">
                Save
              </button>
            </div>
        </form>
      </div>
    </div>
  );
};
