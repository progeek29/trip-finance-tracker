import type { ChatMessage } from '../types';

/**
 * Notification feed parser — raw messy logs in, clean structured JSON out.
 * One unified feed: latest first, capped, category-badged.
 */

export type NotifCategory = 'transaction' | 'mention' | 'message' | 'location';

export interface FeedItem {
  id: string;
  category: NotifCategory;
  actor: string;
  messageBody: string;
  highlightData: string | null;
  previewText: string | null;
  relativeTime: string;
  isUnread: boolean;
  /** ms epoch — internal sort key (not part of the UI payload spec). */
  at: number;
  /** 'activity' rows are info-only; chat rows open the chat on tap. */
  opensChat: boolean;
}

export interface RawActivity {
  id: string;
  title: string;
  sub?: string;
  at: number;
}

const MONEY_RE = /(₹|Rs\.?)\s?([\d,]+(?:\.\d+)?)/i;
const MENTION_RE = /@([\w ]+?)(?=\s|$|,)/g;
const MONEY_WORD_RE = /(splitwise|settl|expense|bill|budget|payment)/i;
const LOCATION_WORD_RE = /(shared location|open in maps|maps\.google|siren)/i;
const ACTOR_VERB_RE = /^(.+?)\s(added|updated|deleted|settled|mentioned|paid|logged|joined|rang|auto-logged|just logged)/i;

/** "9 Sep, 8:37 am" style absolute → human relative ("Today, 8:37 AM"). */
export function relativeTime(at: number): string {
  const d = new Date(at);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - at;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  let h = d.getHours();
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const clock = `${h}:${String(d.getMinutes()).padStart(2, '0')} ${suffix}`;
  if (sameDay(d, now)) return `Today, ${clock}`;
  if (sameDay(d, yesterday)) return `Yesterday, ${clock}`;
  if (diffMs < 7 * 86400000) return `${Math.floor(diffMs / 86400000)}d ago`;
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function pickCategory(text: string, hasMentions: boolean): NotifCategory {
  if (MONEY_RE.test(text) || MONEY_WORD_RE.test(text)) return 'transaction';
  if (hasMentions || MENTION_RE.test(text)) {
    MENTION_RE.lastIndex = 0;
    return 'mention';
  }
  if (LOCATION_WORD_RE.test(text)) return 'location';
  return 'message';
}

function actorFromTitle(title: string, fallback: string): string {
  const m = ACTOR_VERB_RE.exec(title.trim());
  if (m) return m[1].trim() || fallback;
  return fallback;
}

/** Parse an expense/activity log row ("Krey added Rs.50 for muska bun …"). */
export function parseActivity(a: RawActivity, isUnread: boolean): FeedItem {
  const title = (a.title || '').trim();
  const money = MONEY_RE.exec(title);
  const mentions = title.match(MENTION_RE) || [];
  const category = pickCategory(title, mentions.length > 0);
  const actor = actorFromTitle(title, 'Someone');

  let body = title.replace(ACTOR_VERB_RE, '').trim();
  let highlight: string | null = null;
  if (money) {
    highlight = `Rs. ${money[2]}`;
    body = body.replace(money[0], '').replace(/\s{2,}/g, ' ').trim();
  } else if (mentions.length > 0) {
    highlight = mentions[0] ?? null;
  }
  // Filter gibberish one-word test logs
  if (/^[a-z]{4,12}$/i.test(body) && body.split(/\s+/).length === 1) {
    body = '(empty message)';
  }

  return {
    id: a.id,
    category,
    actor,
    messageBody: body || title,
    highlightData: highlight,
    previewText: null,
    relativeTime: relativeTime(a.at),
    isUnread,
    at: a.at,
    opensChat: false,
  };
}

export function msgTime(at: unknown): number {
  try {
    const d = (at as { toDate?: () => Date })?.toDate?.();
    if (d) return d.getTime();
    if (at) {
      const raw = new Date(at as string);
      if (!isNaN(raw.getTime())) return raw.getTime();
    }
  } catch { /* ignore */ }
  return 0;
}

/** Parse a chat message row into the same feed shape. */
export function parseChatMessage(
  m: ChatMessage,
  myUid: string | null,
  isUnread: boolean
): FeedItem | null {
  if (m.type === 'system') return null;
  const at = msgTime(m.createdAt);
  const text = (m.text || (m.type === 'location' ? 'Shared location' : '')).trim();
  const mine = myUid ? m.senderId === myUid : false;
  const mentioned =
    !mine &&
    (m.mentions || []).some(
      (x) => x.id === '__squad__' || x.name?.toLowerCase() === 'squad'
    );
  const category = pickCategory(
    `${m.senderName} ${text}`,
    mentioned || (!mine && (m.mentions || []).length > 0)
  );
  const money = MONEY_RE.exec(text);
  return {
    id: `chat-${m.id}`,
    category,
    actor: mine ? 'You' : m.senderName || 'Someone',
    messageBody:
      category === 'mention' && !mine
        ? 'mentioned you'
        : text.slice(0, 80) || (m.type === 'location' ? 'Shared location' : 'message'),
    highlightData: money ? `Rs. ${money[2]}` : null,
    previewText: text ? text.slice(0, 120) : null,
    relativeTime: relativeTime(at),
    isUnread,
    at,
    opensChat: true,
  };
}
