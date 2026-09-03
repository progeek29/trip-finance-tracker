export const AVATAR_COLORS = [
  'bg-rose-500',
  'bg-violet-500',
  'bg-sky-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-indigo-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-orange-500',
  'bg-cyan-500',
];

export function getInitials(name: string): string {
  if (!name) return '?';
  return name
    .replace(/\(You\)/g, '')
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Deterministic color per member id/name so avatars look stable. */
export function getAvatarColor(seed: string, index = 0): string {
  let hash = index * 7;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/**
 * Cool random profile photo for a new member.
 * Uses DiceBear (free, no key) with a seed so each friend gets a distinct avatar.
 * Falls back to initials UI when avatar is empty — caller should use MemberAvatar.
 */
export function getRandomAvatar(seed: string): string {
  const safe = encodeURIComponent(seed.trim() || `friend-${Date.now()}`);
  return `https://api.dicebear.com/9.x/adventurer-neutral/svg?seed=${safe}&backgroundColor=ffd5dc,ffdfbf,c0aede,b6e3f4,d1d4f9`;
}

/** Pravatar-style photo alternative (real photos). Kept as option. */
export function getRandomPhotoAvatar(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return `https://i.pravatar.cc/150?u=${encodeURIComponent(seed)}-${hash % 70}`;
}
