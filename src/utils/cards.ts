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
