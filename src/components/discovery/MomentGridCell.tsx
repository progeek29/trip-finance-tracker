import React from 'react';
import { Heart, MessageCircle } from 'lucide-react';
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

interface MomentGridCellProps {
  photo: SharedPhoto;
  onOpen: () => void;
  /** Instagram-style hover overlay (desktop) — shown when provided. */
  likes?: number;
  comments?: number;
}

/** Instagram-style square cell — SAME component on Timeline, Trip page and
 *  Profile grids. Text-only posts become gradient quote cards. */
export const MomentGridCell: React.FC<MomentGridCellProps> = ({ photo, onOpen, likes, comments }) => {
  const showStats = likes !== undefined || comments !== undefined;
  return (
    <button
      onClick={onOpen}
      style={{ aspectRatio: '1 / 1', width: '100%', display: 'block' }}
      className="group relative rounded-xl overflow-hidden bg-slate-100 aspect-square w-full cursor-pointer active:scale-[0.98] transition-transform"
    >
      {photo.url ? (
        <MediaImg srcRef={photo.url} alt={photo.caption || 'Moment'} className="w-full h-full object-cover" />
      ) : (
        <span className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${textGradient(photo.id)} p-2`}>
          <span className="text-white text-[10px] font-bold leading-snug line-clamp-6">
            “{(photo.caption || '').slice(0, 90)}”
          </span>
        </span>
      )}
      {showStats && (
        <span className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 pointer-events-none">
          <span className="flex items-center gap-1 text-white text-xs font-extrabold">
            <Heart size={15} className="fill-white" /> {likes ?? 0}
          </span>
          <span className="flex items-center gap-1 text-white text-xs font-extrabold">
            <MessageCircle size={15} className="fill-white" /> {comments ?? 0}
          </span>
        </span>
      )}
    </button>
  );
};

export default MomentGridCell;
