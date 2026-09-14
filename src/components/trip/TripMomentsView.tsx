import React, { useEffect, useRef, useState } from 'react';
import {
  Plus,
  Heart,
  MessageCircle,
  Bookmark,
  Share2,
  Check,
  X,
  Database,
  ImagePlus,
  MoreVertical,
  Pencil,
  Trash2,
  Cloud,
  CloudOff,
} from 'lucide-react';
import type { SharedPhoto, Trip } from '../../types';
import { MediaImg, dropCachedMediaUrl } from '../common/MediaImg';
import { compressImage } from '../../utils/image';
import { formatBytes } from '../chat/chatStore';
import { putMedia, resolveMediaBlob } from '../../utils/mediaStore';
import { saveMoment, deleteMomentRemote, fetchStorageUsage, type StorageUsage } from '../../utils/momentsSync';

interface MomentComment {
  id: string;
  author: string;
  text: string;
  at: number;
}

const COMMENTS_KEY = 'ws_moment_comments_v1';
const LIKED_KEY = 'ws_moment_liked_v1';
const SAVED_KEY = 'ws_moment_saved_v1';

function readMap<T>(key: string): Record<string, T> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, T>) : {};
  } catch {
    return {};
  }
}

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeSet(key: string, set: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    /* private mode */
  }
}

type UploadStage = 'compressing' | 'saving' | 'done';

interface UploadState {
  stage: UploadStage;
  progress: number;
  originalBytes: number;
  finalBytes: number;
  preview: string;
}

interface TripMomentsViewProps {
  trip: Trip;
  photos: SharedPhoto[];
  myName: string;
  /** Member id of the current user — only matching posts show edit/delete. */
  myMemberId: string;
  myUid: string | null;
  onAddPhoto: (photo: SharedPhoto) => void;
  onUpdatePhoto: (photo: SharedPhoto) => void;
  onDeletePhoto: (id: string) => void;
  notify: (msg: string) => void;
}

/**
 * Trip timeline moments: clean composer (circle +), upload with a live
 * progress bar (real original → compressed sizes), like/comment/save for
 * trip members, share to Instagram, and a live on-device storage meter.
 */
