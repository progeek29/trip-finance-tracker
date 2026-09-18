import React, { useEffect, useRef, useState } from 'react';
import { FreeCropper, type CropPct } from './FreeCropper';
import { MomentPhoto } from './MomentPhoto';
import { DandelionLike, formatCount } from './DandelionLike';
import {
  Bookmark,
  Check,
  X,
  Database,
  ImagePlus,
  LayoutGrid,
  List,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  Cloud,
  CloudOff,
} from 'lucide-react';
import type { SharedPhoto, Trip } from '../../types';
import { MediaImg, dropCachedMediaUrl } from '../common/MediaImg';
import { compressImage } from '../../utils/image';
import { formatBytes } from '../chat/chatStore';
import { putMedia, resolveMediaBlob } from '../../utils/mediaStore';
import { saveMoment, deleteMomentRemote, queueTombstone, fetchStorageUsage, type StorageUsage } from '../../utils/momentsSync';
import { togglePostLike } from '../../utils/mainFeed';
import { MomentGridCell } from '../discovery/MomentGridCell';
import { PostDetailModal } from '../discovery/PostDetailModal';
import { sendPush } from '../../utils/push';

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
 * Trip timeline moments: clean composer (single share button), upload with a live
 * progress bar (real original → compressed sizes), like/comment/save for
 * trip members, share to Instagram. The server DB meter below is local-dev only.
 */

