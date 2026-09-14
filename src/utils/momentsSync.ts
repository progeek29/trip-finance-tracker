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
    }),
  });
}

export async function deleteMomentRemote(id: string): Promise<void> {
  await callApi(`/moments/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function pullMoments(tripId: string): Promise<SharedPhoto[]> {
  const rows = await callApi<SharedPhoto[]>(`/moments?tripId=${encodeURIComponent(tripId)}`);
  return Array.isArray(rows) ? rows : [];
}

const POLL_MS = 20000;

/** Initial pull + poll (backend has no realtime channel — poll keeps it live). */
export function subscribeMoments(tripId: string, cb: (photos: SharedPhoto[]) => void): () => void {
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
