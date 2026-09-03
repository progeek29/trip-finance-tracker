import React, { useState, useEffect } from 'react';
import { Expense, Trip, ExpenseCategory, PaymentMode, ExpenseSplit } from '../../types';
import { X, DollarSign, Users, Sparkles, Banknote, CreditCard, Smartphone, Check } from 'lucide-react';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveExpense: (expense: Expense) => void;
  trip: Trip;
  initialExpense?: Expense | null;
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({
  isOpen,
  onClose,
  onSaveExpense,
  trip,
  initialExpense,
}) => {
  if (!isOpen) return null;

  const isEditing = Boolean(initialExpense);

  const [title, setTitle] = useState(initialExpense?.title || '');
  const [amount, setAmount] = useState<number | ''>(initialExpense?.amount || '');
  const [category, setCategory] = useState<ExpenseCategory>(initialExpense?.category || 'food');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(initialExpense?.paymentMode || 'upi');
  const [paidByMemberId, setPaidByMemberId] = useState<string>(
    initialExpense?.paidByMemberId || trip.members.find(m => m.isCurrentUser)?.id || trip.members[0].id
  );
  const [cityId, setCityId] = useState<string>(initialExpense?.cityId || trip.cities[0]?.id || '');
  const [date, setDate] = useState<string>(initialExpense?.date || new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState<string>(initialExpense?.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const [notes, setNotes] = useState<string>(initialExpense?.notes || '');
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>(
    initialExpense?.splits && initialExpense.splits.length > 0 && initialExpense.splits[0].amount !== (Number(initialExpense.amount) / initialExpense.splits.length)
      ? 'custom'
      : 'equal'
  );

  // Selected members for split
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>(
    initialExpense ? initialExpense.splits.map(s => s.memberId) : trip.members.map(m => m.id)
  );

  // Custom amounts mapping
  const [customAmounts, setCustomAmounts] = useState<{ [memberId: string]: number }>(() => {
    const map: { [memberId: string]: number } = {};
    if (initialExpense?.splits) {
      initialExpense.splits.forEach(s => {
        map[s.memberId] = s.amount;
      });
    }
    return map;
  });

  const handleToggleMember = (memberId: string) => {
    if (selectedMemberIds.includes(memberId)) {
      if (selectedMemberIds.length === 1) return; // Keep at least one
      setSelectedMemberIds(selectedMemberIds.filter(id => id !== memberId));
    } else {
      setSelectedMemberIds([...selectedMemberIds, memberId]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!title || !numAmount || numAmount <= 0) {
      alert('Please enter a valid title and amount');
      return;
    }

    // Build splits
    let finalSplits: ExpenseSplit[] = [];
    if (splitMode === 'equal') {
      const splitAmount = Math.round((numAmount / selectedMemberIds.length) * 100) / 100;
      finalSplits = selectedMemberIds.map(memberId => ({
        memberId,
        amount: splitAmount,
      }));
    } else {
      finalSplits = selectedMemberIds.map(memberId => ({
        memberId,
        amount: customAmounts[memberId] || 0,
      }));
    }

    const expenseData: Expense = {
      id: initialExpense?.id || 'exp_' + Date.now(),
      tripId: trip.id,
      cityId,
      title,
      amount: numAmount,
      currency: 'INR',
      category,
      paymentMode,
      paidByMemberId,
      date,
      time,
      notes,
      isGroupExpense: finalSplits.length > 1,
      splits: finalSplits,
      isAutoParsedSMS: initialExpense?.isAutoParsedSMS,
      originalSMS: initialExpense?.originalSMS,
    };

    onSaveExpense(expenseData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="glass-panel max-w-lg w-full rounded-3xl p-6 sm:p-8 border border-white/10 bg-slate-900 shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
          <div>
            <h3 className="text-xl font-bold text-white font-display">
              {isEditing ? 'Edit Expense & Cash' : 'Log New Expense'}
            </h3>
            <p className="text-xs text-slate-400">Add or adjust cash transactions, group splits & category</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title & Amount */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Expense Title / Merchant *</label>
            <input
              type="text"
              required
              placeholder="e.g. Curlies Shack Dinner, Scooty Petrol, Taxi"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl glass-input px-3.5 py-2.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Total Amount (₹ INR) *</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full rounded-xl glass-input pl-8 pr-3 py-2 text-sm font-bold text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="w-full rounded-xl glass-input px-3 py-2 text-sm bg-slate-900"
              >
                <option value="food">Food & Cafe 🍔</option>
                <option value="drinks">Drinks & Shacks 🍹</option>
                <option value="stay">Stay / Hotels 🏨</option>
                <option value="transit">Transit & Cabs 🚕</option>
                <option value="activities">Activities & Sports 🤿</option>
                <option value="fuel">Fuel / Petrol ⛽</option>
                <option value="shopping">Shopping 🛍</option>
                <option value="emergency">Emergency 🩺</option>
                <option value="other">Other 📦</option>
              </select>
            </div>
          </div>

          {/* Payment Mode Pills */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Payment Mode</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'upi', label: 'UPI / PhonePe', icon: Smartphone },
                { id: 'card', label: 'Card / POS', icon: CreditCard },
                { id: 'cash', label: 'Cash Paid', icon: Banknote },
                { id: 'sms_auto', label: 'SMS Auto', icon: Sparkles },
              ].map((m) => {
                const Icon = m.icon;
                const isSelected = paymentMode === m.id;
                return (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => setPaymentMode(m.id as PaymentMode)}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs font-medium transition-all ${
                      isSelected
                        ? 'bg-indigo-600/30 border-indigo-500 text-indigo-200 shadow-sm'
                        : 'bg-slate-900/60 border-white/5 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Icon className="w-4 h-4 mb-1" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Payer & City */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Paid By</label>
              <select
                value={paidByMemberId}
                onChange={(e) => setPaidByMemberId(e.target.value)}
                className="w-full rounded-xl glass-input px-3 py-2 text-xs bg-slate-900"
              >
                {trip.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.isCurrentUser ? '(You)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">City / Stop</label>
              <select
                value={cityId}
                onChange={(e) => setCityId(e.target.value)}
                className="w-full rounded-xl glass-input px-3 py-2 text-xs bg-slate-900"
              >
                {trip.cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl glass-input px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Time</label>
              <input
                type="text"
                placeholder="07:30 PM"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-xl glass-input px-3 py-2 text-xs"
              />
            </div>
          </div>

          {/* Split Section */}
          <div className="pt-2 border-t border-white/5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-indigo-400" />
                <span>Split with Friends ({selectedMemberIds.length} Members)</span>
              </label>

              <div className="flex items-center gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => setSplitMode('equal')}
                  className={`px-2 py-0.5 rounded-md font-medium ${
                    splitMode === 'equal' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Equally
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMode('custom')}
                  className={`px-2 py-0.5 rounded-md font-medium ${
                    splitMode === 'custom' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Custom
                </button>
              </div>
            </div>

            {/* Member toggle badges */}
            <div className="grid grid-cols-2 gap-2">
              {trip.members.map((member) => {
                const isSelected = selectedMemberIds.includes(member.id);
                const equalShare = amount && selectedMemberIds.length > 0 
                  ? Math.round((Number(amount) / selectedMemberIds.length) * 100) / 100 
                  : 0;

                return (
                  <div
                    key={member.id}
                    onClick={() => handleToggleMember(member.id)}
                    className={`flex items-center justify-between p-2 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-slate-800/80 border-indigo-500/50 text-white'
                        : 'bg-slate-900/40 border-white/5 text-slate-500 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <img
                        src={member.avatar}
                        alt={member.name}
                        className="w-6 h-6 rounded-full object-cover"
                      />
                      <span className="text-xs font-medium">{member.name.split(' ')[0]}</span>
                    </div>

                    {isSelected && (
                      <span className="text-[11px] font-bold text-indigo-300">
                        {splitMode === 'equal' ? `₹${equalShare}` : `₹${customAmounts[member.id] || 0}`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Notes / Bill Details</label>
            <input
              type="text"
              placeholder="e.g. Paid in cash directly to bike vendor"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl glass-input px-3.5 py-2 text-xs"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 transition-all"
            >
              {isEditing ? 'Save Changes' : 'Record Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
