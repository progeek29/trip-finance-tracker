const API = 'http://localhost:3001/api';

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

export async function authSignOut(): Promise<void> {
  clearToken();
  cachedUid = null;
  cachedIsAdmin = false;
}

export async function authGetUser(): Promise<{ uid: string; email: string; isAdmin: boolean } | null> {
  const token = getToken();
  if (!token) return null;
  const { data } = await api('/auth/user', { headers: { Authorization: `Bearer ${token}` } });
  if (!data?.user) return null;
  cachedUid = data.user.id;
  cachedIsAdmin = data.user.email === ADMIN_EMAIL;
  return { uid: data.user.id, email: data.user.email || '', isAdmin: cachedIsAdmin };
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
      async select(cols?: string) {
        return {
          async eq(col: string, val: string) {
            return {
              async maybeSingle() {
                const { data, error } = await api(buildQuery(table, { [col]: val }, { single: true }));
                return { data, error: error ? { message: error } : null };
              },
              async single() {
                const { data, error } = await api(buildQuery(table, { [col]: val }, { single: true }));
                if (error) throw new Error(error);
                return { data };
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
      async update(updates: Record<string, any>) {
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
      async delete() {
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
  channel(_name: string) {
    return {
      on(_event: string, _filter: any, _callback?: Function) { return this; },
      subscribe(_cb?: Function) { return this; },
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
  const id = 'u_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  const { data, error } = await api('/users', {
    method: 'POST',
    body: JSON.stringify({ id, email, name, phone, role }),
  });
  if (error) return null;
  return data?.[0] as ManagedUser || null;
}

export async function adminUpdateUser(id: string, updates: Partial<Pick<ManagedUser, 'name' | 'phone' | 'role' | 'email'>>): Promise<boolean> {
  const { error } = await api('/users', {
    method: 'PUT',
    body: JSON.stringify({ ...updates, _filters: { id } }),
  });
  return !error;
}

export async function adminDeleteUser(uid: string): Promise<boolean> {
  const { data: trips } = await api('/trips', { method: 'GET' });
  if (Array.isArray(trips)) {
    for (const t of trips) {
      if (t.ownerUid === uid) {
        await api(`/trips?id=${t.id}`, { method: 'DELETE' });
      }
    }
  }
  await api(`/users?id=${uid}`, { method: 'DELETE' });
  return true;
}

export function makeInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
