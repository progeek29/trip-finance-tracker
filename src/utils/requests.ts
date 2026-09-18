import { apiBaseUrl } from './supabaseClient';
import { sendPush } from './push';

/** Chat requests + Co-Travelers (friends). Rule: no accept = zero messages. */

export interface PublicPerson {
  id: string;
  name: string;
  username: string;
  gender: string;
}

export interface ChatRequest {
  id: string;
  status: string;
  createdAt: number;
  uid: string;
  name: string;
  username: string;
  gender: string;
}

export interface CoTraveler extends PublicPerson {
  since?: number;
}

function token(): string | null {
  try {
    return localStorage.getItem('wandersync_token');
  } catch {
    return null;
  }
}

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const t = token();
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...((opts?.headers as Record<string, string> | undefined) || {}),
    },
    ...opts,
  });
  const body = await res.json().catch(() => null);
  if (!body || body.error) throw new Error(body?.error || 'Request failed');
  return body.data as T;
}

export async function searchPeople(q: string): Promise<PublicPerson[]> {
  const query = q.trim().slice(0, 24);
  if (query.length < 2) return [];
  return req<PublicPerson[]>(`/users/search?q=${encodeURIComponent(query)}`);
}

export async function sendRequest(toUsername: string): Promise<{ id: string; to: PublicPerson }> {
  return req<{ id: string; to: PublicPerson }>('/requests', {
    method: 'POST',
    body: JSON.stringify({ toUsername: toUsername.trim().toLowerCase() }),
  });
}

/** Ping the recipient's offline devices (no-op until the push worker is deployed).
 *  Online receivers are covered by the App-side requests poller (bell+flash+buzz). */
export async function notifyRequestSent(
  fromName: string,
  fromUsername: string,
  myUid: string | null
): Promise<void> {
  try {
    await sendPush({
      tripId: 'people',
      kind: 'request',
      title: `@${fromUsername} sent you a chat request`,
      body: fromName,
      senderUid: myUid || undefined,
    });
  } catch {
    /* worker offline — receiver poller covers the online case */
  }
}

export async function getRequests(box: 'received' | 'sent'): Promise<ChatRequest[]> {
  return req<ChatRequest[]>(`/requests?box=${box}`);
}

export async function acceptRequest(id: string): Promise<void> {
  await req(`/requests/${encodeURIComponent(id)}/accept`, { method: 'POST' });
}

export async function declineRequest(id: string): Promise<void> {
  await req(`/requests/${encodeURIComponent(id)}/decline`, { method: 'POST' });
}

export async function cancelRequest(id: string): Promise<void> {
  await req(`/requests/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
}

export async function getFriends(): Promise<CoTraveler[]> {
  return req<CoTraveler[]>('/friends');
}

export async function unfriend(uid: string): Promise<void> {
  await req('/friends/remove', {
    method: 'POST',
    body: JSON.stringify({ uid }),
  });
}

export interface ChatGroup {
  id: string;
  memberUids: string[];
  createdBy: string;
  createdAt: number;
  name?: string;
  creatorName?: string;
}

export async function createGroup(memberUids: string[], name?: string): Promise<ChatGroup> {
  return req<ChatGroup>('/groups', {
    method: 'POST',
    body: JSON.stringify({ memberUids, name: (name || '').trim().slice(0, 60) }),
  });
}

export async function renameGroup(id: string, name: string): Promise<void> {
  await req(`/groups/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
}

export async function getMyGroups(): Promise<ChatGroup[]> {
  return req<ChatGroup[]>('/groups/mine');
}

export async function updateGroupMembers(
  id: string,
  opts: { add?: string[]; remove?: string[] }
): Promise<{ id: string; memberUids: string[]; createdBy?: string; deleted?: boolean }> {
  return req<{ id: string; memberUids: string[]; createdBy?: string; deleted?: boolean }>(
    `/groups/${encodeURIComponent(id)}/members`,
    {
      method: 'POST',
      body: JSON.stringify({ add: opts.add || [], remove: opts.remove || [] }),
    }
  );
}

/** Deterministic 1:1 room for a pair (same on both phones, no server row needed). */
export function dmRoomId(a: string, b: string): string {
  return `dm_${[a, b].sort().join('_')}`;
}
