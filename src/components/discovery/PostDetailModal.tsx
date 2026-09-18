import React, { useEffect, useRef, useState } from 'react';
import { X, MessageCircle, Trash2, Send, Pencil, ImagePlus, Globe } from 'lucide-react';
import { MediaImg, dropCachedMediaUrl } from '../common/MediaImg';
import { DandelionLike } from '../trip/DandelionLike';
import { FreeCropper, type CropPct } from '../trip/FreeCropper';
import { compressImage } from '../../utils/image';
import { saveMoment, deleteMomentRemote } from '../../utils/momentsSync';
import {
  fetchComments,
  postComment,
  deleteComment,
  togglePostLike,
  type MomentComment,
} from '../../utils/mainFeed';
import type { SharedPhoto, Trip } from '../../types';

interface PostDetailModalProps {
  photo: SharedPhoto;
  trips: Trip[];
  myUid: string | null;
  /** Fallback author-name match for legacy rows without uploadedByUid. */
  myName?: string;
  notify: (msg: string) => void;
  onClose: () => void;
  onOpenTrip?: (trip: Trip) => void;
  onOpenAuthor?: (uid: string, name: string) => void;
  onDeleted: (id: string) => void;
  onLiked: (id: string, count: number, liked: boolean) => void;
  onEdited?: (photo: SharedPhoto) => void;
}

/** Full post view (Instagram detail): photo left, caption + likes + comments
 *  right (stacked on mobile). SAME card from Timeline, Trip page, Profile:
 *  relational like toggle (insert/delete row), full edit (caption + replace
 *  photo through the HD pipeline), owner delete with confirm. */
