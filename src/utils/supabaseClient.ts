import { claimDataOwner } from './storage';

function apiHost(): string {
  try {
    // Production override (Vercel): VITE_API_URL=https://<backend>/api
    const env = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL;
    if (env) return env.replace(/\/api\/?$/, '');
  } catch { /* ignore */ }
  try {
    const h = typeof window !== 'undefined' ? window.location.hostname : '';
    // Never talk to the FRONTEND host on port 3001 (a Vercel build without
    // VITE_API_URL did exactly that and broke all logins). Prod backend is
    // fixed infrastructure (see RUNBOOK): use it unless developing locally.
    if (h && h !== 'localhost' && h !== '127.0.0.1') return 'https://wandersync-app.duckdns.org';
  } catch { /* SSR */ }
  return 'http://localhost:3001';
}

const API = `${apiHost()}/api`;

/** Public API root for non-table endpoints (voice clips, health). */
export function apiBaseUrl(): string {
  return API;
}
/** Server root (no /api) — sent with clip uploads so offline phones can download. */
export function apiHostRoot(): string {
  return apiHost();
}

async function api(path: string, opts: RequestInit = {}) {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem(tokenKey) : null;
  const res = await fetch(`${API}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers as any,
    },
    ...opts,
  });
  return res.json();
}

const tokenKey = 'wandersync_token';

function getToken(): string | null {
  return localStorage.getItem(tokenKey);
}
function setToken(t: string) {
  localStorage.setItem(tokenKey, t);
}
function clearToken() {
  localStorage.removeItem(tokenKey);
}

let cachedUid: string | null = null;
let cachedIsAdmin: boolean = false;

const ADMIN_EMAIL = 'admin@wandersync.com';

export async function ensureCloudUser(): Promise<{ uid: string }> {
  if (cachedUid) {
    claimDataOwner(cachedUid);
    return { uid: cachedUid };
  }
  const token = getToken();
  if (!token) throw new Error('NOT_LOGGED_IN');
  let data: { user?: { id: string; email?: string } } | null;
  try {
    ({ data } = await api('/auth/user', { headers: { Authorization: `Bearer ${token}` } }));
  } catch {
    // Offline/backend hiccup: keep the token (mystery-logout fix) — caller retries.
    throw new Error('OFFLINE');
  }
  if (data?.user) {
    cachedUid = data.user.id;
    cachedIsAdmin = data.user.email === ADMIN_EMAIL;
    claimDataOwner(data.user.id);
    return { uid: data.user.id };
  }
  clearToken();
  throw new Error('NOT_LOGGED_IN');
}

export function isAdminUser(): boolean {
  return cachedIsAdmin;
}

export async function authSignUp(email: string, password: string, name: string, phone: string, cardNo?: string, gender?: string): Promise<{ uid: string; isAdmin: boolean; needsVerification: boolean }> {
  const { data, error } = await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, name, phone, cardNo, gender }),
  });
  if (error) throw new Error(error);
  // No session is minted at signup (server returns none) — the token arrives
  // only after the email OTP passes, so a refresh can never skip verification.
  cachedUid = data.user.id;
  cachedIsAdmin = email === ADMIN_EMAIL;
  return { uid: data.user.id, isAdmin: cachedIsAdmin, needsVerification: !!data.needsVerification };
}

/** Google sign-on: server verifies the GIS ID token, finds-or-creates the
 *  user (username/cardNo minted, no password ever), returns our session. */
export async function authSignInWithGoogle(idToken: string): Promise<{ uid: string; isAdmin: boolean }> {
  const { data, error } = await api('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  });
  if (error) throw new Error(error);
  setToken(data.token);
  cachedUid = data.user.id;
  cachedIsAdmin = data.user.email === ADMIN_EMAIL;
  return { uid: data.user.id, isAdmin: cachedIsAdmin };
}

export function googleClientId(): string {
  try {
    return (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GOOGLE_CLIENT_ID || '';
  } catch {
    return '';
  }
}

/** OAuth landing registered in Google Cloud Console (redirect URIs).
 *  The Android app uses the SYSTEM browser + this endpoint + custom-scheme
 *  return — the WebView popup flow cannot complete inside the app. */
export const GOOGLE_REDIRECT_URI = 'https://wandersync-app.duckdns.org/api/auth/google/callback';
export const GOOGLE_APP_SCHEME = 'com.wandersync.tripapp://auth';

/** Standard OAuth2 authorize URL (public params only — the secret never
 *  leaves the server, which exchanges the code). */
export function googleOAuthStartUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: googleClientId(),
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

/** Does the server hold a client SECRET for the Android browser flow? */
export async function googleNativeConfigured(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/auth/google/config`);
    const body = await res.json().catch(() => null);
    return !!body?.data?.configured;
  } catch {
    return true; // offline/unknown — fail open, the attempt errors loudly
  }
}

