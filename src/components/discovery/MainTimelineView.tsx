import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, List, Plus, ImageIcon, Globe, Search, X } from 'lucide-react';
import { MediaImg } from '../common/MediaImg';
import { MainComposer } from './MainComposer';
import { PostDetailModal } from './PostDetailModal';
import { MomentGridCell, textGradient } from './MomentGridCell';
import { fetchMainFeed } from '../../utils/mainFeed';
import type { SharedPhoto, Trip } from '../../types';

interface MainTimelineViewProps {
  myUid: string | null;
  myName: string;
  trips: Trip[];
  /** Local trip moments (all trips) — merged under trip pills. */
  localMoments: SharedPhoto[];
  onOpenTrip: (trip: Trip) => void;
  onOpenAuthor: (uid: string, name: string) => void;
  notify: (msg: string) => void;
}

type Pill = 'main' | 'trips' | string; // string = tripId

/** Main Timeline tab: public trip-less feed + trip pills, grid/normal views,
 *  in-place composer (posts stay here — no destination picker). */
export const MainTimelineView: React.FC<MainTimelineViewProps> = ({
  myUid,
  myName,
  trips,
  localMoments,
  onOpenTrip,
  onOpenAuthor,
  notify,
}) => {
  const [serverFeed, setServerFeed] = useState<SharedPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searchRows, setSearchRows] = useState<SharedPhoto[] | null>(null);
  const queryTimer = useRef<number | null>(null);
  const [pill, setPill] = useState<Pill>('main');
  const [view, setView] = useState<'normal' | 'grid'>('normal');
  const [composerOpen, setComposerOpen] = useState(false);
  const [detail, setDetail] = useState<SharedPhoto | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setServerFeed(await fetchMainFeed(50));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Content search (caption + author): server for Public, local filter for Trips.
  useEffect(() => {
    if (queryTimer.current) window.clearTimeout(queryTimer.current);
    const q = query.trim();
    if (!q) {
      setSearchRows(null);
      return;
    }
    queryTimer.current = window.setTimeout(() => {
      void fetchMainFeed(50, undefined, q).then((rows) => setSearchRows(rows));
    }, 350);
    return () => {
      if (queryTimer.current) window.clearTimeout(queryTimer.current);
    };
  }, [query]);

  const tripPills = useMemo(() => {
    const ids = new Set(localMoments.map((p) => p.tripId).filter(Boolean));
    return trips.filter((t) => ids.has(t.id));
  }, [trips, localMoments]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const main = [...(searchRows ?? serverFeed)].sort((a, b) => +new Date(b.uploadedAt || 0) - +new Date(a.uploadedAt || 0));
    const local = [...localMoments].sort((a, b) => +new Date(b.uploadedAt || 0) - +new Date(a.uploadedAt || 0));
    const matchQ = (p: SharedPhoto) =>
      !q ||
      (p.caption || '').toLowerCase().includes(q) ||
      (p.uploadedByName || '').toLowerCase().includes(q);
    if (pill === 'main') return searchRows !== null ? main : main.filter(matchQ);
    if (pill === 'trips') return local.filter(matchQ).slice(0, 100);
    return local.filter((p) => p.tripId === pill && matchQ(p));
  }, [serverFeed, searchRows, localMoments, pill, query]);

  const pillLabel = (id: Pill): string => {
    if (id === 'main') return 'Public';
    if (id === 'trips') return 'Trips';
    return trips.find((t) => t.id === id)?.title || 'Trip';
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-5 pb-32">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-sm font-extrabold text-slate-900">Timeline</h3>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setView((v) => (v === 'normal' ? 'grid' : 'normal'))}
            aria-label="Toggle view"
            title={view === 'normal' ? 'Grid view' : 'Normal view'}
            className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 cursor-pointer"
          >
            {view === 'normal' ? <LayoutGrid size={15} /> : <List size={15} />}
          </button>
          <button
            onClick={() => setComposerOpen(true)}
            className="h-9 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Plus size={15} strokeWidth={2.5} /> New post
          </button>
        </div>
      </div>

      {/* Content search: caption + author (server for Public, local for Trips) */}
      <div className="relative mb-2.5">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search posts or people…"
          className="w-full h-10 pl-9 pr-9 text-xs rounded-xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-indigo-100 placeholder-slate-400"
        />
        {query && (
          <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:bg-slate-100 cursor-pointer">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filter pills: Public · Trips · per-trip + dropdown */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex gap-1.5 overflow-x-auto flex-1 pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {(['main', 'trips', ...tripPills.map((t) => t.id)] as Pill[]).map((id) => (
            <button
              key={id}
              onClick={() => setPill(id)}
              className={`flex-shrink-0 h-8 px-3.5 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${
                pill === id
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                  : 'bg-white border border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              {pillLabel(id)}
            </button>
          ))}
        </div>
        {tripPills.length > 0 && (
          <select
            value={typeof pill === 'string' && pill !== 'trips' && pill !== 'main' ? pill : ''}
            onChange={(e) => setPill((e.target.value || 'trips') as Pill)}
            aria-label="Pick a trip"
            title="Pick a trip"
            className="flex-shrink-0 h-8 max-w-[130px] rounded-full bg-white border border-slate-200 text-[11px] font-bold text-slate-600 outline-none cursor-pointer"
          >
            <option value="">Trip…</option>
            {tripPills.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        )}
      </div>

      {loading && items.length === 0 ? (
        <p className="text-[11px] text-slate-400 text-center py-10">Loading timeline…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-14">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ImageIcon size={28} className="text-indigo-300" />
          </div>
          <h3 className="text-slate-700 font-semibold text-lg">Nothing here yet</h3>
          <p className="text-slate-400 text-sm mt-1">Be the first to post a moment.</p>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-3 gap-1.5">
          {items.map((p) => (
            <MomentGridCell key={p.id} photo={p} onOpen={() => setDetail(p)} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((p) => (
            <FeedCard
              key={p.id}
              photo={p}
              trips={trips}
              onOpen={() => setDetail(p)}
              onOpenTrip={onOpenTrip}
              onOpenAuthor={onOpenAuthor}
            />
          ))}
        </div>
      )}

      {composerOpen && myUid && (
        <MainComposer
          myUid={myUid}
          myName={myName}
          notify={notify}
          onClose={() => setComposerOpen(false)}
          onPosted={(photo) => {
            setServerFeed((prev) => [photo, ...prev]);
            notify('Posted to main timeline.');
          }}
        />
      )}
      {detail && (
        <PostDetailModal
          photo={detail}
          trips={trips}
          myUid={myUid}
          myName={myName}
          notify={notify}
          onClose={() => setDetail(null)}
          onOpenTrip={onOpenTrip}
          onOpenAuthor={onOpenAuthor}
          onDeleted={(id) => {
            setServerFeed((prev) => prev.filter((p) => p.id !== id));
            setDetail(null);
          }}
          onLiked={(id, count, liked) => {
            setServerFeed((prev) => prev.map((p) => (p.id === id ? { ...p, likesCount: count, likedByMe: liked } : p)));
            setDetail((d) => (d && d.id === id ? { ...d, likesCount: count, likedByMe: liked } : d));
          }}
          onEdited={(updated) => {
            setServerFeed((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
            setDetail((d) => (d && d.id === updated.id ? { ...d, ...updated } : d));
          }}
        />
      )}
    </div>
  );
};

function FeedCard({ photo, trips, onOpen, onOpenTrip, onOpenAuthor }: {
  photo: SharedPhoto;
  trips: Trip[];
  onOpen: () => void;
  onOpenTrip: (trip: Trip) => void;
  onOpenAuthor: (uid: string, name: string) => void;
}) {
  const trip = photo.tripId ? trips.find((t) => t.id === photo.tripId) : undefined;
  const author = photo.uploadedByName || 'Someone';
  return (
    <article className="bg-white rounded-2xl border border-slate-200/70 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => photo.uploadedByUid && onOpenAuthor(photo.uploadedByUid, author)}
          className="text-xs font-extrabold text-slate-900 hover:text-indigo-600 truncate cursor-pointer"
        >
          {author}
        </button>
        {trip ? (
          <button
            onClick={() => onOpenTrip(trip)}
            className="ml-auto flex-shrink-0 text-[10px] font-bold text-indigo-600 bg-indigo-50 rounded-md px-1.5 py-0.5 hover:bg-indigo-100 cursor-pointer truncate max-w-[140px]"
          >
            {trip.title}
          </button>
        ) : (
          <span title="Main timeline · visible to everyone" className="ml-auto flex-shrink-0 text-emerald-600 bg-emerald-50 rounded-md p-1">
            <Globe size={12} />
          </span>
        )}
      </div>
      <button onClick={onOpen} className="block w-full text-left cursor-pointer">
        {photo.url ? (
          <MediaImg srcRef={photo.url} alt={photo.caption || 'Moment'} className="w-full max-h-96 object-cover bg-slate-100" />
        ) : (
          <span className={`block bg-gradient-to-br ${textGradient(photo.id)} px-5 py-8`}>
            <span className="block text-white text-base font-extrabold leading-snug">“{photo.caption}”</span>
          </span>
        )}
        {!!photo.caption && !!photo.url && (
          <span className="block px-3 py-2 text-xs text-slate-600 line-clamp-2">{photo.caption}</span>
        )}
      </button>
    </article>
  );
}

export default MainTimelineView;
