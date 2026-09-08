/**
 * File → dataURL helper with automatic image downscaling.
 * Raw phone photos (3–8MB) as dataURLs burst the ~5MB localStorage quota
 * and crash the save — so images are resized (max 1280px, JPEG ~0.82)
 * while PDFs/CSVs/other files pass through untouched.
 */

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through to <img> fallback
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function fileToDataUrl(file: File, maxDim = 1280, quality = 0.82): Promise<string> {
  if (!file.type.startsWith('image/')) return readAsDataUrl(file);
  // Tiny images (icons etc.) — keep original bytes
  if (file.size < 300 * 1024) return readAsDataUrl(file);
  try {
    const bmp = await decodeImage(file);
    const w = (bmp as ImageBitmap).width ?? (bmp as HTMLImageElement).naturalWidth;
    const h = (bmp as ImageBitmap).height ?? (bmp as HTMLImageElement).naturalHeight;
    if (!w || !h) return readAsDataUrl(file);
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return readAsDataUrl(file);
    ctx.drawImage(bmp as CanvasImageSource, 0, 0, cw, ch);
    if (bmp instanceof ImageBitmap) bmp.close();
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return readAsDataUrl(file);
  }
}
