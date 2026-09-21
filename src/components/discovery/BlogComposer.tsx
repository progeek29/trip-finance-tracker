import React, { useEffect, useRef, useState } from 'react';
import { X, ImagePlus, Check } from 'lucide-react';
import { MediaImg } from '../common/MediaImg';
import { compressImage } from '../../utils/image';
import { saveMoment } from '../../utils/momentsSync';
import { FreeCropper, type CropPct } from '../trip/FreeCropper';
import {
  createBlog,
  updateBlog,
  submitBlog,
  fetchBlog,
  saveDraft,
  deleteDraft,
  listDrafts,
  BLOG_TAGS,
  type BlogTag,
  type BlogPost,
} from '../../utils/blogs';
import type { SharedPhoto } from '../../types';

interface BlogComposerProps {
  myUid: string;
  myName: string;
  /** Resume a local draft or edit a server blog. */
  draftId?: string;
  blogId?: string;
  notify: (msg: string) => void;
  onClose: () => void;
  onSaved: (blogId: string, status: string) => void;
}

/** Blog composer (full page): title + body + cover + tag, draft autosave
 *  (crash/battery/network-proof via localStorage), moments attach, submit. */
export const BlogComposer: React.FC<BlogComposerProps> = ({
  myUid,
  myName,
  draftId,
  blogId,
  notify,
  onClose,
  onSaved,
}) => {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [tag, setTag] = useState<BlogTag>('journal');
  const [serverId, setServerId] = useState<string | undefined>(blogId);
  const [status, setStatus] = useState<string>('draft');
  const [busy, setBusy] = useState(false);
  const [savedTick, setSavedTick] = useState<number | null>(null);
  const localId = useRef(draftId || `draft_${Date.now().toString(36)}`);
  const coverFileRef = useRef<HTMLInputElement>(null);
  const [coverBusy, setCoverBusy] = useState(false);

  // Cover crop staging (same FreeCropper popup as moments).
  const [coverStaged, setCoverStaged] = useState<{ file: File; preview: string } | null>(null);
  const [coverCrop, setCoverCrop] = useState<CropPct | undefined>(undefined);
  const [coverCropDone, setCoverCropDone] = useState<CropPct | null>(null);
  const [coverCropOpen, setCoverCropOpen] = useState(false);

  const stageCover = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      notify('Please pick an image file');
      return;
    }
    if (coverStaged) URL.revokeObjectURL(coverStaged.preview);
    setCoverStaged({ file, preview: URL.createObjectURL(file) });
    setCoverCrop(undefined);
    setCoverCropDone(null);
    setCoverCropOpen(true);
  };

  // Cover upload: crop cut → same HD pipeline as moments (compress ladder),
  // saved as a trip-less moment so it renders everywhere covers render.
  const uploadCoverCut = async () => {
    if (!coverStaged || coverBusy) return;
    setCoverBusy(true);
    try {
      let file = coverStaged.file;
      const pc = coverCropDone;
      if (pc && pc.width && pc.height) {
        const full = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = reject;
          el.src = coverStaged.preview;
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
          if (cut) file = new File([cut], 'cover.png', { type: 'image/png' });
        }
      }
      const stats = await compressImage(file, { maxDim: 1600 });
      if (!stats.url.startsWith('data:')) {
        notify('Could not read that image');
        return;
      }
      const blob = await (await fetch(stats.url)).blob();
      const photo: SharedPhoto = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        tripId: '',
        url: '',
        caption: title.trim() || 'Blog cover',
        uploadedByMemberId: myUid,
        uploadedByName: myName,
        uploadedByUid: myUid,
        uploadedAt: new Date().toISOString(),
        likesCount: 0,
      };
      const saved = await saveMoment(photo, blob, myUid, { blogCover: true });
      if (!saved?.url) {
        notify('Upload failed. Check internet.');
        return;
      }
      setCoverUrl(saved.url);
      setCoverCropOpen(false);
      if (coverStaged) URL.revokeObjectURL(coverStaged.preview);
      setCoverStaged(null);
      notify('Cover uploaded.');
    } catch {
      notify('Upload failed. Check internet.');
    } finally {
      setCoverBusy(false);
    }
  };

  // Load server blog (edit) or resume a local draft (crash-safe).
  useEffect(() => {
    if (!blogId && draftId) {
      const d = listDrafts().find((x) => x.id === draftId);
      if (d) {
        setTitle(d.title);
        setBody(d.body);
        setCoverUrl(d.coverUrl);
        setTag(d.tag);
        if (d.blogId) setServerId(d.blogId);
      }
    }
    if (!blogId) return;
    let live = true;
    fetchBlog(blogId).then((b) => {
      if (!live || !b) return;
      setTitle(b.title || '');
      setBody(b.body || '');
      setCoverUrl(b.coverUrl || '');
      setTag((b.tag as BlogTag) || 'journal');
      setStatus(b.status);
    });
    return () => {
      live = false;
    };
  }, [blogId]);

  // Autosave local draft on every change (debounced 1s).
  const saveTimer = useRef<number | null>(null);
  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (!title.trim() && !body.trim()) return;
    saveTimer.current = window.setTimeout(() => {
      saveDraft({ id: localId.current, title, body, coverUrl, tag, blogId: serverId, updatedAt: Date.now() });
      setSavedTick(Date.now());
    }, 1000);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [title, body, coverUrl, tag, serverId]);

  const persist = async (submit: boolean): Promise<void> => {
    // Drafts save with whatever exists (title optional); submit needs title.
    if (busy) return;
    if (submit && !title.trim()) {
      notify('Add a title before submitting for review.');
      return;
    }
    if (!title.trim() && !body.trim()) {
      notify('Write something first.');
      return;
    }
    const safeTitle = title.trim() || '(untitled)';
    setBusy(true);
    try {
      let id = serverId;
      if (!id) {
        const r = await createBlog({ title: safeTitle, body, coverUrl, tag });
        id = r.id;
        setServerId(id);
      } else {
        await updateBlog(id, { title: safeTitle, body, coverUrl, tag });
      }
      if (submit) {
        // Editing an already-published story: PUT flips it back to pending
        // server-side — no separate submit call (it would 400).
        if (status !== 'published') {
          await submitBlog(id);
          notify('Submitted for review. Goes live after admin approval.');
        } else {
          notify('Saved — sent back for admin review.');
        }
        setStatus('pending');
      } else {
        // Was published → server already flipped it to pending (re-review).
        const backToReview = status === 'published';
        setStatus(backToReview ? 'pending' : 'draft');
        notify(backToReview ? 'Saved — sent back for admin review.' : 'Draft saved.');
      }
      deleteDraft(localId.current);
      try {
        window.dispatchEvent(new CustomEvent('ws_blogs_changed'));
      } catch { /* ignore */ }
      onSaved(id, submit ? 'pending' : 'draft');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;

  return (
    <div className="fixed inset-0 z-[70] bg-slate-50 flex flex-col" role="dialog" aria-modal="true">
      <div className="bg-white/95 backdrop-blur border-b border-slate-200 flex-shrink-0">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-2">
          <button
            onClick={onClose}
            aria-label="Back"
            className="p-1.5 -ml-1 rounded-full text-slate-700 hover:text-indigo-600 hover:bg-slate-100 cursor-pointer"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <span className="text-sm font-extrabold text-slate-900">Write story</span>
          {savedTick && (
            <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
              <Check size={12} strokeWidth={3} /> Draft autosaved
            </span>
          )}
          <span className="ml-auto text-[10px] font-bold text-slate-400">{wordCount} words</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="max-w-2xl mx-auto px-4 pt-5 pb-32 space-y-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                Story title *
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give your story a title"
                maxLength={120}
                className="w-full text-xl font-extrabold text-slate-900 placeholder-slate-400 placeholder:font-semibold bg-transparent outline-none"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
              {BLOG_TAGS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTag(t.id)}
                  className={`flex-shrink-0 h-8 px-3.5 rounded-full text-[11px] font-bold cursor-pointer ${
                    tag === t.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-50 border border-slate-200 text-slate-500'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          {/* Cover — timeline-style: tap opens the gallery directly, tap
              again to replace, X to remove. No picker section. */}
          <div>
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
              Cover <span className="normal-case font-medium text-slate-300">(optional)</span>
            </span>
            <div className="relative">
              <button
                onClick={() => coverFileRef.current?.click()}
                className="w-full h-28 rounded-2xl border-2 border-dashed border-slate-200 hover:border-indigo-300 text-slate-400 hover:text-indigo-500 flex flex-col items-center justify-center gap-1 overflow-hidden relative cursor-pointer"
              >
                {coverUrl ? (
                  <>
                    <MediaImg srcRef={coverUrl} alt="Cover" className="absolute inset-0 w-full h-full object-cover" />
                    <span className="absolute bottom-1.5 right-1.5 px-2 py-1 rounded-full bg-black/55 text-white text-[10px] font-bold">
                      Tap to replace
                    </span>
                  </>
                ) : (
                  <>
                    <ImagePlus size={22} />
                    <span className="text-[11px] font-bold">Add a cover photo</span>
                    <span className="text-[10px] font-medium text-slate-300">Tap to choose from gallery</span>
                  </>
                )}
              </button>
              <input
                ref={coverFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void stageCover(e.target.files);
                  e.target.value = '';
                }}
              />
              {coverUrl ? (
                <button
                  onClick={() => setCoverUrl('')}
                  aria-label="Remove cover"
                  title="Remove cover"
                  className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/55 text-white hover:bg-rose-600 cursor-pointer"
                >
                  <X size={13} />
                </button>
              ) : null}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
              Story *
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Share your journey — where you went, who you met, what you'd tell a friend…"
              rows={12}
              className="w-full rounded-2xl bg-white border border-slate-200 px-4 py-3 text-[15px] text-slate-800 leading-relaxed focus:outline-none focus:border-indigo-400 placeholder-slate-300 resize-y min-h-[240px]"
            />
            <p className="text-[10px] text-slate-300 font-medium mt-1 px-1">Tip: leave a blank line to start a new section.</p>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => void persist(false)}
              disabled={(!title.trim() && !body.trim()) || busy || coverBusy}
              className="flex-1 h-11 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-40 cursor-pointer"
            >
              {busy ? 'Saving…' : 'Save draft'}
            </button>
            <button
              onClick={() => void persist(true)}
              disabled={!title.trim() || busy}
              className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
            >
              {busy ? 'Sending…' : status === 'published' ? 'Save' : 'Submit for review'}
            </button>
          </div>
          {status === 'pending' && (
            <p className="text-[11px] text-amber-600 font-bold text-center">In review — live after admin approval.</p>
          )}
          {status === 'rejected' && (
            <p className="text-[11px] text-rose-500 font-bold text-center">Needs changes — edit and resubmit.</p>
          )}
        </div>
      </div>

      {/* Cover crop popup — SAME component + skin as moments */}
      {coverStaged && coverCropOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-neutral-950/80">
          <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-[0_32px_64px_-12px_rgba(0,0,0,0.6)]">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-800">
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(coverStaged.preview);
                  setCoverStaged(null);
                  setCoverCropOpen(false);
                }}
                className="text-sm font-medium text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <h4 className="text-base font-semibold text-neutral-100 tracking-tight">Crop cover</h4>
              <button
                type="button"
                onClick={() => void uploadCoverCut()}
                disabled={coverBusy}
                className="px-5 py-1.5 bg-white hover:bg-neutral-200 disabled:opacity-40 text-neutral-950 text-sm font-semibold rounded-full active:scale-95 transition-all cursor-pointer"
              >
                {coverBusy ? 'Uploading…' : 'Done'}
              </button>
            </div>
            <div className="flex items-center justify-center bg-neutral-950 p-4 select-none" style={{ minHeight: 320 }}>
              <FreeCropper
                src={coverStaged.preview}
                value={coverCrop}
                onChange={setCoverCrop}
                onComplete={setCoverCropDone}
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

export default BlogComposer;