/** Local-dev only (true under `npm run dev`, false in prod builds) — gates the DB meter. */
const SHOW_DEBUG_METER = import.meta.env.DEV;

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
  const [feedView, setFeedView] = useState<'normal' | 'grid'>('normal');
  const [detail, setDetail] = useState<SharedPhoto | null>(null);

  // LIVE server DB numbers (local-dev only — skipped entirely in prod builds).
  useEffect(() => {
    if (!SHOW_DEBUG_METER) return;
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

  /** Pick → NORMALIZED file (EXIF orientation baked into pixels, max 2048px).
   *  Phone photos carry EXIF rotate flags: the editor, the crop math and the
   *  encoder must all see the SAME pixels. Normalizing once at pick kills the
   *  whole "dikha kuch, upload hua kuch" class — downstream is EXIF-free. */
  const stageFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('Please pick an image file');
      return;
    }
    const stageOriginal = () => {
      if (staged) URL.revokeObjectURL(staged.preview);
      resetCrop();
      setStaged({ file, preview: URL.createObjectURL(file) });
      setCropModalOpen(true);
    };
    try {
      // imageOrientation:'from-image' = EXIF applied during decode (old browsers throw → fallback below).
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
      const cw = Math.max(1, Math.round(bmp.width * scale));
      const ch = Math.max(1, Math.round(bmp.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        bmp.close();
        stageOriginal();
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, cw, ch);
      bmp.close();
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.92)
      );
      if (!blob) {
        stageOriginal();
        return;
      }
      if (staged) URL.revokeObjectURL(staged.preview);
      resetCrop();
      const norm = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
      setStaged({ file: norm, preview: URL.createObjectURL(norm) });
      setCropModalOpen(true);
    } catch {
      stageOriginal();
    }
  };

  const clearComposer = () => {
    if (staged) URL.revokeObjectURL(staged.preview);
    setStaged(null);
    setCaption('');
    setComposerOpen(false);
    resetCrop();
  };

  // ── Free crop state (POPUP modal, photo centered — custom cropper, no library) ──
  const [crop, setCrop] = useState<CropPct | undefined>(undefined);
  const [completedCropPct, setCompletedCropPct] = useState<CropPct | null>(null);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  // Confirmed cut (exact upload pixels) — composer thumbnail + Post use THIS.
  const [croppedFile, setCroppedFile] = useState<File | null>(null);
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);
  const [croppedAspect, setCroppedAspect] = useState<number | null>(null);

  const resetCrop = () => {
    // NOTE: never revokes croppedPreview here — the upload progress card may
    // still show it (its timeout revokes). Revoke only on explicit remove.
    setCrop(undefined);
    setCompletedCropPct(null);
    setCropModalOpen(false);
    setCroppedFile(null);
    setCroppedPreview(null);
    setCroppedAspect(null);
  };

  /** Remove staged photo entirely (composer + modal + confirmed cut). */
  const removeStaged = () => {
    if (staged) URL.revokeObjectURL(staged.preview);
    if (croppedPreview) URL.revokeObjectURL(croppedPreview);
    setStaged(null);
    resetCrop();
  };

  /** Done (modal) → cut once, show EXACT upload pixels in composer. */
  const confirmCrop = async () => {
    const cut = await cropStagedToFile();
    if (cut) {
      if (croppedPreview) URL.revokeObjectURL(croppedPreview);
      setCroppedFile(cut.file);
      setCroppedPreview(URL.createObjectURL(cut.file));
      setCroppedAspect(cut.aspect);
    }
    setCropModalOpen(false);
  };

  /** Cut the confirmed box out (max 1080px) as LOSSLESS PNG → {file, aspect} → existing compress ladder.
   *  PNG on purpose: JPEG intermediate khata quality (wahi 66KB-mushy bug) — ladder ko clean pixels milte hain, pehle jaisi sharpness wapas.
   *  Aspect (canvas ground truth) is saved with the post — feed frame matches it exactly. */
  const cropStagedToFile = async (): Promise<{ file: File; aspect: number } | null> => {
    const src = staged;
    const pc = completedCropPct;
    if (!src || !pc || !pc.width || !pc.height) return null;
    try {
      const full = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = src.preview;
      });
      if (!full.naturalWidth || !full.naturalHeight) return null;
      const sx = (pc.x / 100) * full.naturalWidth;
      const sy = (pc.y / 100) * full.naturalHeight;
      const sw = Math.max(1, Math.round((pc.width / 100) * full.naturalWidth));
      const sh = Math.max(1, Math.round((pc.height / 100) * full.naturalHeight));
      // Cap the cut at 1080px on the long edge — the compress ladder never sees a giant bitmap.
      const scale = Math.min(1, 1080 / Math.max(sw, sh));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sw * scale));
      canvas.height = Math.max(1, Math.round(sh * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(full, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png')
      );
      if (!blob) return null;
      return {
        file: new File([blob], 'crop.png', { type: 'image/png' }),
        aspect: canvas.width / Math.max(1, canvas.height),
      };
    } catch {
      return null;
    }
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
    // Confirmed cut first (modal Done already cut it) → then the existing compress ladder. Option A: no backend change.
    let file = croppedFile ?? staged?.file ?? null;
    let aspect = croppedAspect ?? null;
    // Progress card shows WHAT WILL UPLOAD (the confirmed cut), never the full original.
    let preview = croppedPreview ?? staged?.preview ?? '';
    let cropUrl: string | null = null;
    if (staged && !croppedFile) {
      const cut = await cropStagedToFile();
      if (cut) {
        file = cut.file;
        aspect = cut.aspect;
        cropUrl = URL.createObjectURL(cut.file);
        preview = cropUrl;
      }
    }
    setPosting(true);
    // Post = back to Timeline feed instantly, progress runs in the top strip.
    setComposerOpen(false);
    if (file) setUpload({ stage: 'compressing', progress: 8, originalBytes: file.size, finalBytes: 0, preview });
    try {
      let ref = '';
      let finalBytes = 0;
      if (file) {
        // 1080px lock (Option A): timeline output max 1080px wide — Insta standard, feed sizes pe 1600 jaisa hi dikhta hai, bytes kam.
        const stats = await compressImage(file, { maxDim: 1080 });
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
        ...(myUid ? { uploadedByUid: myUid } : {}),
        ...(aspect ? { aspect } : {}),
      };
      onAddPhoto(created);
      // Squad fan-out: offline members get phone push (worker, when live),
      // online members get it via the moments watcher below (bell + flash).
      void sendPush({
        tripId: trip.id,
        kind: 'moment',
        title: `${created.uploadedByName} shared a trip moment`,
        body: (text || 'Trip moment').slice(0, 120),
        senderUid: myUid || undefined,
      }).catch(() => undefined);
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
      if (staged) URL.revokeObjectURL(staged.preview);
      setStaged(null);
      resetCrop();
      setCaption('');
      setComposerOpen(false);
    } catch {
      if (cropUrl) URL.revokeObjectURL(cropUrl);
      setUpload(null);
      notify('Post failed — please try again');
    } finally {
      setPosting(false);
    }
  };

  // Relational like toggle (photo_likes table) — same toggle + same burst
  // animation everywhere. Optimistic local flip, server confirms the count.
  const toggleLike = (photo: SharedPhoto) => {
    const currently = photo.likedByMe ?? liked.has(photo.id);
    const toLiked = !currently;
    const next = new Set(liked);
    if (toLiked) next.add(photo.id);
    else next.delete(photo.id);
    setLiked(next);
    writeSet(LIKED_KEY, next);
    void (async () => {
      const r = await togglePostLike(photo.id, toLiked);
      if (r) {
        onUpdatePhoto({ ...photo, likesCount: r.count, likedByMe: r.liked });
      } else {
        setLiked((prev) => {
          const back = new Set(prev);
          if (toLiked) back.delete(photo.id);
          else back.add(photo.id);
          return back;
        });
        notify('Could not update like. Check internet.');
      }
    })();
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
    'flex items-center justify-center gap-1.5 h-8 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer';

  return (
    <div className="space-y-3 max-w-3xl mx-auto">
      {/* New Post — opens this trip's composer (posts stay in this trip) */}
      {!composerOpen && (
        <button
          onClick={() => setComposerOpen(true)}
          className="w-full h-11 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Plus size={15} strokeWidth={2.5} /> New post
        </button>
      )}
      {/* Upload strip — Post dabate hi Timeline + upar progress, complete hote hi feed me */}
      {upload && !composerOpen && (
        <div className="bg-white rounded-2xl border border-slate-200 px-3.5 py-2.5 flex items-center gap-3">
          <img src={upload.preview} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-slate-700">
              {upload.stage === 'done' ? (
                <span className="flex items-center gap-1 text-emerald-600"><Check size={13} strokeWidth={3} /> Posted</span>
              ) : upload.stage === 'compressing' ? (
                `Uploading ${formatBytes(upload.originalBytes)}…`
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
          </div>
        </div>
      )}
      {/* Composer NEW PAGE — + FAB opens this full screen (own header + Post). Timeline stays behind. */}
      {composerOpen && (
      <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col">
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200 flex-shrink-0">
          <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setComposerOpen(false)}
              aria-label="Back"
              title="Back"
              className="p-1.5 -ml-1 rounded-full text-slate-700 hover:text-indigo-600 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <h4 className="text-sm font-extrabold text-slate-900 flex-1">New moment</h4>
            <button
              type="button"
              onClick={() => void postMoment()}
              disabled={!canPost}
              className="px-5 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold transition-all active:scale-[0.98] cursor-pointer"
            >
              {posting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-3xl mx-auto w-full px-4 py-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 space-y-2">
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write a caption… (photo optional)"
              rows={2}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none"
            />
            {staged && (
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-2.5 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setCropModalOpen(true)}
                  title="Edit crop"
                  className="flex-shrink-0 rounded-lg overflow-hidden border border-slate-200 cursor-pointer"
                >
                  <img
                    src={croppedPreview ?? staged.preview}
                    alt=""
                    className="w-16 h-16 object-cover"
                  />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-slate-700">
                    {croppedFile ? 'Cropped — ready to post' : 'Photo attached'}
                  </p>
                  <div className="flex gap-2 mt-1.5">
                    <button
                      type="button"
                      onClick={() => setCropModalOpen(true)}
                      className="px-3 h-8 rounded-lg text-[11px] font-bold bg-white border border-slate-200 text-indigo-600 hover:border-indigo-300 transition-colors cursor-pointer"
                    >
                      Edit crop
                    </button>
                    <button
                      type="button"
                      onClick={removeStaged}
                      aria-label="Remove photo"
                      className="px-3 h-8 rounded-lg text-[11px] font-bold text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                className="flex-1 h-11 rounded-xl border border-dashed border-slate-300 hover:border-indigo-400 text-slate-500 hover:text-indigo-600 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <ImagePlus size={16} /> {staged ? 'Change photo' : 'Add photo'}
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { stageFile(e.target.files); e.target.value = ''; }} />

        {/* Upload progress → success (runs inside the page; top strip covers closed state) */}
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
      </div>
          </div>
        </div>
      </div>
      )}

      {/* Live server DB meter (local-dev only — never rendered in prod, standalone) */}
      {SHOW_DEBUG_METER && (
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5">
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
      )}

      {/* Crop POPUP — Apple-dark skin, photo centered + big, custom cropper (no library) */}
      {staged && cropModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-neutral-950/80">
          <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-[0_32px_64px_-12px_rgba(0,0,0,0.6)]">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-800">
              <button
                type="button"
                onClick={removeStaged}
                className="text-sm font-medium text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <h4 className="text-base font-semibold text-neutral-100 tracking-tight">Crop photo</h4>
              <button
                type="button"
                onClick={() => void confirmCrop()}
                className="px-5 py-1.5 bg-white hover:bg-neutral-200 text-neutral-950 text-sm font-semibold rounded-full active:scale-95 transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
            <div className="flex items-center justify-center bg-neutral-950 p-4 select-none" style={{ minHeight: 320 }}>
              <FreeCropper
                src={staged.preview}
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

      {/* Moments feed — normal cards or Instagram grid (same toggle as main) */}
      {photos.length > 0 && (
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-extrabold text-slate-900">Moments · {photos.length}</h3>
          <button
            onClick={() => setFeedView((v) => (v === 'normal' ? 'grid' : 'normal'))}
            aria-label="Toggle view"
            title={feedView === 'normal' ? 'Grid view' : 'Normal view'}
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-indigo-600 hover:border-indigo-300 cursor-pointer"
          >
            {feedView === 'normal' ? <LayoutGrid size={15} /> : <List size={15} />}
          </button>
        </div>
      )}
      {feedView === 'grid' ? (
        <div className="grid grid-cols-3 gap-1.5">
          {photos.map((p) => (
            <MomentGridCell key={p.id} photo={p} onOpen={() => setDetail(p)} />
          ))}
        </div>
      ) : (
      photos.map((photo) => {
        const isLiked = photo.likedByMe ?? liked.has(photo.id);
        const isSaved = saved.has(photo.id);
        const isOwner = photo.uploadedByMemberId === myMemberId;
        // LIVE display name: resolve from current trip members (uid first),
        // so a profile rename propagates everywhere instead of freezing at post.
        const liveAuthor =
          (photo.uploadedByUid &&
            trip.members.find((m) => m.uid === photo.uploadedByUid)?.name) ||
          trip.members.find((m) => m.id === photo.uploadedByMemberId)?.name ||
          photo.uploadedByName ||
          'Someone';
        const photoComments = comments[photo.id] ?? [];
        const commentsOpen = openComments === photo.id;
        const menuOpen = menuOpenId === photo.id;
        const editing = editingCaption?.id === photo.id;
        return (
          <article key={photo.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2.5">
              <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-extrabold flex-shrink-0">
                {(liveAuthor || 'M').trim().charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1">
                  <span className="block text-xs font-bold text-slate-900 truncate">{liveAuthor}</span>
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
                            // Offline failure queues a retry (outbox flushed on next good poll).
                            void deleteMomentRemote(photo.id)
                              .catch(() => queueTombstone(photo.id));
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
              <MomentPhoto
                srcRef={photo.localRef || photo.url}
                alt={photo.caption || 'Trip moment'}
                aspect={photo.aspect}
              />
            ) : null}
            <div className="px-3.5 py-3">
              <div className="flex items-center gap-4">
                <DandelionLike
                  liked={isLiked}
                  count={Number(photo.likesCount || 0)}
                  onToggle={() => toggleLike(photo)}
                />
                <button onClick={() => setOpenComments(commentsOpen ? null : photo.id)} aria-label="Comments" className={iconBtn}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="block">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641l-.318 1.235c-.149.574.419 1.1 1.025.92l1.647-.489a1.692 1.692 0 011.53.284C10.42 20.106 11.2 20.25 12 20.25z" />
                  </svg>
                  {photoComments.length > 0 && (
                    <span className="text-[11px] font-bold leading-none">{formatCount(photoComments.length)}</span>
                  )}
                </button>
                <button onClick={() => shareToInstagram(photo)} aria-label="Share" className={iconBtn}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="block" style={{ transform: 'translateY(2px)' }}>
                    <path d="m22 2-7 20-4-9-9-4Z" />
                    <path d="M22 2 11 13" />
                  </svg>
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
                    <button
                      onClick={() => addComment(photo.id)}
                      aria-label="Send comment"
                      title="Send"
                      className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="block">
                        <path d="m22 2-7 20-4-9-9-4Z" />
                        <path d="M22 2 11 13" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </article>
        );
        })
      )}
      {detail && (
        <PostDetailModal
          photo={detail}
          trips={[trip]}
          myUid={myUid}
          myName={myName}
          notify={notify}
          onClose={() => setDetail(null)}
          onOpenTrip={() => setDetail(null)}
          onDeleted={(id) => {
            onDeletePhoto(id);
            setDetail(null);
          }}
          onLiked={(id, count, likedByMe) => {
            onUpdatePhoto({ ...detail, id, likesCount: count, likedByMe });
            setDetail((d) => (d && d.id === id ? { ...d, likesCount: count, likedByMe } : d));
          }}
          onEdited={(updated) => {
            onUpdatePhoto(updated);
            setDetail((d) => (d && d.id === updated.id ? { ...d, ...updated } : d));
          }}
        />
      )}
      {photos.length === 0 && !composerOpen && (
        <div className="text-center py-10">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto mb-3">
            <ImagePlus size={22} className="text-indigo-400" />
          </div>
          <p className="text-xs font-bold text-slate-700">No moments yet</p>
          <p className="text-[11px] text-slate-400 font-medium mt-1">Tap New post above to share the first moment of this trip.</p>
        </div>
      )}
    </div>
  );
};

export default TripMomentsView;
