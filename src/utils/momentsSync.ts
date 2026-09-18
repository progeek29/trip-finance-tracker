import { apiBaseUrl } from './supabaseClient';
import type { SharedPhoto } from '../types';

/**
 * Trip timeline moments — our own backend is source of truth (visible from
 * any device). Bytes live IN Postgres (`photos.data`), served from
 * /api/moments/:id/bytes. The phone keeps a Blob copy (localRef) for
 * instant offline rendering; `url` is the shareable remote URL.
 *
 * NOTE: the `supabase` realtime/storage shims are local-dev stubs — moments
 * intentionally use plain backend REST + polling instead.
 */

const TOKEN_KEY = 'wandersync_token';

function authHeaders(): Record<string, string> {
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
}

async function callApi<T>(path: string, opts?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${apiBaseUrl()}${path}`, {
      headers: { 'Content-Type': 'application/json', ...authHeaders(), ...opts?.headers },
      ...opts,
    });
    const body = await res.json().catch(() => null);
    if (!body || body.error) return null;
    return body.data as T;
  } catch {
    return null;
  }
}

export interface SavedMoment {
  id: string;
  url: string | null;
  bytes: number;
}

/** Save metadata (+ optional bytes) → remote URL. Null when offline/failed. */
export async function saveMoment(
  photo: SharedPhoto,
  blob: Blob | null,
  uid: string
): Promise<SavedMoment | null> {
  let data: string | undefined;
  if (blob) {
    const dataUrl = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => resolve('');
      r.readAsDataURL(blob);
    });
    if (!dataUrl.startsWith('data:')) return null;
    data = dataUrl;
  }
  return callApi<SavedMoment>('/moments', {
    method: 'POST',
    body: JSON.stringify({
      id: photo.id,
      tripId: photo.tripId,
      caption: photo.caption || '',
      locationTag: photo.locationTag || '',
      uploadedByMemberId: photo.uploadedByMemberId,
      uploadedByName: photo.uploadedByName,
      uploadedAt: photo.uploadedAt,
      likesCount: photo.likesCount || 0,
      mime: blob?.type || 'image/jpeg',
      updatedBy: uid,
      ...(data ? { data } : {}),
      ...(photo.aspect ? { aspect: photo.aspect } : {}),
      ...(photo.uploadedByUid ? { uploadedByUid: photo.uploadedByUid } : {}),
    }),
  });
}

export async function deleteMomentRemote(id: string): Promise<void> {
  // callApi swallows transport errors as null — re-raise so the tombstone
  // outbox can retry instead of silently dropping the delete.
  const res = await callApi<{ id?: string }>(`/moments/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res || res.id !== id) throw new Error('delete failed');
}

/** Tombstone outbox: server deletes that failed (offline) retry on every
 *  good poll until they land. One shared id = one shared fate everywhere. */
const TOMBSTONE_KEY = 'ws_moment_tombstones_v1';

function readTombstones(): string[] {
  try {
    const raw = localStorage.getItem(TOMBSTONE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function queueTombstone(id: string): void {
  try {
    const arr = readTombstones();
    if (!arr.includes(id)) {
      arr.push(id);
      localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(arr.slice(-100)));
    }
  } catch { /* private mode — retry skipped */ }
}

/** Flush pending tombstones. Returns when attempted (best-effort). */
export async function flushTombstones(): Promise<void> {
  const pending = readTombstones();
  if (pending.length === 0) return;
  const done: string[] = [];
  await Promise.all(
    pending.map(async (id) => {
      try {
        await deleteMomentRemote(id);
        done.push(id);
      } catch { /* stays queued for next poll */ }
    })
  );
  if (done.length > 0) {
    try {
      const rest = readTombstones().filter((x) => !done.includes(x));
      localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(rest));
    } catch { /* ignore */ }
  }
}

export async function pullMoments(tripId: string): Promise<SharedPhoto[] | null> {
  const rows = await callApi<SharedPhoto[]>(`/moments?tripId=${encodeURIComponent(tripId)}`);
  // null = failed fetch (offline/error) — caller must keep everything.
  // [] = genuinely empty trip — caller may drop server-known ghosts.
  if (rows === null) return null;
  return Array.isArray(rows) ? rows : [];
}

const POLL_MS = 20000;

/** Initial pull + poll (backend has no realtime channel — poll keeps it live). */
export function subscribeMoments(tripId: string, cb: (photos: SharedPhoto[] | null) => void): () => void {
  let cancelled = false;
  const load = () => {
    pullMoments(tripId).then((rows) => {
      if (!cancelled) cb(rows);
    });
  };
  load();
  const timer = window.setInterval(load, POLL_MS);
  return () => {
    cancelled = true;
    window.clearInterval(timer);
  };
}

export interface StorageUsage {
  dbBytes: number;
  tables: Record<string, number>;
  trip: { photos: number; photoBytes: number };
}

/** LIVE server DB numbers (total + per-table + this trip). Null when offline. */
export async function fetchStorageUsage(tripId?: string): Promise<StorageUsage | null> {
  return callApi<StorageUsage>(
    `/storage-usage${tripId ? `?tripId=${encodeURIComponent(tripId)}` : ''}`
  );
}
