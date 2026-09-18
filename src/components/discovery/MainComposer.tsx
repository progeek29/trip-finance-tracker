import React, { useRef, useState } from 'react';
import { X, ImagePlus, Loader2 } from 'lucide-react';
import { FreeCropper, type CropPct } from '../trip/FreeCropper';
import { compressImage } from '../../utils/image';
import { postMainMoment } from '../../utils/mainFeed';
import type { SharedPhoto } from '../../types';

interface MainComposerProps {
  myUid: string;
  myName: string;
  onPosted: (photo: SharedPhoto) => void;
  onClose: () => void;
  notify: (msg: string) => void;
}

/** Main-timeline composer (trip-less): photo optional, text-only allowed.
 *  Staging + crop = SAME flow as the trip composer (FreeCropper, PNG cut,
 *  compress ladder, aspect saved) so photo size/behavior never diverges. */
export const MainComposer: React.FC<MainComposerProps> = ({ myUid, myName, onPosted, onClose, notify }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState('');
  const [staged, setStaged] = useState<{ file: File; preview: string } | null>(null);
  const [crop, setCrop] = useState<CropPct | undefined>(undefined);
  const [completedCropPct, setCompletedCropPct] = useState<CropPct | null>(null);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [croppedFile, setCroppedFile] = useState<File | null>(null);
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);
  const [croppedAspect, setCroppedAspect] = useState<number | null>(null);
  const [posting, setPosting] = useState(false);

  const resetCrop = () => {
    setCrop(undefined);
    setCompletedCropPct(null);
    setCropModalOpen(false);
    setCroppedFile(null);
    setCroppedPreview(null);
    setCroppedAspect(null);
  };

  /** Pick → NORMALIZED file (same as trip composer: EXIF baked, max 2048px). */
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

  const removeStaged = () => {
    if (staged) URL.revokeObjectURL(staged.preview);
    if (croppedPreview) URL.revokeObjectURL(croppedPreview);
    setStaged(null);
    resetCrop();
  };

  /** Cut the confirmed box out (max 1080px) as PNG → {file, aspect} (same as trip). */
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

  const post = async () => {
    if (posting) return;
    const text = caption.trim();
    if (!text && !staged) {
      notify('Write something or add a photo');
      return;
    }
    // Confirmed cut first (same as trip composer), else cut on the fly.
    let file = croppedFile ?? staged?.file ?? null;
    let aspect = croppedAspect ?? null;
    if (staged && !croppedFile) {
      const cut = await cropStagedToFile();
      if (cut) {
        file = cut.file;
        aspect = cut.aspect;
      }
    }
    setPosting(true);
    try {
      let blob: Blob | null = null;
      if (file) {
        const stats = await compressImage(file, { maxDim: 1080 });
        if (stats.url.startsWith('data:')) {
          try {
            blob = await (await fetch(stats.url)).blob();
          } catch {
            blob = null;
          }
        }
      }
      const photo = await postMainMoment({
        caption: text,
        blob,
        aspect: aspect ?? undefined,
        myUid,
        myName,
      });
      if (!photo) {
        notify('Could not post. Check internet and retry.');
        return;
      }
      removeStaged();
      onPosted(photo);
      onClose();
    } finally {
      setPosting(false);
    }
  };

  const thumb = croppedPreview ?? staged?.preview ?? null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} />
      <div className="relative w-full sm:max-w-md max-h-[92dvh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden panel-enter">
        <div className="flex-shrink-0 flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900 font-display tracking-tight">New post · Main timeline</h3>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          <textarea
            autoFocus
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Share a travel moment…"
            rows={3}
            className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 placeholder-slate-400 resize-none"
          />
          {thumb ? (
            <div className="relative mt-3 rounded-2xl overflow-hidden border border-slate-200">
              <img src={thumb} alt="Staged" className="w-full max-h-72 object-cover" />
              <div className="absolute bottom-2 left-2 flex gap-1.5">
                <button
                  onClick={() => setCropModalOpen(true)}
                  className="px-3 h-8 rounded-full bg-black/55 text-white text-[11px] font-bold hover:bg-black/75 cursor-pointer"
                >
                  Crop
                </button>
                <button
                  onClick={removeStaged}
                  className="px-3 h-8 rounded-full bg-black/55 text-white text-[11px] font-bold hover:bg-black/75 cursor-pointer"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="mt-3 w-full h-24 rounded-2xl border-2 border-dashed border-slate-200 hover:border-indigo-300 text-slate-400 hover:text-indigo-500 flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer"
            >
              <ImagePlus size={22} />
              <span className="text-[11px] font-bold">Add photo (optional)</span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void stageFile(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        <div className="flex-shrink-0 px-5 py-3 border-t border-slate-100">
          <button
            onClick={() => void post()}
            disabled={posting || (!caption.trim() && !staged)}
            className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-bold cursor-pointer flex items-center justify-center gap-2"
          >
            {posting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>

      {/* Crop POPUP — SAME component + skin as trip composer */}
      {staged && cropModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-neutral-950/80">
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
    </div>
  );
};

export default MainComposer;
