import React, { useEffect, useRef, useState } from 'react';
import { LogIn, Megaphone, MoreVertical, X, Zap } from 'lucide-react';
import { AuthForm, useAuthForm } from './AuthScreen';
import { Logo } from './Logo';

interface LoginLandingProps {
  onAuth: (profile?: { name: string; phone: string; cardNo?: string; inviteCode?: string }) => void;
}

const BLOG_POSTS = [
  {
    meta: 'BY LEAD EXPLORER • SEP 12, 2026',
    title: 'How Group Budgets Open Doors to Uncharted Paths',
    body: "Managing travel finance collectively isn't about cutting pennies; it's about shifting resources seamlessly to secure hidden stays and remote high-rise views without friction.",
  },
  {
    meta: 'FINTECH SYNC • AUG 28, 2026',
    title: 'Behind the WS Financial Protocol Matrix',
    body: 'A closer look at how WanderSync creates a highly reliable, locked 16-digit member token to secure shared global ledgers and minimize multi-currency travel balance gaps.',
  },
  {
    meta: 'GEOGRAPHIC ROADS • AUG 14, 2026',
    title: 'Packing Light, Syncing Smart: The 2026 Checklist',
    body: 'From the rugged horizons of the Himalayas to bustling hyper-modern city cores, learn to configure decentralized shared trip vaults before your team steps onto the runway.',
  },
];

/** Public landing + login — hero split, real auth form, insights feed. */
export function LoginLanding({ onAuth }: LoginLandingProps) {
  const auth = useAuthForm(onAuth);
  const [barVisible, setBarVisible] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    const onScroll = () => {
      const show = window.scrollY > 240;
      setBarVisible(show);
      if (!show) setMenuOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('mousedown', onDown);
    };
  }, []);

  const showToast = (text: string) => {
    setToast(text);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  };

  const scrollToLogin = () => {
    setMenuOpen(false);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Sticky bar — appears on scroll */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/80 transition-transform duration-300 ${
          barVisible ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={28} />
            <span className="font-extrabold text-slate-900 text-base font-display tracking-tight">WanderSync</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { auth.setIsLogin(true); scrollToLogin(); }}
              className="px-3.5 py-2 rounded-xl text-indigo-600 text-xs font-bold hover:bg-indigo-50 transition-colors cursor-pointer"
            >
              Login
            </button>
            <button
              onClick={() => { auth.setIsLogin(false); scrollToLogin(); }}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
            >
              Sign Up
            </button>
            <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menu"
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
            >
              {menuOpen ? <X size={18} /> : <MoreVertical size={18} />}
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-11 w-60 bg-white border border-slate-200 rounded-2xl p-1.5 shadow-xl">
                <button
                  onClick={scrollToLogin}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-semibold text-slate-700 rounded-xl hover:bg-slate-100 hover:text-indigo-600 transition-colors cursor-pointer"
                >
                  <LogIn size={15} className="text-slate-400" />
                  Log In / Sign Up
                </button>
                <button
                  onClick={() => { setMenuOpen(false); showToast('Advertising on WanderSync — coming soon'); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-semibold text-slate-700 rounded-xl hover:bg-slate-100 hover:text-indigo-600 transition-colors cursor-pointer"
                >
                  <Megaphone size={15} className="text-slate-400" />
                  Advertise on WanderSync
                </button>
                <button
                  onClick={() => { setMenuOpen(false); showToast('WanderSync Pro — coming soon'); }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-semibold text-slate-700 rounded-xl hover:bg-slate-100 hover:text-indigo-600 transition-colors cursor-pointer"
                >
                  <Zap size={15} className="text-slate-400" />
                  Try WanderSync Pro
                  <span className="ml-auto text-[9px] font-extrabold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-md px-1.5 py-0.5">BETA</span>
                </button>
              </div>
            )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero split */}
      <main className="max-w-6xl mx-auto px-4 pt-8 lg:pt-10 pb-6 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-start">
        <div className="flex flex-col pt-2 lg:pt-0">
          <div className="flex items-center gap-3.5 mb-5">
            <Logo size={48} />
            <h1 className="text-[32px] font-extrabold text-slate-900 font-display tracking-tight">WanderSync</h1>
          </div>
          <h2 className="text-3xl sm:text-[42px] font-bold text-slate-900 font-display leading-tight tracking-tight mb-4">
            Explore the things you love. <span className="text-indigo-600">Sync your plans.</span>
          </h2>
          <p className="text-[15px] text-slate-500 leading-relaxed">
            WanderSync was built to bridge the gap between global exploration and group financial clarity.
            Stop calculating splits over messy messaging threads. Coordinate bookings, track collective
            expense balances, and secure your destination paths — all inside one unified, premium
            explorer network dashboard.
          </p>
        </div>

        <div ref={formRef} style={{ scrollMarginTop: 80 }}>
          <div className="mb-5">
            <h3 className="text-xl font-bold text-slate-900 font-display">Welcome</h3>
            <p className="text-[13px] text-slate-500 mt-0.5">Sync your plans and memories.</p>
          </div>
          <AuthForm {...auth} />
        </div>
      </main>

      {/* Insights feed */}
      <section className="border-t border-slate-100">
        <div className="max-w-6xl mx-auto px-4 py-8 lg:py-12">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 font-display tracking-tight mb-6">
            Latest Expeditions &amp; Insights
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {BLOG_POSTS.map((p) => (
              <article key={p.title} className="bg-white border border-slate-200 rounded-3xl p-6 flex flex-col shadow-sm">
                <p className="text-[9px] font-bold text-slate-400 tracking-[0.12em] mb-3">{p.meta}</p>
                <h3 className="text-base font-bold text-slate-900 font-display leading-snug mb-2.5">{p.title}</h3>
                <p className="text-[13px] text-slate-500 leading-relaxed">{p.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Coming-soon toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-slate-900 text-white text-xs font-bold px-5 py-2.5 rounded-full shadow-xl whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  );
}