export const TripMomentsView: React.FC<TripMomentsViewProps> = ({
  trip,
  photos,
  myName,
  myMemberId,
  myUid,
  onAddPhoto,
  onUpdatePhoto,
  onDeletePhoto,
  notify,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [staged, setStaged] = useState<{ file: File; preview: string } | null>(null);
  const [posting, setPosting] = useState(false);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [lastSizes, setLastSizes] = useState<{ original: number; final: number; format: string } | null>(null);
  const [serverUsage, setServerUsage] = useState<StorageUsage | null>(null);
  const [comments, setComments] = useState<Record<string, MomentComment[]>>(() => readMap<MomentComment[]>(COMMENTS_KEY));
  const [liked, setLiked] = useState<Set<string>>(() => readSet(LIKED_KEY));
  const [saved, setSaved] = useState<Set<string>>(() => readSet(SAVED_KEY));
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingCaption, setEditingCaption] = useState<{ id: string; text: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // LIVE server DB numbers (total + this trip) — refreshes with the feed.
  useEffect(() => {
    let live = true;
    const load = () => {
      fetchStorageUsage(trip.id).then((u) => {
        if (live && u) setServerUsage(u);
      });
    };
    load();
    const timer = window.setInterval(load, 30000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [trip.id, photos.length]);

  const stageFile = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('Please pick an image file');
      return;
    }
    if (staged) URL.revokeObjectURL(staged.preview);
    setStaged({ file, preview: URL.createObjectURL(file) });
  };

  const clearComposer = () => {
    if (staged) URL.revokeObjectURL(staged.preview);
    setStaged(null);
    setCaption('');
    setComposerOpen(false);
  };

  const canPost = !posting && (!!caption.trim() || !!staged);

  /** Push one photo to the server (bytes + row). Local copy stays as offline fallback. */
  const syncOne = (photo: SharedPhoto, blob: Blob | null) => {
    if (!myUid) return;
    void (async () => {
      try {
        const saved = await saveMoment(photo, blob, myUid);
        if (!saved) return; // offline — stays local-only for now
        onUpdatePhoto({ ...photo, url: saved.url || photo.url });
      } catch {
        /* stays local-only */
      }
    })();
  };

  const postMoment = async () => {
    if (!canPost) return;
    const text = caption.trim();
    const file = staged?.file ?? null;
    const preview = staged?.preview ?? '';
    setPosting(true);
    if (file) setUpload({ stage: 'compressing', progress: 8, originalBytes: file.size, finalBytes: 0, preview });
    try {
      let ref = '';
      let finalBytes = 0;
      if (file) {
        const stats = await compressImage(file);
        setUpload((u) => (u ? { ...u, stage: 'saving', progress: 62, finalBytes: stats.bytes } : u));
        ref = await putMedia(trip.id, 'image', stats.url, { fileName: file.name, mime: file.type });
        finalBytes = stats.bytes;
        setLastSizes({ original: file.size, final: stats.bytes, format: stats.format });
      }
      const me = trip.members.find((m) => m.isCurrentUser) || trip.members[0];
      const created: SharedPhoto = {
        id: `photo_${Date.now()}`,
        tripId: trip.id,
        url: ref,
        localRef: ref || undefined,
        caption: text || 'Trip moment',
        uploadedByMemberId: me?.id ?? 'me',
        uploadedByName: me?.name ?? myName,
        uploadedAt: new Date().toISOString(),
        likesCount: 0,
      };
      onAddPhoto(created);
      // Background: same bytes → Supabase (visible from any device).
      if (file) {
        const blob = await resolveMediaBlob(ref);
        syncOne(created, blob);
      } else if (myUid) {
        const textOnly = { ...created };
        void saveMoment(textOnly, null, myUid).catch(() => undefined);
      }
      if (file) {
        setUpload((u) => (u ? { ...u, stage: 'done', progress: 100, finalBytes } : u));
        window.setTimeout(() => {
          setUpload(null);
          URL.revokeObjectURL(preview);
        }, 2200);
      }
      setStaged(null);
      setCaption('');
      setComposerOpen(false);
    } catch {
      setUpload(null);
      notify('Post failed — please try again');
    } finally {
      setPosting(false);
    }
  };

  const toggleLike = (id: string) => {
    const next = new Set(liked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setLiked(next);
    writeSet(LIKED_KEY, next);
  };

  const toggleSave = (id: string) => {
    const next = new Set(saved);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSaved(next);
    writeSet(SAVED_KEY, next);
    notify(next.has(id) ? 'Saved to your collection' : 'Removed from saved');
  };

  const addComment = (photoId: string) => {
    const text = (commentDrafts[photoId] ?? '').trim();
    if (!text) return;
    const next = {
      ...comments,
      [photoId]: [...(comments[photoId] ?? []), { id: `c_${Date.now()}`, author: myName, text, at: Date.now() }],
    };
    setComments(next);
    try {
      localStorage.setItem(COMMENTS_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
    setCommentDrafts((d) => ({ ...d, [photoId]: '' }));
  };

  const shareToInstagram = async (photo: SharedPhoto) => {
    const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/t/${photo.tripId}/p/${photo.id}` : photo.url;
    const text = `${photo.caption || 'Trip moment'} — via WanderSync`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Trip moment', text, url: shareUrl });
        return;
      } catch {
        /* dismissed — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${shareUrl}`);
      notify('Link copied — paste it in Instagram');
    } catch {
      notify('Sharing is not available on this device');
    }
  };

  const iconBtn =
    'flex items-center gap-1.5 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer';

  return (
    <div className="space-y-3 max-w-3xl mx-auto">
      {/* Storage meter + composer */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setComposerOpen((v) => !v)}
            aria-label="Add moment"
            title="Add moment"
            className="w-11 h-11 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-indigo-200 transition-all active:scale-95 cursor-pointer"
          >
            <Plus size={20} strokeWidth={2.5} />
          </button>
          <button onClick={() => setComposerOpen((v) => !v)} className="flex-1 h-11 px-4 rounded-full bg-slate-100 hover:bg-slate-200/70 text-left text-xs font-medium text-slate-400 transition-colors cursor-pointer">
            Share a trip moment…
          </button>
        </div>

        {composerOpen && (
          <div className="mt-3 space-y-2">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write a caption… (photo optional)"
              rows={2}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none"
            />
            {staged && (
              <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-slate-200">
                <img src={staged.preview} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => { URL.revokeObjectURL(staged.preview); setStaged(null); }}
                  aria-label="Remove photo"
                  className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-rose-600 cursor-pointer"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                className="flex-1 h-11 rounded-xl border border-dashed border-slate-300 hover:border-indigo-400 text-slate-500 hover:text-indigo-600 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <ImagePlus size={16} /> {staged ? 'Change' : 'Photo'}
              </button>
              <button
                onClick={() => void postMoment()}
                disabled={!canPost}
                className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold transition-all active:scale-[0.98] cursor-pointer"
              >
                {posting ? 'Posting…' : 'Post'}
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { stageFile(e.target.files); e.target.value = ''; }} />
          </div>
        )}

        {/* Upload progress → success */}
        {upload && (
          <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-3">
            <div className="flex items-center gap-3">
              <img src={upload.preview} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-slate-700">
                  {upload.stage === 'done' ? (
                    <span className="flex items-center gap-1 text-emerald-600"><Check size={13} strokeWidth={3} /> Posted</span>
                  ) : upload.stage === 'compressing' ? (
                    `Compressing ${formatBytes(upload.originalBytes)}…`
                  ) : (
                    'Saving…'
                  )}
                </p>
                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1.5">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${upload.stage === 'done' ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                    style={{ width: `${upload.stage === 'done' ? 100 : upload.stage === 'saving' ? 72 : 30}%` }}
                  />
                </div>
                {upload.finalBytes > 0 && (
                  <p className="text-[10px] text-slate-500 font-medium mt-1">
                    {formatBytes(upload.originalBytes)} → {formatBytes(upload.finalBytes)}
                  </p>
                )}
              </div>
              {upload.stage !== 'done' && (
                <button onClick={() => setUpload(null)} aria-label="Dismiss" className="p-1 rounded-full text-slate-300 hover:text-slate-500 cursor-pointer">
                  <X size={15} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Live server DB meter (developer view) */}
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <Database size={13} className="text-slate-400 flex-shrink-0" />
            <p className="text-[10px] text-slate-500 font-medium">
              {serverUsage ? (
                <>Server DB live: <strong className="text-slate-700">{formatBytes(serverUsage.dbBytes)}</strong> · this trip {serverUsage.trip.photos} photos ({formatBytes(serverUsage.trip.photoBytes)})</>
              ) : (
                'Server DB: connecting…'
              )}
            </p>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${serverUsage ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          </div>
          {lastSizes && (
            <p className="text-[10px] text-slate-500 font-medium mt-1 pl-5">
              Last post: {formatBytes(lastSizes.original)} → {formatBytes(lastSizes.final)} · {lastSizes.format}
            </p>
          )}
          {serverUsage && Object.keys(serverUsage.tables).length > 0 && (
            <details className="mt-1 pl-5">
              <summary className="text-[10px] font-bold text-indigo-600 cursor-pointer list-none hover:text-indigo-800">
                Table breakdown
              </summary>
              <div className="mt-1 space-y-0.5">
                {Object.entries(serverUsage.tables)
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, bytes]) => (
                    <div key={name} className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 font-mono w-32 truncate">{name}</span>
                      <span className="flex-1 h-1 rounded-full bg-slate-100 overflow-hidden">
                        <span
                          className="block h-full rounded-full bg-indigo-400"
                          style={{ width: `${Math.max(2, Math.round((bytes / serverUsage.dbBytes) * 100))}%` }}
                        />
                      </span>
                      <span className="text-[10px] text-slate-600 font-bold w-16 text-right">{formatBytes(bytes)}</span>
                    </div>
                  ))}
              </div>
            </details>
          )}
        </div>
      </div>

      {/* Moments feed */}
      {photos.map((photo) => {
        const isLiked = liked.has(photo.id);
        const isSaved = saved.has(photo.id);
        const isOwner = photo.uploadedByMemberId === myMemberId;
        const photoComments = comments[photo.id] ?? [];
        const commentsOpen = openComments === photo.id;
        const menuOpen = menuOpenId === photo.id;
        const editing = editingCaption?.id === photo.id;
        return (
          <article key={photo.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2.5">
              <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-extrabold flex-shrink-0">
                {(photo.uploadedByName || 'M').trim().charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1">
                  <span className="block text-xs font-bold text-slate-900 truncate">{photo.uploadedByName}</span>
                  {photo.url.startsWith('http') ? (
                    <Cloud size={11} className="text-emerald-500 flex-shrink-0" />
                  ) : (
                    photo.url !== '' && <CloudOff size={11} className="text-slate-300 flex-shrink-0" />
                  )}
                </span>
                <span className="block text-[10px] text-slate-400 font-medium">
                  {new Date(photo.uploadedAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                  {photo.locationTag ? ` · ${photo.locationTag}` : ''}
                </span>
              </span>
              {isOwner && (
                <span className="relative flex-shrink-0">
                  <button
                    onClick={() => { setMenuOpenId(menuOpen ? null : photo.id); setConfirmDeleteId(null); }}
                    aria-label="Post options"
                    className="p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    <MoreVertical size={16} />
                  </button>
                  {menuOpen && (
                    <span className="absolute right-0 top-9 z-10 w-40 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5">
                      <button
                        onClick={() => { setEditingCaption({ id: photo.id, text: photo.caption || '' }); setMenuOpenId(null); }}
                        className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        <Pencil size={14} /> Edit caption
                      </button>
                      <button
                        onClick={() => {
                          if (confirmDeleteId === photo.id) {
                            // Full wipe: server bytes + device bytes + interaction
                            // crumbs (likes/saves/comments) + cached object URLs.
                            // Nothing of this photo remains anywhere.
                            void deleteMomentRemote(photo.id).catch(() => undefined);
                            onDeletePhoto(photo.id);
                            dropCachedMediaUrl(photo.url);
                            dropCachedMediaUrl(photo.localRef);
                            setComments((prev) => {
                              if (!(photo.id in prev)) return prev;
                              const next = { ...prev };
                              delete next[photo.id];
                              try {
                                localStorage.setItem(COMMENTS_KEY, JSON.stringify(next));
                              } catch {
                                /* private mode */
                              }
                              return next;
                            });
                            setLiked((prev) => {
                              if (!prev.has(photo.id)) return prev;
                              const next = new Set(prev);
                              next.delete(photo.id);
                              writeSet(LIKED_KEY, next);
                              return next;
                            });
                            setSaved((prev) => {
                              if (!prev.has(photo.id)) return prev;
                              const next = new Set(prev);
                              next.delete(photo.id);
                              writeSet(SAVED_KEY, next);
                              return next;
                            });
                            setCommentDrafts((prev) => {
                              if (!(photo.id in prev)) return prev;
                              const next = { ...prev };
                              delete next[photo.id];
                              return next;
                            });
                            setMenuOpenId(null);
                            setConfirmDeleteId(null);
                          } else {
                            setConfirmDeleteId(photo.id);
                          }
                        }}
                        className={`w-full flex items-center gap-2 px-3.5 py-2 text-xs font-bold cursor-pointer ${confirmDeleteId === photo.id ? 'bg-rose-600 text-white' : 'text-rose-600 hover:bg-rose-50'}`}
                      >
                        <Trash2 size={14} /> {confirmDeleteId === photo.id ? 'Tap again to delete' : 'Delete'}
                      </button>
                    </span>
                  )}
                </span>
              )}
            </div>
            {(photo.localRef || photo.url) ? (
              <MediaImg srcRef={photo.localRef || photo.url} alt={photo.caption || 'Trip moment'} className="w-full max-h-[420px] object-cover bg-slate-100" />
            ) : null}
            <div className="px-3.5 py-3">
              <div className="flex items-center gap-4">
                <button onClick={() => toggleLike(photo.id)} aria-label="Like" className={`${iconBtn} ${isLiked ? 'text-rose-500' : ''}`}>
                  <Heart size={19} fill={isLiked ? 'currentColor' : 'none'} />
                  <span className="text-[11px] font-bold">{photo.likesCount + (isLiked ? 1 : 0)}</span>
                </button>
                <button onClick={() => setOpenComments(commentsOpen ? null : photo.id)} aria-label="Comments" className={iconBtn}>
                  <MessageCircle size={19} />
                  <span className="text-[11px] font-bold">{photoComments.length}</span>
                </button>
                <button onClick={() => shareToInstagram(photo)} aria-label="Share" className={iconBtn}>
                  <Share2 size={18} />
                </button>
                <span className="flex-1" />
                <button onClick={() => toggleSave(photo.id)} aria-label="Save" className={`${iconBtn} ${isSaved ? 'text-indigo-600' : ''}`}>
                  <Bookmark size={19} fill={isSaved ? 'currentColor' : 'none'} />
                </button>
              </div>
              {photo.caption && !editing && <p className="text-xs text-slate-700 font-medium mt-2 leading-relaxed">{photo.caption}</p>}
              {editing && editingCaption && (
                <span className="block mt-2">
                  <textarea
                    autoFocus
                    value={editingCaption.text}
                    onChange={(e) => setEditingCaption({ id: photo.id, text: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-indigo-300 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-indigo-100 resize-none"
                  />
                  <span className="flex justify-end gap-2 mt-1.5">
                    <button onClick={() => setEditingCaption(null)} className="px-4 h-9 rounded-xl text-[11px] font-bold text-slate-500 hover:bg-slate-100 cursor-pointer">
                      Cancel
                    </button>
                    <button
                      onClick={() => { const updated = { ...photo, caption: editingCaption.text.trim() || photo.caption }; onUpdatePhoto(updated); if (myUid && updated.url.startsWith('http')) void saveMoment(updated, null, myUid).catch(() => undefined); setEditingCaption(null); }}
                      className="px-4 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold cursor-pointer"
                    >
                      Save
                    </button>
                  </span>
                </span>
              )}
              {commentsOpen && (
                <div className="mt-2.5 space-y-2">
                  {photoComments.map((c) => (
                    <p key={c.id} className="text-[11px] text-slate-600 leading-relaxed">
                      <strong className="text-slate-900">{c.author}</strong> {c.text}
                    </p>
                  ))}
                  <div className="flex gap-2">
                    <input
                      value={commentDrafts[photo.id] ?? ''}
                      onChange={(e) => setCommentDrafts((d) => ({ ...d, [photo.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && addComment(photo.id)}
                      placeholder="Add a comment…"
                      className="flex-1 h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] outline-none focus:border-indigo-400"
                    />
                    <button onClick={() => addComment(photo.id)} className="px-4 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold cursor-pointer">
                      Post
                    </button>
                  </div>
                </div>
              )}
            </div>
          </article>
        );
      })}
      {photos.length === 0 && !composerOpen && (
        <div className="text-center py-10">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto mb-3">
            <ImagePlus size={22} className="text-indigo-400" />
          </div>
          <p className="text-xs font-bold text-slate-700">No moments yet</p>
          <p className="text-[11px] text-slate-400 font-medium mt-1">Tap + to post the first photo of this trip.</p>
        </div>
      )}
    </div>
  );
};

export default TripMomentsView;