/** App exchanges its one-time deep-link code for a real session. */
export async function authSignInWithGoogleCode(code: string): Promise<{ uid: string; isAdmin: boolean }> {
  const { data, error } = await api('/auth/google-code', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  if (error) throw new Error(error);
  setToken(data.token);
  cachedUid = data.user.id;
  cachedIsAdmin = data.user.email === ADMIN_EMAIL;
  return { uid: data.user.id, isAdmin: cachedIsAdmin };
}

export async function authSignIn(email: string, password: string): Promise<{ uid: string; isAdmin: boolean }> {
  const { data, error } = await api('/auth/signin', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (error) throw new Error(error);
  setToken(data.token);
  cachedUid = data.user.id;
  cachedIsAdmin = email === ADMIN_EMAIL;
  return { uid: data.user.id, isAdmin: cachedIsAdmin };
}

export async function authUpdateProfile(patch: { name: string; phone: string; cardNo?: string; gender?: string }): Promise<{ name: string; phone: string; cardNo: string; username: string; gender: string }> {
  const { data, error } = await api('/auth/profile', {
    method: 'POST',
    body: JSON.stringify(patch),
  });
  if (error) throw new Error(error);
  return data.user;
}

/** Email OTP (Brevo): verify + password reset/set for password users.
 *  Google users never need it (verified by Google). Responses stay generic. */
export async function requestOtp(email: string, purpose: 'verify' | 'reset'): Promise<void> {
  const { error } = await api('/otp/request', {
    method: 'POST',
    body: JSON.stringify({ email: String(email || '').trim(), purpose }),
  });
  if (error) throw new Error(error);
}

export async function verifyOtp(
  email: string,
  purpose: 'verify' | 'reset',
  code: string
): Promise<{ verified?: boolean; resetToken?: string; token?: string; user?: { id: string; email: string } }> {
  const { data, error } = await api('/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ email: String(email || '').trim(), purpose, code: code.trim() }),
  });
  if (error) throw new Error(error);
  // Signup-verify mints the session here (signup itself minted none).
  if (data?.token) {
    setToken(data.token);
    if (data?.user?.id) cachedUid = data.user.id;
  }
  return data || {};
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
  const { error } = await api('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
  if (error) throw new Error(error);
}

export async function authForgotPassword(email: string, newPassword: string): Promise<void> {
  const { error } = await api('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({
      email: String(email || '').trim(),
      newPassword,
      password: newPassword,
    }),
  });
  if (error) throw new Error(error);
}

async function currentAdminId(): Promise<string> {
  if (cachedUid) return cachedUid;
  const u = await authGetUser();
  if (!u) throw new Error('NOT_LOGGED_IN');
  return u.uid;
}

export async function authSignOut(): Promise<void> {
  clearToken();
  cachedUid = null;
  cachedIsAdmin = false;
  // No cross-account bleed: drop every cached trip/expense/photo on logout.
  try {
    const { clearAllLocalData } = await import('./storage');
    clearAllLocalData();
  } catch { /* already gone */ }
}

/** Logout everywhere: revoke ALL server sessions (every device/tab/browser),
 *  then wipe local. Server failure still clears local (never trap the user). */
export async function authSignOutAll(): Promise<void> {
  try {
    await api('/auth/logout-all', { method: 'POST' });
  } catch { /* session already dead — local wipe is what matters */ }
  await authSignOut();
}

export async function authGetUser(): Promise<{ uid: string; email: string; isAdmin: boolean; name: string; phone: string; role: string; cardNo: string; username: string; gender: string; emailVerified: boolean } | null> {
  const token = getToken();
  if (!token) return null;
  const { data } = await api('/auth/user', { headers: { Authorization: `Bearer ${token}` } });
  if (!data?.user) return null;
  cachedUid = data.user.id;
  cachedIsAdmin = data.user.email === ADMIN_EMAIL || data.user.role === 'admin';
  return {
    uid: data.user.id,
    email: data.user.email || '',
    isAdmin: cachedIsAdmin,
    name: data.user.name || '',
    phone: data.user.phone || '',
    role: data.user.role || 'user',
    cardNo: data.user.cardNo || '',
    username: data.user.username || '',
    gender: data.user.gender || 'unspecified',
    emailVerified: data.user.emailVerified !== false,
  };
}

// ─── Generic Supabase-like client ──────────────────────────

