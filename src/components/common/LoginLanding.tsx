import React, { useEffect, useRef, useState } from 'react';
import { LogIn, Megaphone, MoreVertical, X, Zap, ChevronRight } from 'lucide-react';
import { AuthForm, useAuthForm } from './AuthScreen';
import { PhoneGate } from './PhoneGate';
import { MediaImg } from './MediaImg';
import { fetchBlogs, type BlogPost } from '../../utils/blogs';
import { authGetUser } from '../../utils/supabaseClient';
import { Logo } from './Logo';

interface LoginLandingProps {
  onAuth: (profile?: { name: string; phone: string; cardNo?: string; inviteCode?: string }) => void;
  onOpenBlog?: (id: string) => void;
}

/** Admin-picked stories strip (public). Tap opens the full story, view-only. */
function FeaturedStrip({ onOpenBlog }: { onOpenBlog?: (id: string) => void }) {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  useEffect(() => {
    let live = true;
    fetchBlogs({ featured: true, limit: 6 }).then((rows) => {
      if (live) setPosts(rows);
    });
    return () => {
      live = false;
    };
  }, []);
  if (posts.length === 0) return null;
  return (
    <section className="border-t border-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-8 lg:py-12">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 font-display tracking-tight mb-6">
          Featured travel stories
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {posts.map((p) => (
            <button
              key={p.id}
              onClick={() => onOpenBlog?.(p.id)}
              className="text-left bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm hover:shadow-md active:scale-[0.99] transition-all cursor-pointer"
            >
              {p.coverUrl ? (
                <MediaImg srcRef={p.coverUrl} alt={p.title} className="w-full h-40 object-cover bg-slate-100" />
              ) : null}
              <span className="flex items-center gap-2 p-5">
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold text-slate-900 font-display leading-snug">{p.title}</span>
                  <span className="block text-[13px] text-slate-500 leading-relaxed mt-1.5 line-clamp-2">{p.excerpt}</span>
                  <span className="block text-[11px] text-slate-400 font-bold mt-2">
                    {p.authorName} · {p.views} reads
                  </span>
                </span>
                <ChevronRight size={18} className="text-slate-300 flex-shrink-0" />
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Public landing + login — hero split, real auth form, featured stories, insights. */
export function LoginLanding({ onAuth, onOpenBlog }: LoginLandingProps) {
  const auth = useAuthForm(onAuth);
  const [barVisible, setBarVisible] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [justGoogled, setJustGoogled] = useState(false);
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

  // Post-Google phone gate (Skip allowed) before entering the app.
  // Phone gate shows ONCE: only when the DB phone is empty AND the user
  // hasn't skipped in the last 30 days. Saved phone → straight inside.
  const SKIP_KEY = 'ws_phone_gate_skip_v1';
  const skippedRecently = (): boolean => {
    try {
      const t = Number(localStorage.getItem(SKIP_KEY) || 0);
      return Date.now() - t < 30 * 24 * 3600 * 1000;
    } catch {
      return false;
    }
  };
  const handleGoogleSuccess = () => {
    void (async () => {
      try {
        const u = await authGetUser();
        if ((u?.phone || '').trim() || skippedRecently()) {
          onAuth();
          return;
        }
      } catch { /* fall through to gate */ }
      setJustGoogled(true);
    })();
  };
  if (justGoogled) {
    return (
      <PhoneGate
        onDone={() => {
          setJustGoogled(false);
          onAuth();
        }}
        onSkip={() => {
          try {
            localStorage.setItem(SKIP_KEY, String(Date.now()));
          } catch { /* private mode */ }
          setJustGoogled(false);
          onAuth();
        }}
      />
    );
  }

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
          <div className="flex flex-wrap gap-2 mt-5">
            {['Trip tracking', 'Smart splits', 'Squad chat', 'Works offline'].map((t) => (
              <span
                key={t}
                className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-[11px] font-bold text-slate-600 shadow-sm"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        <div ref={formRef} style={{ scrollMarginTop: 80 }}>
          <div className="mb-5">
            <h3 className="text-xl font-bold text-slate-900 font-display">Welcome</h3>
            <p className="text-[13px] text-slate-500 mt-0.5">Sync your plans and memories.</p>
          </div>
          <AuthForm
            {...auth}
            googleAuth={{
              onSuccess: handleGoogleSuccess,
              onError: (msg) => showToast(msg),
              oneTap: true,
            }}
            onVerifiedSignup={(profile) => onAuth(profile)}
          />
        </div>
      </main>

      {/* Featured stories (admin-picked blogs — public, view-only) */}
      <FeaturedStrip onOpenBlog={onOpenBlog} />

      {/* Coming-soon toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-slate-900 text-white text-xs font-bold px-5 py-2.5 rounded-full shadow-xl whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  );
}
