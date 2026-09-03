import React, { useEffect, useState } from 'react';
import { Trip, Expense, ExpenseCategory, PaymentMode } from '../../types';
import { parseBankSMS } from '../../utils/smsParser';
import { SAMPLE_SMS_TEMPLATES } from '../../data/mockData';
import { X, Sparkles, Banknote, Smartphone, CreditCard, Users, Check, ClipboardPaste, Zap } from 'lucide-react';

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
  const [mode, setMode] = useState<'manual' | 'sms'>('manual');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [paidByMemberId, setPaidByMemberId] = useState<string>('');
  const [expenseDate, setExpenseDate] = useState<string>('');
  const [splitWithFriends, setSplitWithFriends] = useState(true);
  const [notes, setNotes] = useState('');
  const [smsText, setSmsText] = useState('');
  const [parsedNotification, setParsedNotification] = useState<string | null>(null);
  const [autoSmsSupported, setAutoSmsSupported] = useState(false);
  const [autoSmsStatus, setAutoSmsStatus] = useState<string | null>(null);

  // Sync state when modal opens / editing target changes (hooks before early return!)
  useEffect(() => {
    if (!isOpen) return;
    setMode(initialExpense?.isAutoParsedSMS ? 'sms' : 'manual');
    setTitle(initialExpense?.title || '');
    setAmount(initialExpense?.amount ?? '');
    setCategory(initialExpense?.category || 'food');
    setPaymentMode(initialExpense?.paymentMode || 'cash');
    setPaidByMemberId(
      initialExpense?.paidByMemberId ||
        trip.members.find((m) => m.isCurrentUser)?.id ||
        trip.members[0]?.id ||
        ''
    );
    setExpenseDate(initialExpense?.date || new Date().toISOString().split('T')[0]);
    setSplitWithFriends(initialExpense ? initialExpense.splits.length > 1 : true);
    setNotes(initialExpense?.notes || '');
    setSmsText(initialExpense?.originalSMS || '');
    setParsedNotification(null);
    setAutoSmsStatus(null);
    // WebOTP / SMS Receiver API detection (Android Chrome)
    // @ts-ignore
    if ('OTPCredential' in window || (navigator.credentials as any)?.otp) setAutoSmsSupported(true);
    else if (/Android/i.test(navigator.userAgent)) setAutoSmsSupported(true);
  }, [isOpen, initialExpense, trip]);

  if (!isOpen) return null;

  const applyParseResult = (textToParse: string): boolean => {
    const res = parseBankSMS(textToParse);
    if (res) {
      setTitle(res.merchant);
      setAmount(res.amount);
      setCategory(res.category);
      setPaymentMode('sms_auto');
      setNotes(`Auto-parsed from ${res.bankName} SMS${res.accountEnding ? ` (…${res.accountEnding})` : ''}`);
      setExpenseDate(res.date);
      setParsedNotification(`✓ Extracted ₹${res.amount.toLocaleString('en-IN')} at ${res.merchant} (${res.bankName})`);
      setMode('manual');
      return true;
    }
    return false;
  };

  const handleParseSMS = (textToParse: string) => {
    if (!textToParse.trim()) {
      alert('Paste an SMS first.');
      return;
    }
    const ok = applyParseResult(textToParse);
    if (!ok) alert('Could not detect a valid debit amount in the SMS. Please check or enter manually.');
  };

  /** Try WebOTP auto-read (Android Chrome) + clipboard fallback */
  const handleAutoReadSMS = async () => {
    setAutoSmsStatus('Listening for incoming bank SMS…');
    try {
      // @ts-ignore - WebOTP API
      if (navigator.credentials && (navigator.credentials as any).otp) {
        // @ts-ignore
        const content = await (navigator.credentials as any).get({ otp: { transport: ['sms'] } });
        const code = (content as any)?.otp || (content as any)?.code;
        if (code) {
          setSmsText(String(code));
          if (!applyParseResult(String(code))) setMode('sms');
          setAutoSmsStatus('✓ SMS captured from device.');
          return;
        }
      }
    } catch (e) {
      // fall through to clipboard
    }
    try {
      const clip = await navigator.clipboard.readText();
      if (clip && applyParseResult(clip)) {
        setSmsText(clip);
        setAutoSmsStatus('✓ SMS picked from clipboard.');
        return;
      }
      setAutoSmsStatus(clip ? 'Clipboard text is not a bank debit SMS.' : 'Clipboard empty — paste SMS manually.');
    } catch {
      setAutoSmsStatus('Auto-read not permitted here — paste SMS manually (works fully in Android APK).');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (!title || !numAmount || numAmount <= 0) {
      alert('Please provide a title and amount.');
      return;
    }
    const splits = splitWithFriends
      ? trip.members.map((m) => ({
          memberId: m.id,
          amount: Math.round((numAmount / trip.members.length) * 100) / 100,
        }))
      : [{ memberId: paidByMemberId, amount: numAmount }];

    const now = new Date();
    const expenseData: Expense = {
      id: initialExpense?.id || 'exp_' + Date.now(),
      tripId: trip.id,
      cityId: initialExpense?.cityId || trip.cities[0]?.id,
      title,
      amount: numAmount,
      currency: 'INR',
      category,
      paymentMode,
      paidByMemberId,
      date: expenseDate || now.toISOString().split('T')[0],
      time: initialExpense?.time || now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      notes,
      isGroupExpense: splitWithFriends,
      splits,
      isAutoParsedSMS: paymentMode === 'sms_auto',
      originalSMS: paymentMode === 'sms_auto' ? smsText : undefined,
    };

    onSaveExpense(expenseData);
    onClose();
  };

  const categories: { id: ExpenseCategory; label: string; icon: string }[] = [
    { id: 'food', label: 'Food', icon: '🍔' },
    { id: 'drinks', label: 'Drinks', icon: '🍹' },
    { id: 'stay', label: 'Stay', icon: '🏨' },
    { id: 'transit', label: 'Transit', icon: '🚕' },
    { id: 'activities', label: 'Activities', icon: '🤿' },
    { id: 'fuel', label: 'Fuel', icon: '⛽' },
    { id: 'shopping', label: 'Shopping', icon: '🛍' },
    { id: 'other', label: 'Other', icon: '📦' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="clean-surface max-w-md w-full rounded-3xl p-5 sm:p-6 border border-slate-200 bg-white shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                mode === 'manual' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Manual / Cash
            </button>
            <button
              type="button"
              onClick={() => setMode('sms')}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                mode === 'sms' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Bank SMS</span>
            </button>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {parsedNotification && (
          <div className="mb-3 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>{parsedNotification}</span>
          </div>
        )}

        {mode === 'sms' && (
          <div className="space-y-4">
            <div className="p-3 rounded-2xl bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100 flex items-center justify-between gap-2">
              <div className="text-[11px] text-slate-600">
                <span className="font-bold text-indigo-900 block">Automatic SMS picker</span>
                {autoSmsSupported
                  ? 'On Android it reads the debit SMS automatically.'
                  : 'On this browser, one-tap clipboard pick works.'}
              </div>
              <button
                type="button"
                onClick={handleAutoReadSMS}
                className="flex-shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Auto-Read SMS</span>
              </button>
            </div>
            {autoSmsStatus && (
              <p className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 font-medium">
                {autoSmsStatus}
              </p>
            )}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Paste Bank / UPI Debit SMS Message</label>
              <textarea
                rows={3}
                value={smsText}
                onChange={(e) => setSmsText(e.target.value)}
                placeholder="Paste SMS here (e.g. Sent Rs.2,450.00 to Thalassa via UPI...)"
                className="w-full rounded-2xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    const clip = await navigator.clipboard.readText();
                    if (clip) setSmsText(clip);
                  } catch {
                    alert('Clipboard access blocked — long-press to paste.');
                  }
                }}
                className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
              >
                <ClipboardPaste className="w-3.5 h-3.5" /> Paste from clipboard
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleParseSMS(smsText)}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm shadow-indigo-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Parse & Auto-Fill Form</span>
            </button>

            <div className="pt-2 border-t border-slate-100">
              <span className="text-[11px] font-bold text-slate-400 block mb-2 uppercase tracking-wider">
                Or Click a Sample Bank SMS to Test:
              </span>
              <div className="space-y-1.5">
                {SAMPLE_SMS_TEMPLATES.map((sample, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSmsText(sample.text);
                      handleParseSMS(sample.text);
                    }}
                    className="w-full text-left p-2.5 rounded-xl bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 text-xs text-slate-700 transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <span className="font-bold text-indigo-700">{sample.bank}</span>
                    <span className="text-slate-500 text-[10px] truncate max-w-[200px]">{sample.text.slice(0, 35)}...</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {mode === 'manual' && (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Amount (₹ INR) *</label>
                <input
                  type="number"
                  required
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-base font-extrabold text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 font-display"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Payment Mode</label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 h-[38px]"
                >
                  <option value="cash">💵 Cash Paid</option>
                  <option value="upi">⚡ UPI / GPay</option>
                  <option value="card">💳 Credit/Debit Card</option>
                  <option value="netbanking">🏦 NetBanking</option>
                  <option value="sms_auto">🤖 SMS Auto-Parsed</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Description / Merchant *</label>
              <input
                type="text"
                required
                placeholder="e.g. Thalassa Restaurant, Cab to Airport..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Expense Date</label>
              <input
                type="date"
                value={expenseDate}
                min={trip.startDate}
                max={trip.endDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="date-input"
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
                    className={`py-1.5 px-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                      category === cat.id
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span className="truncate">{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Who Paid?</label>
              <select
                value={paidByMemberId}
                onChange={(e) => setPaidByMemberId(e.target.value)}
                className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              >
                {trip.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.isCurrentUser ? '(You)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">Split with {trip.members.length} Squad Friends</span>
                  <span className="text-[10px] text-slate-500 font-medium">Auto-calculates Splitwise debt balances</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={splitWithFriends}
                onChange={(e) => setSplitWithFriends(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-slate-500 hover:text-slate-800 text-xs font-bold cursor-pointer">
                Cancel
              </button>
              <button type="submit" className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm shadow-indigo-200 cursor-pointer">
                {initialExpense ? 'Save Changes' : 'Save Expense'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