function buildQuery(table: string, filters: Record<string, string>, opts?: { single?: boolean; order?: string; ascending?: boolean }) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) params.set(k, v);
  if (opts?.single) params.set('single', 'true');
  if (opts?.order) params.set('order', opts.order);
  if (opts?.ascending === false) params.set('ascending', 'false');
  const qs = params.toString();
  return `/${table}${qs ? '?' + qs : ''}`;
}

export const supabase = {
  auth: {
    getUser: async () => {
      const user = await authGetUser();
      return { data: { user: user ? { id: user.uid, email: user.email } : null } };
    },
  },
  from(table: string) {
    return {
      // NOTE: select/update/delete must be SYNC builders so that
      // `.select('*').eq(...).maybeSingle()` chaining works.
      // Only the terminal methods (maybeSingle/single/order/eq-callback) are async.
      select(_cols?: string) {
        const runFiltered = async (filters: Record<string, string>) => {
          const { data, error } = await api(buildQuery(table, filters));
          return { data: Array.isArray(data) ? data : data ? [data] : [], error: error ? { message: error } : null };
        };
        const runSingle = async (filters: Record<string, string>) => {
          const { data, error } = await api(buildQuery(table, filters, { single: true }));
          return { data, error: error ? { message: error } : null };
        };
        return {
          then(resolve: (v: { data: unknown[]; error: null }) => void, reject?: (e: unknown) => void) {
            runFiltered({}).then((r) => resolve({ data: (r.data as unknown[]) || [], error: null })).catch(reject);
          },
          eq(col: string, val: string) {
            const filters = { [col]: val };
            const runOrdered = async (orderCol?: string, ascending = true, limit?: number) => {
              const { data, error } = await api(buildQuery(table, filters, orderCol ? { order: orderCol, ascending } : undefined));
              let rows = Array.isArray(data) ? data : data ? [data] : [];
              if (limit !== undefined) rows = rows.slice(0, limit);
              return { data: rows, error: error ? { message: error } : null };
            };
            return {
              async maybeSingle() {
                return runSingle(filters);
              },
              async single() {
                const { data, error } = await runSingle(filters);
                if (error) throw new Error(typeof error === 'string' ? error : (error as { message?: string }).message || 'Not found');
                return { data };
              },
              // Supabase-style chain: .eq(...).order('createdAt').limit(200)
              order(orderCol: string, opts?: { ascending?: boolean }) {
                const ascending = opts?.ascending !== false;
                return {
                  limit(n: number) {
                    return runOrdered(orderCol, ascending, n);
                  },
                  then(resolve: (v: { data: unknown[]; error: null }) => void, reject?: (e: unknown) => void) {
                    runOrdered(orderCol, ascending).then((r) => resolve({ data: (r.data as unknown[]) || [], error: null })).catch(reject);
                  },
                };
              },
              limit(n: number) {
                return runOrdered(undefined, true, n);
              },
              // Awaited directly as a list: `await ...eq('tripId', id)` → { data: [...] }
              then(resolve: (v: { data: unknown[] }) => void, reject?: (e: unknown) => void) {
                runFiltered(filters).then((r) => resolve({ data: (r.data as unknown[]) || [] })).catch(reject);
              },
              [Symbol.iterator]: async function* () {
                const { data } = await runFiltered(filters);
                const rows = Array.isArray(data) ? data : [];
                for (const row of rows) yield row;
              },
            };
          },
          async order(col: string, opts?: { ascending?: boolean }) {
            const { data, error } = await api(buildQuery(table, {}, { order: col, ascending: opts?.ascending }));
            return { data, error: error ? { message: error } : null };
          },
        };
      },
      async upsert(row: any | any[]) {
        const { data, error } = await api(`/${table}`, { method: 'POST', body: JSON.stringify(row) });
        return { data, error: error ? { message: error } : null };
      },
      async insert(row: any) {
        const { data, error } = await api(`/${table}`, { method: 'POST', body: JSON.stringify(row) });
        return { data, error: error ? { message: error } : null };
      },
      update(updates: Record<string, any>) {
        return {
          async eq(col: string, val: string) {
            const { data, error } = await api(`/${table}`, {
              method: 'PUT',
              body: JSON.stringify({ ...updates, _filters: { [col]: val } }),
            });
            return { data, error: error ? { message: error } : null };
          },
        };
      },
      delete() {
        return {
          async eq(col: string, val: string) {
            const { data, error } = await api(`/${table}?${col}=${encodeURIComponent(val)}`, { method: 'DELETE' });
            return { data, error: error ? { message: error } : null };
          },
        };
      },
    };
  },
  // Stub: Realtime channels not needed for local PostgreSQL
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  channel(_name: string) {
    return {
      on(_event: string, _filter: any, _callback?: (payload: any) => void) { return this; },
      subscribe(_cb?: (status: any) => void) { return this; },
      unsubscribe() {},
      send(_payload: any) {},
    };
  },
  // Stub: Storage not needed for local dev (media stays in IndexedDB)
  storage: {
    from(_bucket: string) {
      return {
        async upload(_path: string, _data: any, _opts?: any) { return { error: null }; },
        getPublicUrl(_path: string) { return { data: { publicUrl: '' } }; },
        async remove(_paths: string[]) { return { error: null }; },
      };
    },
  },
};

