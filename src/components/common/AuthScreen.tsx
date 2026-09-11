import React, { useState } from 'react';
import { Mail, Lock, ArrowRight, User } from 'lucide-react';
import { authSignUp, authSignIn, authForgotPassword } from '../../utils/supabaseClient';
import { PhoneInput, isValidPhone } from './PhoneInput';
import { Logo } from './Logo';

interface AuthScreenProps {
  onAuth: (profile?: { name: string; phone: string; inviteCode?: string }) => void;
}

export function AuthScreen({ onAuth }: AuthScreenProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [fNewPass, setFNewPass] = useState('');
  const [fMsg, setFMsg] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [fLoading, setFLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required');
      return;
    }
    if (!isLogin) {
      if (!name.trim()) {
        setError('Name is required');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }
      if (phone && !isValidPhone(phone)) {
        setError('Please enter a valid 10-digit mobile number');
        return;
      }
    }
    setLoading(true);
    setError('');
    try {
      if (isLogin) {
        await authSignIn(email.trim(), password);
        onAuth();
      } else {
        await authSignUp(email.trim(), password, name.trim(), phone.trim());
        onAuth({
          name: name.trim(),
          phone: phone.trim(),
          inviteCode: inviteCode.trim().toUpperCase() || undefined,
        });
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setFMsg('');
    setError('');
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (fNewPass.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    setFLoading(true);
    try {
      await authForgotPassword(email.trim(), fNewPass);
      setFNewPass('');
      setEmail('');
      setPassword('');
      setShowForgot(false);
      setIsLogin(true);
      setSuccessMessage('Password reset successful. Please login with your new password.');
    } catch (err: any) {
      setError(err?.message || 'Reset failed');
    } finally {
      setFLoading(false);
    }
  };

  const hasInvite = inviteCode.trim().length >= 4;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4 drop-shadow-lg">
            <Logo size={64} />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">WanderSync</h1>
          <p className="text-sm text-slate-500 mt-1">Trip finance, simplified</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100 space-y-4">
          {showForgot ? (
            <div className="space-y-3 rounded-2xl bg-slate-50 border border-slate-200 p-3">
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
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    value={fNewPass}
                    onChange={(e) => setFNewPass(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-2.5 text-sm bg-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>
              {fMsg && (
                <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">{fMsg}</p>
              )}
              <button
                type="button"
                onClick={handleForgot}
                disabled={fLoading}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-sm cursor-pointer"
              >
                {fLoading ? 'Resetting…' : 'Reset Password'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForgot(false); setError(''); setFMsg(''); setSuccessMessage(''); }}
                className="w-full text-center text-xs text-slate-500 font-bold hover:underline cursor-pointer"
              >
                Back to login
              </button>
            </div>
          ) : (
            <>
              {/* Name - signup only */}
              {!isLogin && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Your name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="What should we call you?"
                      className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                </div>
              )}

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              {/* Phone - signup only */}
              {!isLogin && (
                <PhoneInput label="Mobile number" value={phone} onChange={setPhone} />
              )}

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className="w-full rounded-xl border border-slate-200 pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
              </div>

              {/* Forgot password (login only) */}
              {isLogin && (
                <button
                  type="button"
                  onClick={() => { setShowForgot(true); setError(''); setFMsg(''); }}
                  className="w-full text-center text-xs text-indigo-600 font-bold hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              )}

              {/* Invite code - signup only */}
              {!isLogin && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Invite code
                  </label>
                  <input
                    value={inviteCode}
                    onChange={(e) => {
                      setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
                      setError('');
                    }}
                    placeholder="e.g. GOA4X8"
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-center text-lg font-extrabold tracking-[0.3em] focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 placeholder-slate-300 placeholder:tracking-normal placeholder:text-sm placeholder:font-medium"
                  />
                </div>
              )}

              {successMessage && (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 font-medium">{successMessage}</p>
              )}

              {error && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                {loading ? (
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <>
                    {isLogin ? 'Login' : (hasInvite ? 'Sign Up & Join Trip' : 'Sign Up')}
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <p className="text-center text-xs text-slate-500">
                {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
                <button
                  type="button"
                  onClick={() => { setIsLogin(!isLogin); setShowForgot(false); setError(''); setSuccessMessage(''); }}
                  className="text-indigo-600 font-bold hover:underline"
                >
                  {isLogin ? 'Sign Up' : 'Login'}
                </button>
              </p>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
