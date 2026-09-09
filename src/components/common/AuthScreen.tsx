import React, { useState } from 'react';
import { Plane, Mail, Lock, ArrowRight, User } from 'lucide-react';
import { authSignUp, authSignIn } from '../../utils/supabaseClient';
import { PhoneInput, isValidPhone } from './PhoneInput';

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

  const hasInvite = inviteCode.trim().length >= 4;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-pink-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-600/30">
            <Plane className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">WanderSync</h1>
          <p className="text-sm text-slate-500 mt-1">Trip finance, simplified</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100 space-y-4">
          <h2 className="text-lg font-bold text-slate-900 text-center">
            {isLogin ? 'Welcome back' : 'Create your account'}
          </h2>

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

          {/* Invite code - signup only */}
          {!isLogin && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Invite code <span className="text-slate-400 font-medium">(if a friend shared one)</span>
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
              onClick={() => { setIsLogin(!isLogin); setError(''); }}
              className="text-indigo-600 font-bold hover:underline"
            >
              {isLogin ? 'Sign Up' : 'Login'}
            </button>
          </p>

          {isLogin && (
            <div className="text-[11px] text-slate-400 text-center space-y-1">
              <p>Same email + password on all devices = same data</p>
              <p className="text-indigo-500 font-medium">Admin: admin@wandersync.com</p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
