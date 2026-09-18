/** WanderSync pass number — permanent per-user 16-char sequence (`WSXX XXXX XXXX XXXX`).
 * Deterministic hash so every device/session derives the SAME number for a user.
 * Stored in the users table + local profile; minted once, never changes. */

export function mintCardNo(seed: string): string {
  const s = (seed || '').trim().toLowerCase() || 'wandersync-guest';
  let h1 = 0;
  let h2 = 0;
  for (let i = 0; i < s.length; i++) {
    h1 = (h1 * 31 + s.charCodeAt(i)) >>> 0;
    h2 = (h2 * 37 + s.charCodeAt(i) * 7) >>> 0;
  }
  const digits = `${String(h1).padStart(10, '0')}${String(h2).padStart(10, '0')}`.slice(0, 14);
  return `WS${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6, 10)} ${digits.slice(10, 14)}`;
}

/** First non-empty seed wins — email > uid > phone (stable identity order). */
export function cardSeed(...parts: Array<string | undefined | null>): string {
  for (const p of parts) {
    if (p && String(p).trim()) return String(p).trim();
  }
  return 'wandersync-guest';
}

export function isValidCardNo(v: string | undefined | null): boolean {
  return !!v && /^WS\d{2}( \d{4}){3}$/.test(v.trim());
}

export type Gender = 'male' | 'female' | 'unspecified';

export function cleanGender(v: unknown): Gender {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'male' || s === 'female') return s;
  return 'unspecified';
}

/** Username slug: `firstname(≤8, a-z0-9)_xxxx` — short, speakable, ours to control.
 * Deterministic per (name, seed) so every device derives the SAME handle.
 * Uniqueness is enforced by the DB unique index (migrate.cjs); collisions
 * re-mint with a `#i` seed suffix (same format, new suffix). */
export function mintUsername(name: string | undefined | null, seed: string | undefined | null): string {
  const slug =
    String(name || '')
      .trim()
      .toLowerCase()
      .split(/\s+/)[0]
      ?.replace(/[^a-z0-9]/g, '')
      .slice(0, 8) || 'friend';
  const s = `${slug}|${String(seed || '').trim().toLowerCase() || 'wandersync-guest'}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o/1/l — readable over a call
  let suffix = '';
  let n = h;
  for (let i = 0; i < 4; i++) {
    suffix += alphabet[n % alphabet.length];
    n = Math.floor(n / alphabet.length);
  }
  return `${slug}_${suffix}`;
}

export function isValidUsername(v: string | undefined | null): boolean {
  return !!v && /^[a-z0-9]{1,8}_[a-z0-9]{4}$/.test(v.trim().toLowerCase());
}
