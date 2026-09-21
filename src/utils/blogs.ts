import { apiBaseUrl } from './supabaseClient';
import type { SharedPhoto } from '../types';

/** Blogs (P1): long-form travel stories. Public read; session writes. */

export type BlogTag = 'itinerary' | 'journal' | 'tip' | 'food' | 'stay';
export type BlogStatus = 'draft' | 'pending' | 'published' | 'rejected';

export interface BlogPost {
  id: string;
  authorUid: string;
  authorName: string;
  authorUsername: string;
  title: string;
  slug: string;
  excerpt?: string;
  body?: string;
  coverUrl: string;
  tag: BlogTag;
  status: BlogStatus;
  featured: boolean;
  sortOrder?: number;
  views: number;
  likesCount: number;
  likedByMe?: boolean;
  commentsCount?: number;
  createdAt: number;
  updatedAt: number;
  moments?: SharedPhoto[];
}

export interface BlogComment {
  id: string;
  uid: string;
  name: string;
  text: string;
  at: number;
}

const TOKEN_KEY = 'wandersync_token';

function authHeaders(): Record<string, string> {
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
}

async function call<T>(path: string, opts?: RequestInit): Promise<T | null> {
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

async function callThrow<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...opts?.headers },
    ...opts,
  });
  const body = await res.json().catch(() => null);
  if (!body || body.error) throw new Error(body?.error || 'Request failed');
  return body.data as T;
}

export const BLOG_TAGS: { id: BlogTag; label: string }[] = [
  { id: 'itinerary', label: 'Itineraries' },
  { id: 'journal', label: 'Journals' },
  { id: 'tip', label: 'Tips' },
  { id: 'food', label: 'Food' },
  { id: 'stay', label: 'Stays' },
];

export async function fetchBlogs(opts?: { tag?: string; featured?: boolean; limit?: number }): Promise<BlogPost[]> {
  const qs = new URLSearchParams();
  if (opts?.tag) qs.set('tag', opts.tag);
  if (opts?.featured) qs.set('featured', 'true');
  if (opts?.limit) qs.set('limit', String(opts.limit));
  const rows = await call<BlogPost[]>(`/blogs${qs.toString() ? `?${qs}` : ''}`);
  return Array.isArray(rows) ? rows : [];
}

export async function fetchBlog(idOrSlug: string): Promise<BlogPost | null> {
  return call<BlogPost>(`/blogs/${encodeURIComponent(idOrSlug)}`);
}

export async function createBlog(input: { title: string; body: string; coverUrl?: string; tag: BlogTag }): Promise<{ id: string }> {
  return callThrow<{ id: string }>('/blogs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateBlog(
  id: string,
  patch: Partial<{ title: string; body: string; coverUrl: string; tag: BlogTag; status: BlogStatus; featured: boolean }>
): Promise<void> {
  await callThrow(`/blogs/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) });
}

export async function submitBlog(id: string): Promise<void> {
  await callThrow(`/blogs/${encodeURIComponent(id)}/submit`, { method: 'POST' });
}

export async function reviewBlog(id: string, approve: boolean): Promise<void> {
  await callThrow(`/blogs/${encodeURIComponent(id)}/review`, { method: 'POST', body: JSON.stringify({ approve }) });
}

export async function featureBlog(id: string, featured: boolean): Promise<void> {
  await callThrow(`/blogs/${encodeURIComponent(id)}/feature`, { method: 'POST', body: JSON.stringify({ featured }) });
}

export async function moveBlog(id: string, dir: 'up' | 'down'): Promise<void> {
  await callThrow(`/blogs/${encodeURIComponent(id)}/move`, { method: 'POST', body: JSON.stringify({ dir }) });
}

export async function deleteBlog(id: string): Promise<void> {
  await callThrow(`/blogs/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function toggleBlogLike(id: string, toLiked: boolean): Promise<{ liked: boolean; count: number } | null> {
  return call(`/blogs/${encodeURIComponent(id)}/likes`, { method: toLiked ? 'POST' : 'DELETE' });
}

export async function fetchBlogComments(id: string): Promise<BlogComment[]> {
  const rows = await call<BlogComment[]>(`/blogs/${encodeURIComponent(id)}/comments`);
  return Array.isArray(rows) ? rows : [];
}

export async function postBlogComment(id: string, text: string): Promise<BlogComment | null> {
  return call<BlogComment>(`/blogs/${encodeURIComponent(id)}/comments`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export async function deleteBlogComment(blogId: string, cid: string): Promise<boolean> {
  const r = await call(`/blogs/${encodeURIComponent(blogId)}/comments/${encodeURIComponent(cid)}`, { method: 'DELETE' });
  return r !== null;
}

export async function attachMoments(blogId: string, photoIds: string[]): Promise<number> {
  const r = await call<{ added: number }>(`/blogs/${encodeURIComponent(blogId)}/moments`, {
    method: 'POST',
    body: JSON.stringify({ photoIds }),
  });
  return r?.added || 0;
}

export async function detachMoment(blogId: string, photoId: string): Promise<void> {
  await callThrow(`/blogs/${encodeURIComponent(blogId)}/moments/${encodeURIComponent(photoId)}`, { method: 'DELETE' });
}

export async function fetchPendingBlogs(): Promise<BlogPost[]> {
  const rows = await call<BlogPost[]>('/blogs?status=pending&limit=100');
  return Array.isArray(rows) ? rows : [];
}

export async function fetchMyBlogs(): Promise<BlogPost[]> {
  const rows = await call<BlogPost[]>('/blogs/mine');
  return Array.isArray(rows) ? rows : [];
}

/** Draft autosave index (localStorage): crash/battery/network-proof writing. */
const DRAFT_KEY = 'ws_blog_drafts_v1';

export interface BlogDraft {
  id: string;
  title: string;
  body: string;
  coverUrl: string;
  tag: BlogTag;
  blogId?: string;
  updatedAt: number;
}

function readDrafts(): BlogDraft[] {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function listDrafts(): BlogDraft[] {
  return readDrafts().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveDraft(d: BlogDraft): void {
  try {
    const rest = readDrafts().filter((x) => x.id !== d.id);
    localStorage.setItem(DRAFT_KEY, JSON.stringify([{ ...d, updatedAt: Date.now() }, ...rest].slice(0, 20)));
  } catch { /* quota */ }
}

export function deleteDraft(id: string): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(readDrafts().filter((x) => x.id !== id)));
  } catch { /* ignore */ }
}
