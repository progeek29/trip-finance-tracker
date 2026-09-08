import React, { useEffect, useState } from 'react';
import { Trip, Expense, ExpenseCategory } from '../../types';
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

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen,
  onClose,
  trip,
  onSaveExpense,
  initialExpense,
}) => {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [paidByMemberId, setPaidByMemberId] = useState<string>('');
  const [splitMemberIds, setSplitMemberIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<'title' | 'amount' | null>(null);

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
    setCategory(initialExpense?.category || 'food');
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
    setFormError(null);
    // Whom to split with — chips below, defaults to full squad
    const activeSplitIds = splitMemberIds.length > 0 ? splitMemberIds : trip.members.map((m) => m.id);
    const perHead = Math.round((numAmount / activeSplitIds.length) * 100) / 100;
    const splits = activeSplitIds.map((memberId) => ({ memberId, amount: perHead }));

    const now = new Date();
    const expenseData: Expense = {
      id: initialExpense?.id || 'exp_' + Date.now(),
      tripId: trip.id,
      cityId: initialExpense?.cityId || trip.cities[0]?.id,
      title,
      amount: numAmount,
      currency: 'INR',
      category,
      paidByMemberId,
      date: now.toISOString().split('T')[0],
      time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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

  const categories: { id: ExpenseCategory; label: string }[] = [
    { id: 'food', label: 'Food' },
    { id: 'drinks', label: 'Drinks' },
    { id: 'stay', label: 'Stay' },
    { id: 'transit', label: 'Transit' },
    { id: 'activities', label: 'Activities' },
    { id: 'fuel', label: 'Fuel' },
    { id: 'shopping', label: 'Shopping' },
    { id: 'other', label: 'Other' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="clean-surface max-w-md w-full rounded-3xl p-5 sm:p-6 border border-slate-200 bg-white shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <h3 className="text-sm font-extrabold text-slate-900">{initialExpense ? 'Edit Expense' : 'Add Expense'}</h3>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Amount (Rs.) *</label>
              <input
                type="number"
                placeholder="0"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value === '' ? '' : Number(e.target.value));
                  if (formError === 'amount' && Number(e.target.value) > 0) setFormError(null);
                }}
                className={`w-full rounded-xl border px-3 py-2 text-base font-extrabold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 font-display ${
                  formError === 'amount' ? 'bg-rose-50 border-rose-400 placeholder-rose-300 focus:border-rose-400' : 'bg-slate-50 border-slate-200 focus:border-indigo-500'
                }`}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Description / Merchant *</label>
              <input
                type="text"
                placeholder="e.g. Thalassa Restaurant, Cab to Airport..."
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (formError === 'title' && e.target.value.trim()) setFormError(null);
                }}
                className={`w-full rounded-xl border px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 ${
                  formError === 'title' ? 'bg-rose-50 border-rose-400 placeholder-rose-300 focus:border-rose-400' : 'bg-slate-50 border-slate-200 focus:border-indigo-500'
                  }`}
                />
              </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">Category</label>
              <div className="grid grid-cols-4 gap-1.5">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`py-1.5 px-2 rounded-xl text-[11px] font-bold flex items-center justify-center transition-all cursor-pointer ${
                      category === cat.id
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className="truncate">{cat.label}</span>
                  </button>
                ))}
              </div>
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
              <span className="text-[11px] font-bold text-slate-700 block">Split between</span>
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
                <p className="text-[11px] text-slate-600 font-medium">
                  ₹{Number(amount).toLocaleString('en-IN')} ÷ {splitMemberIds.length} = <strong>₹{(Math.round((Number(amount) / splitMemberIds.length) * 100) / 100).toLocaleString('en-IN')} each</strong>
                </p>
              ) : null}
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
