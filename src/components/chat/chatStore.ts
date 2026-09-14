/**
 * Chat hub storage + shared UI tokens.
 * Everything here is on-device (localStorage) so the hub works offline;
 * socket sync for requests/groups can plug into these same shapes later.
 */

export interface CustomChatGroup {
  id: string;
  name: string;
  tripId: string;
  memberIds: string[];
  createdAt: number;
  /** UID of the creator. Missing = created on this device (treated as mine). */
  creatorUid?: string | null;
}

export interface ChatContact {
  id: string;
  name: string;
  phone?: string;
}

export type RequestStatus = 'pending' | 'accepted' | 'declined';

export interface ChatRequest {
  personId: string;
  name: string;
  status: RequestStatus;
  at: number;
}

export interface LocalMessage {
  id: string;
  from: 'me' | 'them';
  author: string;
  text: string;
  at: number;
}

const KEYS = {
  groupNames: 'ws_chat_group_names_v1',
  customGroups: 'ws_custom_chat_groups_v1',
  favourites: 'ws_chat_favourites_v1',
  requests: 'ws_chat_requests_v1',
  contacts: 'ws_chat_contacts_v1',
  threads: 'ws_chat_threads_v1',
} as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode — hub still works in-memory */
  }
}

/* ── Trip group display names (default = trip title, renameable) ── */

export const getGroupName = (tripId: string, fallback: string): string =>
  read<Record<string, string>>(KEYS.groupNames, {})[tripId]?.trim() || fallback;

export function setGroupName(tripId: string, name: string): Record<string, string> {
  const next = { ...read<Record<string, string>>(KEYS.groupNames, {}), [tripId]: name.trim() };
  write(KEYS.groupNames, next);
  return next;
}

export const loadGroupNames = (): Record<string, string> =>
  read<Record<string, string>>(KEYS.groupNames, {});

/* ── Custom groups ── */

export const loadCustomGroups = (): CustomChatGroup[] => {
  const arr = read<unknown>(KEYS.customGroups, []);
  return Array.isArray(arr) ? (arr as CustomChatGroup[]) : [];
};

export function saveCustomGroups(groups: CustomChatGroup[]): void {
  write(KEYS.customGroups, groups);
}

export function groupInviteLink(groupId: string): string {
  const base =
    typeof window !== 'undefined' && window.location.origin.startsWith('http')
      ? window.location.origin
      : 'https://wandersync.app';
  return `${base}/g/${groupId}`;
}

/* ── Favourites (entry ids: `trip:<id>` | `group:<id>` | `person:<id>`) ── */

export const loadFavourites = (): string[] => read<string[]>(KEYS.favourites, []);

export function toggleFavourite(id: string): string[] {
  const cur = loadFavourites();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  write(KEYS.favourites, next);
  return next;
}

/* ── Chat requests (1:1 strangers) ── */

export const loadRequests = (): ChatRequest[] => read<ChatRequest[]>(KEYS.requests, []);

export function upsertRequest(req: ChatRequest): ChatRequest[] {
  const rest = loadRequests().filter((r) => r.personId !== req.personId);
  const next = [{ ...req, at: Date.now() }, ...rest];
  write(KEYS.requests, next);
  return next;
}

export function requestStatus(personId: string): RequestStatus | null {
  return loadRequests().find((r) => r.personId === personId)?.status ?? null;
}

/* ── Stranger contacts (added by name/phone, no shared trip) ── */

export const loadContacts = (): ChatContact[] => read<ChatContact[]>(KEYS.contacts, []);

export function addContact(contact: ChatContact): ChatContact[] {
  const rest = loadContacts().filter((c) => c.id !== contact.id);
  const next = [contact, ...rest];
  write(KEYS.contacts, next);
  return next;
}

/* ── Local thread messages (1:1 + custom groups, on-device) ── */

export const loadThread = (threadId: string): LocalMessage[] =>
  read<Record<string, LocalMessage[]>>(KEYS.threads, {})[threadId] ?? [];

export function appendThreadMessage(threadId: string, msg: Omit<LocalMessage, 'id' | 'at'>): LocalMessage[] {
  const all = read<Record<string, LocalMessage[]>>(KEYS.threads, {});
  const next = [
    ...(all[threadId] ?? []),
    { ...msg, id: `m_${Date.now()}`, at: Date.now() },
  ];
  write(KEYS.threads, { ...all, [threadId]: next });
  return next;
}

/* ── Shared UI tokens (one source so every chat page looks identical) ── */

export const ui = {
  row: 'bg-white rounded-2xl border border-slate-200/80 shadow-sm p-3 flex items-center gap-3',
  title: 'block text-sm font-bold text-slate-900 truncate',
  sub: 'block text-[11px] text-slate-500 font-medium truncate',
  section: 'text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2',
  iconBtn:
    'w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer flex-shrink-0',
  primaryBtn:
    'flex items-center justify-center gap-1.5 h-11 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all active:scale-[0.98] cursor-pointer',
  input:
    'w-full h-11 px-3 rounded-xl bg-white border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all',
  tag: 'inline-flex items-center px-1.5 py-0.5 rounded-md text-[8px] font-extrabold tracking-wide bg-indigo-100 text-indigo-700',
} as const;

export const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 100 ? kb.toFixed(1) : Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
};
