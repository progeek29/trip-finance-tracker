import React, { useState } from 'react';
import { Mail, Lock, ArrowRight, User } from 'lucide-react';
import { authSignUp, authSignIn, authForgotPassword, requestOtp } from '../../utils/supabaseClient';
import { PhoneInput, isValidPhone } from './PhoneInput';
import { GoogleButton } from './GoogleButton';
import { OtpFlow } from './OtpFlow';
import { Logo } from './Logo';

interface AuthScreenProps {
  onAuth: (profile?: { name: string; phone: string; cardNo?: string; inviteCode?: string }) => void;
}

export function AuthScreen({ onAuth }: AuthScreenProps) {
  const auth = useAuthForm(onAuth);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4 drop-shadow-lg">
            <Logo size={64} />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 font-display">WanderSync</h1>
          <p className="text-sm text-slate-500 mt-1">Trip finance, simplified</p>
        </div>

        <AuthForm {...auth} />
      </div>
    </div>
  );
}

/** Shared login/signup/forgot state + logic for AuthScreen and LoginLanding. */
export function useAuthForm(onAuth: AuthScreenProps['onAuth']): AuthFormProps {
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
  // Post-signup email verify (OTP): profile waits here until code passes.
  // Persisted so a refresh mid-flow returns to THIS screen, never the app.
  type PendingProfile = { name: string; phone: string; cardNo?: string; inviteCode?: string };
  const PENDING_KEY = 'ws_pending_verify_v1';
  const loadPending = (): { email: string; profile: PendingProfile } | null => {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (p && typeof p.email === 'string' && p.email.includes('@')) {
        const pr = p.profile && typeof p.profile === 'object' ? p.profile : {};
        return {
          email: p.email,
          profile: {
            name: String(pr.name || ''),
            phone: String(pr.phone || ''),
            ...(pr.cardNo ? { cardNo: String(pr.cardNo) } : {}),
            ...(pr.inviteCode ? { inviteCode: String(pr.inviteCode) } : {}),
          },
        };
      }
    } catch { /* corrupt → start clean */ }
    return null;
  };
  const [verifyEmail, setVerifyEmailState] = useState<string | null>(() => loadPending()?.email || null);
  const [pendingProfile, setPendingProfileState] = useState<PendingProfile | null>(() => loadPending()?.profile || null);
  const beginVerification = (vEmail: string, vProfile: PendingProfile) => {
    setVerifyEmailState(vEmail);
    setPendingProfileState(vProfile);
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify({ email: vEmail, profile: vProfile }));
    } catch { /* private mode — gate lasts this tab */ }
  };
  const clearVerification = () => {
    setVerifyEmailState(null);
    setPendingProfileState(null);
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch { /* ignore */ }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address');
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
        try {
          await authSignIn(email.trim(), password);
        } catch (err: any) {
          // Correct password but email never verified → park on the code
          // screen instead of entering (no backdoor login).
          if (/NEEDS_VERIFICATION/.test(err?.message || '')) {
            try {
              await requestOtp(email.trim(), 'verify');
            } catch {
              // Mail hiccup: still gate on code (resend inside the flow).
            }
            beginVerification(email.trim(), { name: '', phone: '' });
            setError('');
            return;
          }
          throw err;
        }
        onAuth();
      } else {
        const { mintCardNo, cardSeed } = await import('../../utils/cards');
        const cardNo = mintCardNo(cardSeed(email.trim(), phone.trim()));
        await authSignUp(email.trim(), password, name.trim(), phone.trim(), cardNo);
        // Email OTP verify first (Google users skip this entirely) — then enter.
        try {
          await requestOtp(email.trim(), 'verify');
        } catch {
          // Mail hiccup: still gate on code (resend inside the flow).
        }
        beginVerification(email.trim(), {
          name: name.trim(),
          phone: phone.trim(),
          cardNo,
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

  return {
    isLogin, setIsLogin, name, setName, email, setEmail, phone, setPhone,
    password, setPassword, inviteCode, setInviteCode, loading, error, setError,
    showForgot, setShowForgot, fNewPass, setFNewPass, fMsg, setFMsg,
    successMessage, setSuccessMessage, fLoading, hasInvite,
    verifyEmail, setVerifyEmail: (v) => { if (v) setVerifyEmailState(v); else clearVerification(); },
    pendingProfile, clearVerification,
    onSubmit: handleSubmit, onForgot: handleForgot,
  };
}

interface AuthFormProps {
  isLogin: boolean;
  setIsLogin: (v: boolean) => void;
  name: string;
  setName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  inviteCode: string;
  setInviteCode: (v: string) => void;
  loading: boolean;
  error: string;
  setError: (v: string) => void;
  showForgot: boolean;
  setShowForgot: (v: boolean) => void;
  fNewPass: string;
  setFNewPass: (v: string) => void;
  fMsg: string;
  setFMsg: (v: string) => void;
  successMessage: string;
  setSuccessMessage: (v: string) => void;
  fLoading: boolean;
  hasInvite: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onForgot: (e: React.FormEvent) => void;
  googleAuth?: { onSuccess: () => void; onError: (msg: string) => void; oneTap?: boolean };
  verifyEmail: string | null;
  setVerifyEmail: (v: string | null) => void;
  pendingProfile: { name: string; phone: string; cardNo?: string; inviteCode?: string } | null;
  clearVerification: () => void;
  onVerifiedSignup?: (profile: { name: string; phone: string; cardNo?: string; inviteCode?: string }) => void;
}

/** The real login/signup/forgot form — shared by AuthScreen and LoginLanding. */
export function AuthForm(props: AuthFormProps) {
  const {
    isLogin, setIsLogin, name, setName, email, setEmail, phone, setPhone,
    password, setPassword, inviteCode, setInviteCode, loading, error, setError,
    showForgot, setShowForgot, fNewPass, setFNewPass, fMsg, setFMsg, successMessage,
    setSuccessMessage, fLoading, hasInvite,     onSubmit, onForgot, googleAuth,
    verifyEmail, pendingProfile, onVerifiedSignup, clearVerification,
  } = props;
  // Post-signup gate: verify email over OTP before entering the app.
  if (verifyEmail && pendingProfile && onVerifiedSignup) {
    return (
      <div className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100 space-y-4">
        <div>
          <h3 className="text-base font-extrabold text-slate-900">Verify your email</h3>
          <p className="text-[11px] text-slate-500 font-medium mt-0.5">
            One code stands between you and WanderSync.
          </p>
        </div>
        <OtpFlow
          purpose="verify"
          initialEmail={verifyEmail}
          onDone={() => {
            clearVerification();
            onVerifiedSignup(pendingProfile);
          }}
          onBack={() => {
            // Wrong email? Back to the form (entries preserved) — sign up
            // again with the right address. The unverified account left
            // behind can never log in, so nothing leaks.
            clearVerification();
          }}
        />
        <ContactUs />
      </div>
    );
  }
  return (
        <form onSubmit={onSubmit} className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100 space-y-4">
          {!showForgot && googleAuth && (
            <>
              <GoogleButton onSuccess={googleAuth.onSuccess} onError={googleAuth.onError} oneTap={googleAuth.oneTap} />
              <div className="flex items-center gap-3">
                <span className="flex-1 h-px bg-slate-200" />
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  or continue with email
                </span>
                <span className="flex-1 h-px bg-slate-200" />
              </div>
            </>
          )}
          {showForgot ? (
            <OtpFlow
              purpose="reset"
              initialEmail={email}
              onDone={() => {
                setShowForgot(false);
                setIsLogin(true);
                setSuccessMessage('Password reset successful. Please login with your new password.');
              }}
              onBack={() => { setShowForgot(false); setError(''); setFMsg(''); setSuccessMessage(''); }}
            />
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
                    Invite code <span className="font-medium text-slate-400">(optional)</span>
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

              <ContactUs />
            </>
          )}
        </form>
  );
}

/** Support line on every auth card — users facing issues can reach out. */
function ContactUs() {
  return (
    <p className="text-center text-[11px] text-slate-400 font-medium">
      Facing issues? Contact us —{' '}
      <a href="mailto:thewandersync@gmail.com" className="text-indigo-600 font-bold hover:underline">
        thewandersync@gmail.com
      </a>
    </p>
  );
}
