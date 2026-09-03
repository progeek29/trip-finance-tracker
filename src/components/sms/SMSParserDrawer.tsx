import React, { useState } from 'react';
import { Trip, Expense, SMSParseResult, ExpenseCategory } from '../../types';
import { parseBankSMS, isDateWithinTrip } from '../../utils/smsParser';
import { SAMPLE_SMS_TEMPLATES } from '../../data/mockData';
import { 
  MessageSquareCode, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Plus, 
  ArrowRight, 
  Smartphone, 
  CreditCard,
  RefreshCw
} from 'lucide-react';
import { Badge } from '../common/Badge';

interface SMSParserDrawerProps {
  trip: Trip;
  onAddParsedExpense: (expense: Expense) => void;
}

export const SMSParserDrawer: React.FC<SMSParserDrawerProps> = ({
  trip,
  onAddParsedExpense,
}) => {
  const [rawSMS, setRawSMS] = useState(SAMPLE_SMS_TEMPLATES[0].text);
  const [parsedResult, setParsedResult] = useState<SMSParseResult | null>(() => parseBankSMS(SAMPLE_SMS_TEMPLATES[0].text));
  const [selectedCategory, setSelectedCategory] = useState<ExpenseCategory>('food');
  const [selectedCityId, setSelectedCityId] = useState<string>(trip.cities[0]?.id || '');
  const [splitWithGroup, setSplitWithGroup] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSMSChange = (text: string) => {
    setRawSMS(text);
    const res = parseBankSMS(text);
    setParsedResult(res);
    if (res) {
      setSelectedCategory(res.category);
    }
  };

  const handleLoadSample = (sampleText: string) => {
    handleSMSChange(sampleText);
  };

  const handleAddExpense = () => {
    if (!parsedResult) return;

    const currentMember = trip.members.find(m => m.isCurrentUser) || trip.members[0];
    const splits = splitWithGroup
      ? trip.members.map(m => ({
          memberId: m.id,
          amount: Math.round((parsedResult.amount / trip.members.length) * 100) / 100,
        }))
      : [{ memberId: currentMember.id, amount: parsedResult.amount }];

    const newExp: Expense = {
      id: 'exp_sms_' + Date.now(),
      tripId: trip.id,
      cityId: selectedCityId,
      title: parsedResult.merchant,
      amount: parsedResult.amount,
      currency: 'INR',
      category: selectedCategory,
      paymentMode: 'sms_auto',
      paidByMemberId: currentMember.id,
      date: parsedResult.date,
      time: parsedResult.time,
      notes: `Auto-logged from ${parsedResult.bankName} SMS (${parsedResult.accountEnding ? 'ending ' + parsedResult.accountEnding : 'Debit'})`,
      isGroupExpense: splitWithGroup,
      splits,
      isAutoParsedSMS: true,
      originalSMS: parsedResult.rawSMS,
    };

    onAddParsedExpense(newExp);
    setSuccessMessage(`Logged ₹${parsedResult.amount.toLocaleString('en-IN')} for "${parsedResult.merchant}"!`);
    setTimeout(() => setSuccessMessage(null), 3500);
  };

  const isTripActiveDate = parsedResult ? isDateWithinTrip(parsedResult.date, trip.startDate, trip.endDate) : false;

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="glass-card rounded-3xl p-6 sm:p-8 border border-white/10 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-xl">
            <div className="flex items-center gap-2">
              <Badge variant="emerald" size="md">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Smart SMS & Debit Listener</span>
              </Badge>
              <Badge variant="indigo" size="sm">
                Active During Trip
              </Badge>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-white font-display">
              Bank SMS Debit Auto-Tracker
            </h2>

            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
              When you make a payment via UPI or Credit Card during your trip, paste or receive your debit SMS here to extract amount, merchant, and split it among friends instantly.
            </p>
          </div>

          {/* Android Native Info Box */}
          <div className="glass-card rounded-2xl p-4 border border-emerald-500/30 bg-emerald-950/20 md:w-80">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-300 mb-1">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <span>Android Auto-Ingest Ready</span>
            </div>
            <p className="text-[11px] text-slate-300">
              When bundled as an Android app via Capacitor, this module automatically reads incoming debit SMS in the background without needing manual copy-pasting.
            </p>
          </div>
        </div>
      </div>

      {/* Main Parser Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: SMS Input & Sample Templates (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="glass-card rounded-2xl p-6 border border-white/10">
            <label className="block text-xs font-bold text-slate-200 mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <MessageSquareCode className="w-4 h-4 text-indigo-400" />
                <span>Paste Debit SMS Notification</span>
              </span>
              <span className="text-[11px] text-slate-400 font-normal">Auto-parses HDFC, SBI, ICICI, Axis, Paytm, GPay</span>
            </label>

            <textarea
              rows={4}
              value={rawSMS}
              onChange={(e) => handleSMSChange(e.target.value)}
              placeholder="Paste your bank debit SMS text here..."
              className="w-full rounded-2xl glass-input p-4 text-xs sm:text-sm font-mono leading-relaxed"
            />

            {/* Quick Test Samples */}
            <div className="mt-4 pt-4 border-t border-white/5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                Click Sample Bank SMS to Test:
              </span>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_SMS_TEMPLATES.map((tpl, i) => (
                  <button
                    key={i}
                    onClick={() => handleLoadSample(tpl.text)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-white/5 transition-colors"
                  >
                    {tpl.bank}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Parsed Transaction Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="glass-card rounded-2xl p-6 border border-white/10 h-full flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-white text-sm font-display flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <span>Parsed Transaction Preview</span>
                </h3>
                {parsedResult && (
                  <Badge variant="emerald" size="sm">
                    Valid Debit ✓
                  </Badge>
                )}
              </div>

              {parsedResult ? (
                <div className="space-y-4">
                  {/* Amount Callout */}
                  <div className="bg-slate-900/90 rounded-2xl p-4 border border-white/10 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">Extracted Amount</span>
                      <div className="text-3xl font-black text-white font-display">
                        ₹{parsedResult.amount.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase text-slate-400 font-semibold block">Payment Source</span>
                      <span className="text-xs font-bold text-indigo-400">{parsedResult.bankName}</span>
                    </div>
                  </div>

                  {/* Merchant & Account */}
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1.5 border-b border-white/5">
                      <span className="text-slate-400">Detected Merchant:</span>
                      <span className="font-bold text-white">{parsedResult.merchant}</span>
                    </div>
                    {parsedResult.accountEnding && (
                      <div className="flex justify-between py-1.5 border-b border-white/5">
                        <span className="text-slate-400">Card / Account:</span>
                        <span className="font-mono text-slate-200">ending {parsedResult.accountEnding}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-1.5 border-b border-white/5">
                      <span className="text-slate-400">Trip Date Check:</span>
                      <span className={isTripActiveDate ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                        {isTripActiveDate ? 'Matches Active Trip (Goa)' : 'Outside Active Dates'}
                      </span>
                    </div>
                  </div>

                  {/* Category & City Overrides */}
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">Category</label>
                      <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value as ExpenseCategory)}
                        className="w-full rounded-xl glass-input px-2.5 py-1.5 text-xs bg-slate-900"
                      >
                        <option value="food">Food & Cafe</option>
                        <option value="drinks">Drinks & Shacks</option>
                        <option value="stay">Stay / Hotel</option>
                        <option value="transit">Transit & Cabs</option>
                        <option value="activities">Activities</option>
                        <option value="fuel">Fuel / Petrol</option>
                        <option value="shopping">Shopping</option>
                        <option value="emergency">Emergency</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">City Stop</label>
                      <select
                        value={selectedCityId}
                        onChange={(e) => setSelectedCityId(e.target.value)}
                        className="w-full rounded-xl glass-input px-2.5 py-1.5 text-xs bg-slate-900"
                      >
                        {trip.cities.map((c) => (
                          <option key={c.id} value={c.id}>{c.name.split('(')[0]}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Split toggle */}
                  <label className="flex items-center gap-2 text-xs text-slate-300 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={splitWithGroup}
                      onChange={(e) => setSplitWithGroup(e.target.checked)}
                      className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-900 w-4 h-4"
                    />
                    <span>Split equally among all 4 friends (₹{(parsedResult.amount / trip.members.length).toFixed(0)} each)</span>
                  </label>
                </div>
              ) : (
                <div className="py-8 text-center text-slate-400 text-xs">
                  <AlertCircle className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <p>Paste a valid bank debit notification SMS on the left to extract details.</p>
                </div>
              )}
            </div>

            {/* Ingest Action Button */}
            <div className="pt-4 border-t border-white/5 mt-4">
              {successMessage && (
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold mb-3 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{successMessage}</span>
                </div>
              )}

              <button
                disabled={!parsedResult}
                onClick={handleAddExpense}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm shadow-lg shadow-emerald-600/30 transition-all transform active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>+ Ingest to Trip Expenses</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