export const PostDetailModal: React.FC<PostDetailModalProps> = ({
  photo,
  trips,
  myUid,
  myName,
  notify,
  onClose,
  onOpenTrip,
  onOpenAuthor,
  onDeleted,
  onLiked,
  onEdited,
}) => {
  const [caption, setCaption] = useState(photo.caption || '');
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [newFile, setNewFile] = useState<{ file: File; preview: string } | null>(null);
  const [crop, setCrop] = useState<CropPct | undefined>(undefined);
  const [completedCropPct, setCompletedCropPct] = useState<CropPct | null>(null);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [comments, setComments] = useState<MomentComment[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [liked, setLiked] = useState(!!photo.likedByMe);
  const [likeBusy, setLikeBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let live = true;
    fetchComments(photo.id).then((rows) => {
      if (live) setComments(rows);
    });
    return () => {
      live = false;
    };
  }, [photo.id]);

  const trip = photo.tripId ? trips.find((t) => t.id === photo.tripId) : undefined;
  const author = photo.uploadedByName || 'Someone';
  // Owner gate: uid match first; legacy rows without uid fall back to name.
  const mine =
    !!myUid &&
    (photo.uploadedByUid
      ? photo.uploadedByUid === myUid
      : !!myName && !!author && author === myName);

  const sendComment = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const row = await postComment(photo.id, text);
      if (!row) {
        notify('Could not send comment. Check internet.');
        return;
      }
      setComments((prev) => [...prev, row]);
      setDraft('');
    } finally {
      setSending(false);
    }
  };

  const removeComment = async (id: string) => {
    if (!window.confirm('Delete this comment?')) return;
    const ok = await deleteComment(id);
    if (!ok) {
      notify('Could not delete comment.');
      return;
    }
    setComments((prev) => prev.filter((c) => c.id !== id));
  };

  // Relational toggle: like inserts a row, unlike deletes it. Same toggle +
  // same burst animation as the trip timeline (single shared component).
  const doToggleLike = async () => {
    if (!myUid || likeBusy) return;
    const toLiked = !liked;
    setLiked(toLiked); // optimistic — burst fires instantly
    setLikeBusy(true);
    try {
      const r = await togglePostLike(photo.id, toLiked);
      if (!r) {
        setLiked(!toLiked);
        notify('Could not update like. Check internet.');
        return;
      }
      onLiked(photo.id, r.count, r.liked);
      if (r.liked !== toLiked) setLiked(r.liked);
    } finally {
      setLikeBusy(false);
    }
  };

  const stageReplace = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('Please pick an image file');
      return;
    }
    if (newFile) URL.revokeObjectURL(newFile.preview);
    setNewFile({ file, preview: URL.createObjectURL(file) });
    setCrop(undefined);
    setCompletedCropPct(null);
    setCropModalOpen(true);
  };

  const cutReplace = async (): Promise<{ blob: Blob; aspect: number } | null> => {
    if (!newFile) return null;
    const pc = completedCropPct;
    try {
      if (pc && pc.width && pc.height) {
        const full = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = reject;
          el.src = newFile.preview;
        });
        const sx = (pc.x / 100) * full.naturalWidth;
        const sy = (pc.y / 100) * full.naturalHeight;
        const sw = Math.max(1, Math.round((pc.width / 100) * full.naturalWidth));
        const sh = Math.max(1, Math.round((pc.height / 100) * full.naturalHeight));
        const scale = Math.min(1, 1080 / Math.max(sw, sh));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(sw * scale));
        canvas.height = Math.max(1, Math.round(sh * scale));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(full, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          const cut = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
          if (cut) return { blob: cut, aspect: canvas.width / Math.max(1, canvas.height) };
        }
      }
      // No crop box (or cut failed) → whole file through the HD ladder.
      const stats = await compressImage(newFile.file, { maxDim: 1080 });
      if (!stats.url.startsWith('data:')) return null;
      return { blob: await (await fetch(stats.url)).blob(), aspect: photo.aspect || 0 };
    } catch {
      return null;
    }
  };

  // Full edit: caption + optional replacement photo (HD pipeline), one save.
  const saveEdit = async () => {
    if (!myUid || savingEdit) return;
    const text = caption.trim().slice(0, 500);
    setSavingEdit(true);
    try {
      let blob: Blob | null = null;
      let aspect = photo.aspect;
      if (newFile) {
        const cut = await cutReplace();
        if (!cut) {
          notify('Could not read that image.');
          return;
        }
        blob = cut.blob;
        if (cut.aspect) aspect = cut.aspect;
      }
      const updated: SharedPhoto = {
        ...photo,
        caption: text,
        ...(aspect ? { aspect } : {}),
      };
      const saved = await saveMoment(updated, blob, myUid);
      if (!saved) {
        notify('Could not save. Check internet.');
        return;
      }
      // Cache-bust the bytes URL (immutable 1yr cache would serve stale pixels).
      const fresh: SharedPhoto = {
        ...updated,
        url: saved.url ? saved.url.split('?')[0] + `?v=${Date.now()}` : updated.url,
      };
      try {
        dropCachedMediaUrl(photo.localRef);
      } catch { /* no local copy */ }
      if (newFile) URL.revokeObjectURL(newFile.preview);
      setNewFile(null);
      setEditing(false);
      setCaption(text);
      onEdited?.(fresh);
      notify('Post updated.');
    } finally {
      setSavingEdit(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (deleting) return;
    if (!window.confirm('Delete this post? The photo and its comments go with it.')) {
      setConfirmDelete(false);
      return;
    }
    setDeleting(true);
    try {
      await deleteMomentRemote(photo.id);
      try {
        dropCachedMediaUrl(photo.localRef);
      } catch { /* no local copy */ }
      notify('Post deleted.');
      onDeleted(photo.id);
    } catch {
      notify('Could not delete. Check internet.');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const previewUrl = newFile?.preview || photo.url;

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/70" onClick={onClose} />
      <div className="relative w-full sm:max-w-3xl max-h-[92dvh] flex flex-col sm:flex-row bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden panel-enter">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/70 cursor-pointer"
        >
          <X size={16} />
        </button>
        {/* Photo */}
        <div className="sm:flex-1 bg-slate-950 flex items-center justify-center flex-shrink-0 min-h-0 sm:min-h-[320px] max-h-[40dvh] sm:max-h-none">
          {previewUrl ? (
            <MediaImg srcRef={previewUrl} alt={caption || 'Moment'} className="w-full h-full max-h-[40dvh] sm:max-h-[92dvh] object-contain" />
          ) : (
            <p className="text-white text-lg font-extrabold leading-snug p-8 text-center">“{caption}”</p>
          )}
        </div>
        {/* Side panel — shrinks on mobile so comments always scroll INSIDE */}
        <div className="w-full sm:w-80 flex-1 sm:flex-shrink-0 flex flex-col min-h-0 border-t sm:border-t-0 sm:border-l border-slate-100">
          <div className="flex items-center gap-2 pl-4 pr-12 py-3 border-b border-slate-100 flex-shrink-0">
            <button
              onClick={() => photo.uploadedByUid && onOpenAuthor?.(photo.uploadedByUid, author)}
              className="text-xs font-extrabold text-slate-900 hover:text-indigo-600 truncate cursor-pointer"
            >
              {author}
            </button>
            {trip ? (
              <button
                onClick={() => onOpenTrip?.(trip)}
                className="ml-auto flex-shrink-0 text-[10px] font-bold text-indigo-600 bg-indigo-50 rounded-md px-1.5 py-0.5 hover:bg-indigo-100 cursor-pointer"
              >
                {trip.title}
              </button>
            ) : (
              <span title="Main timeline · visible to everyone" className="ml-auto flex-shrink-0 text-emerald-600 bg-emerald-50 rounded-md p-1">
                <Globe size={12} />
              </span>
            )}
            {mine && (
              <>
                <button
                  onClick={() => setEditing((v) => !v)}
                  title="Edit post"
                  className="p-1.5 rounded-full text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => void doDelete()}
                  disabled={deleting}
                  title={confirmDelete ? 'Tap again to delete' : 'Delete post'}
                  className={`p-1.5 rounded-full cursor-pointer ${confirmDelete ? 'bg-rose-600 text-white' : 'text-slate-300 hover:text-rose-500 hover:bg-rose-50'}`}
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
          <div className="flex-1 min-h-[140px] overflow-y-auto px-4 py-3 space-y-2.5 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
            {editing ? (
              <div>
                <textarea
                  autoFocus
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-indigo-300 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-indigo-100 resize-none"
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="mt-1.5 w-full h-9 rounded-xl border-2 border-dashed border-slate-200 hover:border-indigo-300 text-slate-400 hover:text-indigo-500 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ImagePlus size={14} /> {newFile ? 'Change photo' : photo.url ? 'Replace photo' : 'Add photo'}
                </button>
                {newFile && (
                  <p className="text-[10px] text-emerald-600 font-bold mt-1">New photo staged — crops in the popup.</p>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    void stageReplace(e.target.files);
                    e.target.value = '';
                  }}
                />
                <div className="flex gap-2 mt-1.5">
                  <button
                    onClick={() => void saveEdit()}
                    disabled={savingEdit}
                    className="px-4 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-[11px] font-bold cursor-pointer"
                  >
                    {savingEdit ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      if (newFile) URL.revokeObjectURL(newFile.preview);
                      setNewFile(null);
                      setCaption(photo.caption || '');
                      setEditing(false);
                    }}
                    className="px-4 h-8 rounded-lg border border-slate-200 text-slate-500 text-[11px] font-bold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              !!caption && (
                <p className="text-xs text-slate-700">
                  <strong className="font-extrabold text-slate-900">{author}</strong> {caption}
                </p>
              )
            )}
            {comments.length === 0 ? (
              <p className="text-[11px] text-slate-400">No comments yet — be the first.</p>
            ) : (
              comments.map((c) => {
                const canDelete = !!myUid && (c.uid === myUid || mine);
                return (
                  <p key={c.id} className="text-xs text-slate-600 flex items-start gap-1">
                    <span className="flex-1">
                      <strong className="font-extrabold text-slate-900">{c.name}</strong> {c.text}
                    </span>
                    {canDelete && (
                      <button
                        onClick={() => void removeComment(c.id)}
                        aria-label="Delete comment"
                        title="Delete comment"
                        className="p-0.5 rounded-full text-slate-300 hover:text-rose-500 hover:bg-rose-50 cursor-pointer flex-shrink-0"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </p>
                );
              })
            )}
          </div>
          <div className="flex-shrink-0 border-t border-slate-100 px-4 py-2.5">
            <div className="flex items-center gap-2 mb-2">
              <DandelionLike liked={liked} count={Number(photo.likesCount || 0)} onToggle={() => void doToggleLike()} />
              <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                <MessageCircle size={15} />{comments.length > 0 ? ` ${comments.length}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void sendComment();
                }}
                placeholder="Add a comment…"
                maxLength={500}
                className="flex-1 h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 outline-none focus:border-indigo-400 placeholder-slate-400"
              />
              <button
                onClick={() => void sendComment()}
                disabled={sending || !draft.trim()}
                aria-label="Send comment"
                className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white cursor-pointer"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Crop POPUP for replacement photo — SAME component + skin as composers */}
      {newFile && cropModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-neutral-950/80">
          <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-[0_32px_64px_-12px_rgba(0,0,0,0.6)]">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-800">
              <button
                type="button"
                onClick={() => setCropModalOpen(false)}
                className="text-sm font-medium text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <h4 className="text-base font-semibold text-neutral-100 tracking-tight">Crop photo</h4>
              <button
                type="button"
                onClick={() => setCropModalOpen(false)}
                className="px-5 py-1.5 bg-white hover:bg-neutral-200 text-neutral-950 text-sm font-semibold rounded-full active:scale-95 transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
            <div className="flex items-center justify-center bg-neutral-950 p-4 select-none" style={{ minHeight: 320 }}>
              <FreeCropper
                src={newFile.preview}
                value={crop}
                onChange={setCrop}
                onComplete={setCompletedCropPct}
              />
            </div>
            <p className="text-center text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-500 px-4 py-3 border-t border-neutral-800">
              Drag the box to adjust — what you see is what uploads
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PostDetailModal;
