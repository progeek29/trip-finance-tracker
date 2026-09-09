function apiHost(): string {
  try {
    // Production override (Vercel): VITE_API_URL=https://<backend>/api
    const env = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL;
    if (env) return env.replace(/\/api\/?$/, '');
  } catch { /* ignore */ }
  try {
    const h = typeof window !== 'undefined' ? window.location.hostname : '';
    if (h && h !== 'localhost' && h !== '127.0.0.1') return `http://${h}:3001`;
  } catch { /* SSR */ }
  return 'http://localhost:3001';
}

const API = `${apiHost()}/api`;

async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers as any },
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
  if (cachedUid) return { uid: cachedUid };
  const token = getToken();
  if (!token) throw new Error('NOT_LOGGED_IN');
  const { data } = await api('/auth/user', { headers: { Authorization: `Bearer ${token}` } });
  if (data?.user) {
    cachedUid = data.user.id;
    cachedIsAdmin = data.user.email === ADMIN_EMAIL;
    return { uid: data.user.id };
  }
  clearToken();
  throw new Error('NOT_LOGGED_IN');
}

export function isAdminUser(): boolean {
  return cachedIsAdmin;
}

export async function authSignUp(email: string, password: string, name: string, phone: string): Promise<{ uid: string; isAdmin: boolean }> {
  const { data, error } = await api('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, name, phone }),
  });
  if (error) throw new Error(error);
  setToken(data.token);
  cachedUid = data.user.id;
  cachedIsAdmin = email === ADMIN_EMAIL;
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
}

export async function authGetUser(): Promise<{ uid: string; email: string; isAdmin: boolean; name: string; phone: string; role: string } | null> {
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

export function makeInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
