import React, { useEffect, useState } from 'react';
import { UserPlus, Check } from 'lucide-react';
import { MemberAvatar } from './MemberAvatar';
import { MediaImg } from './MediaImg';
import { PostDetailModal } from '../discovery/PostDetailModal';
import { getPublicPerson, getUserMainPosts, sendRequest, type PublicPerson } from '../../utils/requests';
import type { SharedPhoto, Trip } from '../../types';

interface PublicProfileViewProps {
  uid: string;
  myUid: string | null;
  relation: 'self' | 'friend' | 'stranger';
  trips: Trip[];
  notify: (msg: string) => void;
  onBack: () => void;
  onRequestSent: () => void;
  onOpenTrip: (trip: Trip) => void;
}

/** Public profile (opened from author names on the main timeline):
 *  avatar + name + @handle + posts grid + chat-request button. */
export const PublicProfileView: React.FC<PublicProfileViewProps> = ({
  uid,
  myUid,
  relation,
  trips,
  notify,
  onBack,
  onRequestSent,
  onOpenTrip,
}) => {
  const [person, setPerson] = useState<PublicPerson | null>(null);
  const [posts, setPosts] = useState<SharedPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<SharedPhoto | null>(null);
  const [reqBusy, setReqBusy] = useState(false);
  const [reqSent, setReqSent] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([getPublicPerson(uid).catch(() => null), getUserMainPosts(uid).catch(() => [])]).then(
      ([p, rows]) => {
        if (!live) return;
        setPerson(p);
        setPosts(Array.isArray(rows) ? rows : []);
        setLoading(false);
      }
    );
    return () => {
      live = false;
    };
  }, [uid]);

  const doRequest = async () => {
    if (!person?.username || reqBusy) return;
    setReqBusy(true);
    try {
      await sendRequest(person.username);
      setReqSent(true);
      notify(`Request sent to @${person.username}`);
      onRequestSent();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not send request');
    } finally {
      setReqBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 panel-enter">
      <div className="sticky top-0 z-40 flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white/95 backdrop-blur">
        <button
          onClick={onBack}
          aria-label="Back"
          className="flex items-center justify-center p-1.5 -ml-1 rounded-full text-slate-700 hover:text-indigo-600 hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-extrabold text-slate-900 leading-tight truncate">
            {person ? `@${person.username || person.name}` : 'Profile'}
          </h4>
          <p className="text-[11px] text-slate-500 font-medium leading-tight">
            {person ? `${posts.length} post${posts.length === 1 ? '' : 's'}` : '…'}
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 pb-32">
        {loading ? (
          <p className="text-[11px] text-slate-400 text-center py-10">Loading profile…</p>
        ) : !person ? (
          <p className="text-[11px] text-slate-400 text-center py-10">Profile not found.</p>
        ) : (
          <>
            <div className="flex items-center gap-3.5">
              <MemberAvatar name={person.name} memberId={person.id} index={0} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-base font-extrabold text-slate-900 truncate">{person.name}</p>
                <p className="text-[11px] text-slate-400 font-medium">@{person.username || '…'}</p>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  {posts.length} post{posts.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            {relation === 'stranger' && (
              <button
                onClick={() => void doRequest()}
                disabled={reqBusy || reqSent}
                className="mt-3 w-full h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {reqSent ? (
                  <><Check size={14} strokeWidth={3} /> Request sent</>
                ) : (
                  <><UserPlus size={14} /> {reqBusy ? 'Sending…' : `Connect with ${person.name.split(' ')[0]}`}</>
                )}
              </button>
            )}
            {relation === 'friend' && (
              <p className="mt-3 text-center text-[11px] font-bold text-emerald-600 bg-emerald-50 rounded-xl py-2">
                You are connected
              </p>
            )}
            <h3 className="text-sm font-extrabold text-slate-900 mt-5 mb-2.5">Posts</h3>
            {posts.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-8">No posts yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {posts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setDetail(p)}
                    className="rounded-xl overflow-hidden bg-slate-100 aspect-square cursor-pointer active:scale-[0.98] transition-transform"
                  >
                    {p.url ? (
                      <MediaImg srcRef={p.url} alt={p.caption || 'Post'} className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-700 p-2">
                        <span className="text-white text-[10px] font-bold leading-snug line-clamp-6">
                          “{(p.caption || '').slice(0, 90)}”
                        </span>
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {detail && (
        <PostDetailModal
          photo={detail}
          trips={trips}
          myUid={myUid}
          notify={notify}
          onClose={() => setDetail(null)}
          onOpenTrip={(t) => {
            setDetail(null);
            onOpenTrip(t);
          }}
          onOpenAuthor={() => undefined}
          onDeleted={(id) => {
            setPosts((prev) => prev.filter((p) => p.id !== id));
            setDetail(null);
          }}
          onLiked={(id, count, liked) => {
            setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, likesCount: count, likedByMe: liked } : p)));
            setDetail((d) => (d && d.id === id ? { ...d, likesCount: count, likedByMe: liked } : d));
          }}
          onEdited={(updated) => {
            setPosts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
            setDetail((d) => (d && d.id === updated.id ? { ...d, ...updated } : d));
          }}
        />
      )}
    </div>
  );
};

export default PublicProfileView;
