import React from 'react';
import { MediaImg } from '../common/MediaImg';
import type { SharedPhoto } from '../../types';

const TEXT_GRADIENTS = [
  'from-indigo-500 via-violet-600 to-purple-700',
  'from-amber-500 via-orange-600 to-rose-600',
  'from-emerald-500 via-teal-600 to-cyan-700',
  'from-sky-500 via-blue-600 to-indigo-700',
  'from-fuchsia-500 via-pink-600 to-rose-600',
];

export function textGradient(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TEXT_GRADIENTS[h % TEXT_GRADIENTS.length];
}

/** Instagram-style square cell — SAME component on Timeline, Trip page and
 *  Profile grids. Text-only posts become gradient quote cards. */
export const MomentGridCell: React.FC<{ photo: SharedPhoto; onOpen: () => void }> = ({ photo, onOpen }) => {
  if (!photo.url) {
    return (
      <button
        onClick={onOpen}
        className={`rounded-xl overflow-hidden bg-gradient-to-br ${textGradient(photo.id)} aspect-square p-2 text-left cursor-pointer active:scale-[0.98] transition-transform`}
      >
        <p className="text-white text-[10px] font-bold leading-snug line-clamp-6">
          “{(photo.caption || '').slice(0, 90)}”
        </p>
      </button>
    );
  }
  return (
    <button
      onClick={onOpen}
      className="rounded-xl overflow-hidden bg-slate-100 aspect-square cursor-pointer active:scale-[0.98] transition-transform"
    >
      <MediaImg srcRef={photo.url} alt={photo.caption || 'Moment'} className="w-full h-full object-cover" />
    </button>
  );
};

export default MomentGridCell;
