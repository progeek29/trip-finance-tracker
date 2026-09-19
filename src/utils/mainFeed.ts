import { apiBaseUrl } from './supabaseClient';
import { saveMoment } from './momentsSync';
import type { SharedPhoto } from '../types';

/** Main (trip-less, public-to-registered-users) timeline client. */

const TOKEN_KEY = 'wandersync_token';

function authHeaders(): Record<string, string> {
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
}

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${apiBaseUrl()}${path}`, { headers: authHeaders() });
    const body = await res.json().catch(() => null);
    if (!body || body.error) return null;
    return body.data as T;
  } catch {
    return null;
  }
}

/** Latest main-timeline posts, newest first. `before` = epoch ms paging
 *  cursor, `q` = server caption/author search. */
export async function fetchMainFeed(limit = 50, before?: number, q?: string): Promise<SharedPhoto[]> {
  const qs = `?limit=${limit}${before ? `&before=${before}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
  const rows = await get<SharedPhoto[]>(`/feed/main${qs}`);
  return Array.isArray(rows) ? rows : [];
}

export interface MomentComment {
  id: string;
  photoId: string;
  uid: string;
  name: string;
  text: string;
  at: number;
}

export async function fetchComments(photoId: string): Promise<MomentComment[]> {
  const rows = await get<MomentComment[]>(`/comments?photoId=${encodeURIComponent(photoId)}`);
  return Array.isArray(rows) ? rows : [];
}

export async function postComment(photoId: string, text: string): Promise<MomentComment | null> {
  try {
    const res = await fetch(`${apiBaseUrl()}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ photoId, text }),
    });
    const body = await res.json().catch(() => null);
    if (!body || body.error) throw new Error(body?.error || 'Comment failed');
    return body.data as MomentComment;
  } catch {
    return null;
  }
}

/** Post to the MAIN timeline (trip-less). Photo optional — text-only allowed. */
export async function postMainMoment(opts: {
  caption: string;
  blob: Blob | null;
  aspect?: number;
  myUid: string;
  myName: string;
}): Promise<SharedPhoto | null> {
  const text = (opts.caption || '').trim();
  if (!text && !opts.blob) return null;
  const photo: SharedPhoto = {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    tripId: '',
    url: '',
    caption: text,
    uploadedByMemberId: opts.myUid,
    uploadedByName: opts.myName,
    uploadedByUid: opts.myUid,
    uploadedAt: new Date().toISOString(),
    likesCount: 0,
    ...(opts.aspect && opts.aspect > 0 ? { aspect: opts.aspect } : {}),
  };
  const saved = await saveMoment(photo, opts.blob, opts.myUid);
  if (!saved) return null;
  return { ...photo, url: saved.url || '' };
}

/** Relational like toggle — insert row on like, delete row on unlike.
 *  Returns server {liked, count} or null on failure. */
export async function togglePostLike(photoId: string, toLiked: boolean): Promise<{ liked: boolean; count: number } | null> {
  try {
    const res = await fetch(
      `${apiBaseUrl()}${toLiked ? '/likes' : `/likes/${encodeURIComponent(photoId)}`}`,
      {
        method: toLiked ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: toLiked ? JSON.stringify({ photoId }) : undefined,
      }
    );
    const body = await res.json().catch(() => null);
    if (!body || body.error || !body.data) return null;
    return { liked: !!body.data.liked, count: Number(body.data.count || 0) };
  } catch {
    return null;
  }
}

export async function deleteComment(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiBaseUrl()}/comments/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const body = await res.json().catch(() => null);
    return !!(body && !body.error);
  } catch {
    return false;
  }
}

/** Comment counts for a batch of posts (one call — grids + hover). */
export async function fetchCommentCounts(ids: string[]): Promise<Record<string, number>> {
  const clean = [...new Set(ids.filter(Boolean))].slice(0, 100);
  if (clean.length === 0) return {};
  try {
    const res = await fetch(
      `${apiBaseUrl()}/comments/counts?ids=${clean.map(encodeURIComponent).join(',')}`,
      { headers: authHeaders() }
    );
    const body = await res.json().catch(() => null);
    return body && !body.error && body.data ? body.data : {};
  } catch {
    return {};
  }
}

/** All photoIds the session user liked (one call — seeds every screen). */
export async function fetchMyLikes(): Promise<Set<string>> {
  try {
    const res = await fetch(`${apiBaseUrl()}/likes/mine`, { headers: authHeaders() });
    const body = await res.json().catch(() => null);
    const arr = body && !body.error && Array.isArray(body.data) ? body.data : [];
    return new Set(arr.filter((x: unknown) => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

/** @deprecated Use togglePostLike — kept for existing callers. */
export async function likeMainMoment(photo: SharedPhoto, uid: string): Promise<number | null> {
  const r = await togglePostLike(photo.id, true);
  void uid;
  return r ? r.count : null;
}

/** @deprecated Use togglePostLike — kept for existing callers. */
export async function setMainLike(photo: SharedPhoto, uid: string, toLiked: boolean): Promise<number | null> {
  const r = await togglePostLike(photo.id, toLiked);
  void uid;
  return r ? r.count : null;
}
