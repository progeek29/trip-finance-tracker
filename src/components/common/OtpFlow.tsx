import React, { useEffect, useRef, useState } from 'react';
import { Mail, Lock, KeyRound, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { requestOtp, verifyOtp, resetPasswordWithToken } from '../../utils/supabaseClient';

interface OtpFlowProps {
  purpose: 'verify' | 'reset';
  initialEmail?: string;
  /** verify → done() · reset → done() after password saved. */
  onDone: () => void;
  onBack?: () => void;
}

/** Email OTP flow: email → 6-digit code → (reset: new password).
 *  One component for signup-verify, forgot-password and Google set-password. */
export const OtpFlow: React.FC<OtpFlowProps> = ({ purpose, initialEmail, onDone, onBack }) => {
  const [email, setEmail] = useState(initialEmail || '');
  const [code, setCode] = useState('');
  const [newPass, setNewPass] = useState('');
  const [step, setStep] = useState<'email' | 'code' | 'password'>('email');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [showPass, setShowPass] = useState(false);
  // Resend cooldown (industry standard): 30s between sends so quota never
  // burns and Brevo never throttles. Server ALSO caps 5/hour/email.
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (cooldownTimer.current) window.clearInterval(cooldownTimer.current);
    };
  }, []);
  const startCooldown = () => {
    setCooldown(30);
    if (cooldownTimer.current) window.clearInterval(cooldownTimer.current);
    cooldownTimer.current = window.setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (cooldownTimer.current) window.clearInterval(cooldownTimer.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const sendCode = async () => {
    if (!validEmail || busy) return;
    setError('');
    setBusy(true);
    try {
      await requestOtp(email.trim(), purpose);
      setInfo(`Code sent to ${email.trim()} — valid 10 minutes.`);
      setStep('code');
      startCooldown();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send code.');
    } finally {
      setBusy(false);
    }
  };

  const checkCode = async () => {
    if (!/^\d{6}$/.test(code.trim()) || busy) return;
    setError('');
    setBusy(true);
    try {
      const r = await verifyOtp(email.trim(), purpose, code.trim());
      if (purpose === 'verify') {
        onDone();
        return;
      }
      if (!r.resetToken) throw new Error('Verification failed. Retry.');
      setResetToken(r.resetToken);
      setStep('password');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Wrong code.');
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    if (!resetToken || newPass.length < 6 || busy) return;
    setError('');
    setBusy(true);
    try {
      await resetPasswordWithToken(resetToken, newPass);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl bg-slate-50 border border-slate-200 p-4">
      {step === 'email' && (
        <>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-2.5 text-sm bg-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>
          {error && <p className="text-xs text-rose-500 font-bold">{error}</p>}
          <button
            type="button"
            onClick={() => void sendCode()}
            disabled={!validEmail || busy}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-sm cursor-pointer"
          >
            {busy ? 'Sending…' : 'Send code'}
          </button>
        </>
      )}
      {step === 'code' && (
        <>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              6-digit code <span className="font-medium text-slate-400">({email.trim()})</span>
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                autoFocus
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-2.5 text-sm tracking-[0.3em] text-center font-extrabold bg-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>
          {info && <p className="text-xs text-emerald-600 font-bold">{info}</p>}
          {error && <p className="text-xs text-rose-500 font-bold">{error}</p>}
          <button
            type="button"
            onClick={() => void checkCode()}
            disabled={code.trim().length !== 6 || busy}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-sm cursor-pointer"
          >
            {busy ? 'Checking…' : 'Verify'}
          </button>
          <button
            type="button"
            onClick={() => void sendCode()}
            disabled={busy || cooldown > 0}
            className="w-full text-center text-xs text-slate-500 font-bold hover:underline disabled:no-underline disabled:opacity-60 cursor-pointer"
          >
            {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
          </button>
        </>
      )}
      {step === 'password' && (
        <>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">New password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                autoFocus
                type={showPass ? 'text' : 'password'}
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="Min 6 characters"
                className="w-full rounded-xl border border-slate-200 pl-10 pr-10 py-2.5 text-sm bg-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? 'Hide password' : 'Show password'}
                title={showPass ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-rose-500 font-bold">{error}</p>}
          <button
            type="button"
            onClick={() => void savePassword()}
            disabled={newPass.length < 6 || busy}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold text-sm cursor-pointer"
          >
            {busy ? 'Saving…' : 'Save password'}
          </button>
        </>
      )}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="w-full flex items-center justify-center gap-1 text-center text-xs text-slate-500 font-bold hover:underline cursor-pointer"
        >
          <ArrowLeft size={13} /> Back
        </button>
      )}
    </div>
  );
};

export default OtpFlow;
