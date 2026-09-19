import React, { useState } from 'react';
import { PhoneInput, isValidPhone } from './PhoneInput';
import { authGetUser, authUpdateProfile } from '../../utils/supabaseClient';
import { Logo } from './Logo';

interface PhoneGateProps {
  onDone: () => void;
  onSkip?: () => void;
}

/** Post-Google step (roadmap §6): collect mobile (+optional gender chips,
 *  free ride). Skip allowed — Profile nudges later. */
export const PhoneGate: React.FC<PhoneGateProps> = ({ onDone, onSkip }) => {
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (phone && !isValidPhone(phone)) {
      setError('Please enter a valid 10-digit mobile number (or Skip).');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const u = await authGetUser();
      await authUpdateProfile({
        name: u?.name || 'Friend',
        phone: phone.trim(),
        ...(gender ? { gender } : {}),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try Skip for now.');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 panel-enter">
      <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-100 shadow-xl p-6">
        <div className="flex flex-col items-center text-center mb-5">
          <Logo size={44} />
          <h2 className="text-lg font-extrabold text-slate-900 font-display mt-3">Almost there</h2>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Add your mobile so squad mates can reach you. Gender is optional.
          </p>
        </div>
        <PhoneInput value={phone} onChange={setPhone} />
        <div className="grid grid-cols-2 gap-2 mt-3">
          {(['male', 'female'] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGender((prev) => (prev === g ? null : g))}
              className={`h-11 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                gender === g
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                  : 'bg-slate-50 border border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              {g === 'male' ? 'Male' : 'Female'}
            </button>
          ))}
        </div>
        {error && (
          <p className="text-[11px] text-rose-500 bg-rose-50 rounded-lg px-3 py-2 font-bold mt-3">{error}</p>
        )}
        <button
          onClick={() => void save()}
          disabled={busy}
          className="w-full h-11 mt-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold cursor-pointer"
        >
          {busy ? 'Saving…' : 'Continue'}
        </button>
        <button
          onClick={() => (onSkip ? onSkip() : onDone())}
          className="w-full mt-1.5 h-10 text-xs text-slate-400 font-bold hover:text-slate-600 cursor-pointer"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
};

export default PhoneGate;