// ─── User Management ───────────────────────────────────────

export interface ManagedUser {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: string;
  createdAt: string;
  username?: string;
  gender?: string;
}

export async function getAllUsers(): Promise<ManagedUser[]> {
  const { data } = await api('/users');
  return (data || []) as ManagedUser[];
}

export async function adminCreateUser(email: string, password: string, name: string, phone: string, role: string): Promise<ManagedUser | null> {
  const adminId = await currentAdminId();
  const { data, error } = await api('/admin/create-user', {
    method: 'POST',
    body: JSON.stringify({ adminId, email, password, name, phone, role }),
  });
  if (error) throw new Error(error);
  return data?.[0] as ManagedUser || null;
}

export async function adminUpdateUser(id: string, updates: Partial<Pick<ManagedUser, 'name' | 'phone' | 'role' | 'email'>>): Promise<boolean> {
  const { error } = await api('/users', {
    method: 'PUT',
    body: JSON.stringify({ ...updates, _filters: { id } }),
  });
  return !error;
}

export async function adminResetPassword(userId: string, newPassword: string): Promise<void> {
  const adminId = await currentAdminId();
  const { error } = await api('/admin/reset-password', {
    method: 'POST',
    body: JSON.stringify({ adminId, userId, newPassword }),
  });
  if (error) throw new Error(error);
}

export async function adminDeleteUser(uid: string): Promise<void> {
  const adminId = await currentAdminId();
  const { error } = await api('/admin/delete-user', {
    method: 'POST',
    body: JSON.stringify({ adminId, userId: uid }),
  });
  if (error) throw new Error(error);
}

// ─── Impersonation (master key): admin becomes any user, then back ─────
// Backup lives in localStorage (survives reload), flag in sessionStorage
// (per-tab: another tab stays whoever it is).
const ADMIN_TOKEN_BACKUP_KEY = 'ws_admin_token_backup';
const IMPERSONATE_FLAG_KEY = 'ws_impersonating_v1';

export interface ImpersonationInfo {
  adminName: string;
  targetName: string;
}

export async function adminImpersonate(userId: string, adminName: string, targetName: string): Promise<void> {
  const { data, error } = await api('/admin/impersonate', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
  if (error || !data?.token) throw new Error(error || 'Impersonation failed');
  try {
    const cur = localStorage.getItem(tokenKey);
    if (cur) localStorage.setItem(ADMIN_TOKEN_BACKUP_KEY, cur);
    sessionStorage.setItem(IMPERSONATE_FLAG_KEY, JSON.stringify({ adminName, targetName }));
  } catch { /* private mode — token swap still works, banner may hide */ }
  cachedUid = null;
  cachedIsAdmin = false;
  setToken(data.token);
  try {
    // Land on THEIR My Trips (never restore admin's stale trip_dashboard view).
    sessionStorage.removeItem('ws_app_view');
    sessionStorage.removeItem('ws_active_tab');
  } catch { /* ignore */ }
  window.location.reload();
}

export function getImpersonation(): ImpersonationInfo | null {
  try {
    const raw = sessionStorage.getItem(IMPERSONATE_FLAG_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && typeof p.targetName === 'string') {
      return { adminName: String(p.adminName || 'Admin'), targetName: p.targetName };
    }
  } catch { /* ignore */ }
  return null;
}

export function stopImpersonation(): void {
  try {
    const backup = localStorage.getItem(ADMIN_TOKEN_BACKUP_KEY);
    localStorage.removeItem(ADMIN_TOKEN_BACKUP_KEY);
    sessionStorage.removeItem(IMPERSONATE_FLAG_KEY);
    // Admin also lands fresh on My Trips (no stale target view).
    sessionStorage.removeItem('ws_app_view');
    sessionStorage.removeItem('ws_active_tab');
    // ...then the boot check below reroutes to the Admin Dashboard.
    sessionStorage.setItem('ws_return_admin', '1');
    if (backup) setToken(backup);
    else clearToken();
  } catch { /* ignore */ }
  cachedUid = null;
  cachedIsAdmin = false;
  window.location.reload();
}

export function makeInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
