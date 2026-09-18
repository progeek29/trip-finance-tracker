import React, { useState } from 'react';
import { googleClientId, authSignInWithGoogle } from '../../utils/supabaseClient';

interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (opts: { client_id: string; callback: (resp: { credential?: string }) => void }) => void;
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
}

/** Continue with Google — ALWAYS visible (sexy G, app-rounded). Without a
 *  configured Client ID it explains instead of silently vanishing. */
export const GoogleButton: React.FC<GoogleButtonProps> = ({ onSuccess, onError }) => {
  const [busy, setBusy] = useState(false);

  const handleClick = () => {
    const clientId = googleClientId();
    if (!clientId) {
      onError('Google sign-in is setting up — continue with email for now.');
      return;
    }
    if (busy) return;
    setBusy(true);
    loadGis()
      .then(() => {
        if (!window.google) throw new Error('Google failed to load.');
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp) => {
            if (!resp?.credential) {
              setBusy(false);
              onError('Google sign-in was cancelled.');
              return;
            }
            authSignInWithGoogle(resp.credential)
              .then(() => onSuccess())
              .catch((e) => onError(e instanceof Error ? e.message : 'Google sign-in failed.'))
              .finally(() => setBusy(false));
          },
        });
        window.google.accounts.id.prompt();
        // One Tap may stay silent (dismissed/cooldown) — release the button.
        window.setTimeout(() => setBusy(false), 8000);
      })
      .catch(() => {
        setBusy(false);
        onError('Google failed to load. Check internet and retry.');
      });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="w-full h-12 rounded-xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-md disabled:opacity-60 flex items-center justify-center gap-3 transition-all cursor-pointer"
    >
      <GoogleG />
      <span className="text-sm font-bold text-slate-800">
        {busy ? 'Connecting…' : 'Continue with Google'}
      </span>
    </button>
  );
};

export default GoogleButton;
