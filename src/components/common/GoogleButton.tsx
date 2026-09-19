import React, { useEffect, useRef, useState } from 'react';
import { googleClientId, authSignInWithGoogle } from '../../utils/supabaseClient';

interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (opts: { client_id: string; callback: (resp: { credential?: string }) => void; use_fedcm_for_prompt?: boolean; use_fedcm_for_button?: boolean; auto_select?: boolean }) => void;
      renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
      prompt: () => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error('Google script failed to load'));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

function GoogleG() {
  return (
    <svg width="19" height="19" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  );
}

interface GoogleButtonProps {
  onSuccess: () => void;
  onError: (msg: string) => void;
  /** Fire One Tap on mount (auto prompt for logged-in Google sessions).
   *  Silent when no session — the popup button stays as fallback. */
  oneTap?: boolean;
}

/** Continue with Google — official GIS popup button (works with or without a
 *  prior Google session: no session → Google asks to log in first, then
 *  returns). Falls back to an identical-looking button that explains setup
 *  when no Client ID is configured yet. */
export const GoogleButton: React.FC<GoogleButtonProps> = ({ onSuccess, onError, oneTap }) => {
  const clientId = googleClientId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [fullWidth, setFullWidth] = useState(300);
  const [gisReady, setGisReady] = useState(false);
  const promptedRef = useRef(false);
  const cbRef = useRef({ onSuccess, onError });
  cbRef.current = { onSuccess, onError };

  // Measure the card width so the official button fills it edge-to-edge.
  useEffect(() => {
    const measure = () => {
      const w = wrapRef.current?.offsetWidth || 300;
      setFullWidth(Math.max(200, Math.min(400, Math.floor(w))));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Init ONCE per clientId (re-init mid-click drops callbacks — the flaky logins).
  useEffect(() => {
    if (!clientId) return;
    let live = true;
    loadGis()
      .then(() => {
        if (!live || !window.google) return;
        setGisReady(true);
        window.google.accounts.id.initialize({
          client_id: clientId,
          use_fedcm_for_prompt: true,
          use_fedcm_for_button: true,
          // Returning user + single Google session = instant login, zero clicks.
          // Multi-account → Google shows its chooser (their UI, not ours).
          auto_select: true,
          callback: (resp) => {
            if (!resp?.credential) {
              cbRef.current.onError('Google sign-in was cancelled.');
              return;
            }
            setBusy(true);
            // Safety net: hanging network must NEVER stuck the UI.
            const timeout = window.setTimeout(() => {
              if (live) {
                setBusy(false);
                cbRef.current.onError('Taking too long — check internet and retry.');
              }
            }, 25000);
            authSignInWithGoogle(resp.credential)
              .then(() => {
                window.clearTimeout(timeout);
                if (live) cbRef.current.onSuccess();
              })
              .catch((e) => {
                window.clearTimeout(timeout);
                if (live) cbRef.current.onError(e instanceof Error ? e.message : 'Google sign-in failed. Tap again to retry.');
              })
              .finally(() => {
                if (live) setBusy(false);
              });
          },
        });
        // One Tap: auto prompt for logged-in sessions (silent otherwise).
        if (oneTap && !promptedRef.current) {
          promptedRef.current = true;
          try {
            window.google.accounts.id.prompt();
          } catch { /* cooldown/dismissed — button fallback stays */ }
        }
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [clientId, oneTap]);

  // Button render follows width only (never re-initializes GIS).
  useEffect(() => {
    if (!clientId || !gisReady || !window.google?.accounts?.id || !btnRef.current) return;
    btnRef.current.innerHTML = '';
    try {
      window.google.accounts.id.renderButton(btnRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: fullWidth,
      });
    } catch { /* next width tick retries */ }
  }, [clientId, fullWidth, gisReady]);

  // No Client ID yet (or script blocked): same look, explains on tap.
  if (!clientId || failed) {
    return (
      <button
        type="button"
        onClick={() => onError('Google sign-in is setting up — continue with email for now.')}
        className="w-full h-12 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-md flex items-center justify-center gap-3 transition-all cursor-pointer"
      >
        <GoogleG />
        <span className="text-sm font-bold text-slate-800">Continue with Google</span>
      </button>
    );
  }
  return (
    <div ref={wrapRef} className="w-full">
      <div ref={btnRef} className={`w-full flex justify-center ${busy ? 'opacity-60 pointer-events-none' : ''}`} />
    </div>
  );
};

export default GoogleButton;
