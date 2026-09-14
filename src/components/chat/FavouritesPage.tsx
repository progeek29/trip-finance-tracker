import React from 'react';
import { Heart, ChevronRight } from 'lucide-react';
import { MemberAvatar } from '../common/MemberAvatar';
import { ui } from './chatStore';

export interface FavEntry {
  id: string;
  title: string;
  subtitle: string;
  tag?: string;
}

interface FavouritesPageProps {
  entries: FavEntry[];
  onOpen: (id: string) => void;
  onUnfavourite: (id: string) => void;
}

/** Separate Favourites tab — pinned chats only. */
export const FavouritesPage: React.FC<FavouritesPageProps> = ({ entries, onOpen, onUnfavourite }) => (
  <div>
    <p className={ui.section}>Favourites — {entries.length}</p>
    {entries.length === 0 ? (
      <div className="text-center py-10">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto mb-3">
          <Heart size={22} className="text-rose-300" />
        </div>
        <p className="text-xs font-bold text-slate-700">No favourites yet</p>
        <p className="text-[11px] text-slate-400 font-medium mt-1 max-w-[230px] mx-auto">
          Tap the heart on any chat to pin it here for quick access.
        </p>
      </div>
    ) : (
      <div className="space-y-2">
        {entries.map((e) => (
          <div key={e.id} className={ui.row}>
            <button onClick={() => onOpen(e.id)} className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer">
              <MemberAvatar name={e.title} avatar="" memberId={e.id} index={0} size="md" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className={`${ui.title} flex-shrink truncate`}>{e.title}</span>
                  {e.tag && <span className={ui.tag}>{e.tag}</span>}
                </span>
                <span className={ui.sub}>{e.subtitle}</span>
              </span>
              <ChevronRight size={18} className="text-slate-300 flex-shrink-0" />
            </button>
            <button
              onClick={() => onUnfavourite(e.id)}
              aria-label="Remove from favourites"
              title="Remove from favourites"
              className={`${ui.iconBtn} text-rose-500 hover:bg-rose-50`}
            >
              <Heart size={17} fill="currentColor" />
            </button>
          </div>
        ))}
      </div>
    )}
  </div>
);
