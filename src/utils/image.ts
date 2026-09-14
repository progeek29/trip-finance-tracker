/**
 * File → dataURL helper with aggressive client-side compression.
 * A 10MB phone photo dies on free-tier storage (and used to burst the old
 * ~5MB localStorage quota) — so images are crushed BEFORE upload, the way
 * Instagram/WhatsApp do it:
 * 1) high-quality downscale (smoothing HIGH — the default 'low' blurs faces),
 * 2) strip EXIF/metadata via canvas redraw,
 * 3) encode AVIF where supported (30–50% smaller than WebP at the same look),
 *    else WebP, else JPEG,
 * 4) resolution-first ladder: keep quality HIGH (never mushy) and shrink
 *    dimensions instead — a 1280px shot at q0.72 looks identical to the
 *    original on any phone, while 960px at q0.2 (the old way) melts faces.
 * Rule: smallest bytes that still look like the original — quality first.
 */

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through to <img> fallback
    }
  }
  try {
    const url = URL.createObjectURL(file);
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

function imageDims(bmp: ImageBitmap | HTMLImageElement): { w: number; h: number } {
  const w = (bmp as ImageBitmap).width ?? (bmp as HTMLImageElement).naturalWidth;
  const h = (bmp as ImageBitmap).height ?? (bmp as HTMLImageElement).naturalHeight;
  return { w: w || 0, h: h || 0 };
}

function supportsWebp(): boolean {
  return encodable('image/webp');
}

function encodable(type: string): boolean {
  try {
    return document.createElement('canvas').toDataURL(type).startsWith(`data:${type}`);
  } catch {
    return false;
  }
}

/**
 * A produced URL is only usable if it is a real image payload.
 * Blank/corrupt encodes (`data:,`, stubs) must NEVER reach storage —
 * a blank photo is worse than a big one. Floor scales with target so a
 * genuine tiny icon still passes but an empty encode never does.
 */
function usableImageUrl(url: string, minBytes: number): boolean {
  if (!url.startsWith('data:image/')) return false;
  return Math.round(url.length * 0.75) >= minBytes;
}

/** Confirm the bytes actually decode to pixels (catches corrupt encodes). */
function verifyDecodable(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const el = new Image();
      const timer = window.setTimeout(() => resolve(false), 3000);
      el.onload = () => {
        window.clearTimeout(timer);
        resolve((el.naturalWidth || 0) > 0 && (el.naturalHeight || 0) > 0);
      };
      el.onerror = () => {
        window.clearTimeout(timer);
        resolve(false);
      };
      el.src = url;
    } catch {
      resolve(false);
    }
  });
}

export interface CompressStats {
  url: string;
  /** Final bytes (approx — dataURL length * 3/4). */
  bytes: number;
  format: 'avif' | 'webp' | 'jpeg' | 'raw';
}

/**
 * Crush an image toward `targetKB` WITHOUT visibly hurting it:
 * resolution drops first, quality never goes below its floor.
 * Best-effort — heavy files bottom out at the smallest rung.
 */
/**
 * Crush an image toward `targetKB` WITHOUT visibly hurting it.
 * Encoder order (best quality-per-byte first):
 *   1) libavif via WASM (Squoosh-grade — same tech Instagram-class tools use),
 *   2) MozJPEG via WASM, 3) browser canvas ladder. First two load on demand
 *      (code-split, cached after first use); any failure falls through.
 * Resolution drops before quality ever goes below its floor.
 *
 * Honest numbers: size is content-dependent, and beyond ~60-70KB extra
 * bytes buy almost nothing visible at feed sizes (verified side-by-side).
 * Default target is 70KB (still a ~99.2% cut on a 9MB original).
 * Best-effort — heavy files bottom out at the smallest rung.
 */

// WASM codec glue (lazy, code-split — main bundle stays lean).
// NOTE: we import the single-thread glue directly + init it with our own
// compiled module. The packages' own init() would pick the multithread
// build on desktop (needs worker files + COOP/COEP headers we don't send),
// and Vite can't bundle that worker graph — so we bypass it on purpose.
type WasmEncodeFn = (pixels: ImageData, quality: number) => Promise<ArrayBuffer>;

async function compileWasm(url: string): Promise<WebAssembly.Module> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`wasm ${res.status}`);
  return WebAssembly.compile(await res.arrayBuffer());
}

let avifEncoder: WasmEncodeFn | null | undefined;
async function getAvifEncoder(): Promise<WasmEncodeFn | null> {
  if (avifEncoder !== undefined) return avifEncoder;
  try {
    const [glue, utils, meta] = await Promise.all([
      import('@jsquash/avif/codec/enc/avif_enc.js'),
      import('@jsquash/avif/utils.js'),
      import('@jsquash/avif/meta.js'),
    ]);
    const compiled = await compileWasm('/codec/avif_enc.wasm');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await (utils.initEmscriptenModule(glue.default, compiled) as Promise<any>);
    avifEncoder = async (pixels, quality) => {
      const out = mod.encode(
        new Uint8Array(pixels.data.buffer),
        pixels.width,
        pixels.height,
        { ...(meta.defaultOptions as object), quality, speed: 6 }
      );
      if (!out) throw new Error('avif encode failed');
      return out.buffer as ArrayBuffer;
    };
  } catch {
    avifEncoder = null;
  }
  return avifEncoder;
}

let jpegEncoder: WasmEncodeFn | null | undefined;
async function getMozJpegEncoder(): Promise<WasmEncodeFn | null> {
  if (jpegEncoder !== undefined) return jpegEncoder;
  try {
    const [glue, utils, meta] = await Promise.all([
      import('@jsquash/jpeg/codec/enc/mozjpeg_enc.js'),
      import('@jsquash/jpeg/utils.js'),
      import('@jsquash/jpeg/meta.js'),
    ]);
    const compiled = await compileWasm('/codec/mozjpeg_enc.wasm');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await (utils.initEmscriptenModule(glue.default, compiled) as Promise<any>);
    jpegEncoder = async (pixels, quality) => {
      const out = mod.encode(
        pixels.data,
        pixels.width,
        pixels.height,
        { ...(meta.defaultOptions as object), quality }
      );
      if (!out) throw new Error('jpeg encode failed');
      // wasm can't run on SharedArrayBuffers — hard-cast like upstream does.
      return (out.buffer as ArrayBuffer).slice(0);
    };
  } catch {
    jpegEncoder = null;
  }
  return jpegEncoder;
}

function arrayBufferToDataUrl(buf: ArrayBuffer, mime: string): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let o = 0; o < bytes.length; o += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(o, o + CHUNK));
  }
  return `data:${mime};base64,${btoa(bin)}`;
}

export async function compressImage(
  file: File,
  opts?: { maxDim?: number; targetKB?: number }
): Promise<CompressStats> {
  const raw = () => readAsDataUrl(file).then((url) => ({ url, bytes: file.size, format: 'raw' as const }));
  if (!file.type.startsWith('image/')) return raw();
  // Small files are already harmless — keep original bytes (no quality loss).
  if (file.size < 150 * 1024) return raw();

  const startDim = opts?.maxDim ?? 1600;
  const targetBytes = (opts?.targetKB ?? 70) * 1024;
  try {
    const bmp = await decodeImage(file);
    if (!bmp) return raw();
    const { w, h } = imageDims(bmp);
    if (!w || !h) return raw();

    // Resolution-first: biggest dimensions at the highest fitting quality wins.
    const dims = [startDim, 1280, 1080, 960].filter((d, i, a) => d <= Math.max(w, h) && a.indexOf(d) === i);
    if (dims.length === 0) dims.push(Math.max(w, h));

    const canvas = document.createElement('canvas');
    // Wide-gamut first: modern phone cameras shoot Display P3. A default
    // canvas silently flattens everything to sRGB (washed skin tones).
    // Request P3; unsupported browsers ignore it and fall back to sRGB.
    const ctxOptions = { willReadFrequently: true, colorSpace: 'display-p3' } as CanvasRenderingContext2DSettings;
    const ctx = canvas.getContext('2d', ctxOptions) ?? canvas.getContext('2d');
    if (!ctx) return raw();
    // THE fix for soft faces: default smoothing is 'low' (bilinear mush).
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Two-step downscale: huge ratios (4000px → 1600px) in ONE jump smear
    // fine detail. Halving first, then landing on target, keeps edges crisp —
    // the same reason Instagram resizes in stages, not one shot.
    const drawStepped = (src: CanvasImageSource, sw: number, sh: number, dw: number, dh: number) => {
      let cw = sw;
      let ch = sh;
      // Stage intermediate canvases while the jump is bigger than 2x.
      const step = document.createElement('canvas');
      const sctx = step.getContext('2d', ctxOptions) ?? step.getContext('2d');
      let from: CanvasImageSource = src;
      if (sctx) {
        while (cw / 2 > dw * 1.5 && ch / 2 > dh * 1.5) {
          cw = Math.round(cw / 2);
          ch = Math.round(ch / 2);
          step.width = cw;
          step.height = ch;
          // Resizing resets context state — re-arm every step.
          sctx.imageSmoothingEnabled = true;
          sctx.imageSmoothingQuality = 'high';
          sctx.drawImage(from, 0, 0, cw, ch);
          from = step;
        }
      }
      canvas.width = dw;
      canvas.height = dh;
      // NOTE: resizing a canvas resets its context state — re-arm smoothing.
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(from, 0, 0, dw, dh);
      // Gentle post-resize punch (what Instagram's sharpen pass does):
      // barely-there contrast/saturation lift so faces don't look washed.
      try {
        ctx.filter = 'contrast(1.02) saturate(1.05)';
        ctx.drawImage(canvas, 0, 0);
        ctx.filter = 'none';
      } catch {
        ctx.filter = 'none';
      }
    };

    const minBytes = Math.max(8 * 1024, Math.round(targetBytes * 0.05));
    let smallest: CompressStats | null = null;
    const consider = (stats: CompressStats) => {
      if (!usableImageUrl(stats.url, minBytes)) return false;
      if (!smallest || stats.bytes < smallest.bytes) smallest = stats;
      return stats.bytes <= targetBytes;
    };

    // ── Stage 1: libavif (WASM). q50 ≈ transparent at feed sizes. ──
    const avif = await getAvifEncoder();
    if (avif) {
      try {
        for (const dim of dims) {
          const scale = Math.min(1, dim / Math.max(w, h));
          drawStepped(bmp as CanvasImageSource, w, h, Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
          for (const q of [52, 46, 40]) {
            const buf = await avif(pixels, q);
            const bytes = buf.byteLength;
            if (bytes < minBytes) continue;
            const url = arrayBufferToDataUrl(buf, 'image/avif');
            const stats: CompressStats = { url, bytes, format: 'avif' };
            if (!smallest || bytes < smallest.bytes) smallest = stats;
            if (bytes <= targetBytes) {
              if (bmp instanceof ImageBitmap) bmp.close();
              if (await verifyDecodable(url)) return stats;
            }
          }
          // Biggest dims already sharp — don't grind smaller ones in WASM
          // unless nothing usable yet.
          if (smallest && smallest.bytes <= targetBytes * 1.5) break;
        }
      } catch {
        /* fall through to MozJPEG */
      }
    }

    // ── Stage 2: MozJPEG (WASM). ──
    const moz = await getMozJpegEncoder();
    if (moz) {
      try {
        for (const dim of dims) {
          const scale = Math.min(1, dim / Math.max(w, h));
          drawStepped(bmp as CanvasImageSource, w, h, Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
          for (const q of [78, 70, 62]) {
            const buf = await moz(pixels, q);
            const bytes = buf.byteLength;
            const url = arrayBufferToDataUrl(buf, 'image/jpeg');
            if (consider({ url, bytes, format: 'jpeg' })) {
              if (bmp instanceof ImageBitmap) bmp.close();
              if (await verifyDecodable(url)) return { url, bytes, format: 'jpeg' };
            }
          }
          if (smallest && smallest.bytes <= targetBytes * 1.5) break;
        }
      } catch {
        /* fall through to canvas */
      }
    }

    // ── Stage 3: browser canvas ladder (always available). ──
    const formats: { type: string; format: CompressStats['format']; ladder: number[] }[] = [];
    if (supportsWebp()) formats.push({ type: 'image/webp', format: 'webp', ladder: [0.8, 0.72, 0.65, 0.58] });
    formats.push({ type: 'image/jpeg', format: 'jpeg', ladder: [0.86, 0.8, 0.74, 0.68] });
    for (const dim of dims) {
      const scale = Math.min(1, dim / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      drawStepped(bmp as CanvasImageSource, w, h, cw, ch);
      for (const f of formats) {
        for (const q of f.ladder) {
          const url = canvas.toDataURL(f.type, q);
          // Reject stubs/empties immediately — never let a blank win.
          if (!usableImageUrl(url, minBytes)) continue;
          const bytes = Math.round(url.length * 0.75);
          const stats: CompressStats = { url, bytes, format: f.format };
          if (!smallest || bytes < smallest.bytes) smallest = stats;
          if (bytes <= targetBytes) {
            if (bmp instanceof ImageBitmap) bmp.close();
            // Final gate: bytes must decode to real pixels.
            if (await verifyDecodable(url)) return stats;
          }
        }
      }
    }
    if (bmp instanceof ImageBitmap) bmp.close();
    // Smallest VALID encode wins; if nothing valid, original bytes (big but correct).
    if (smallest && (await verifyDecodable(smallest.url))) return smallest;
    return raw();
  } catch {
    return raw();
  }
}

/** Back-compat: file → dataURL string (compressed when it matters). */
export async function fileToDataUrl(file: File, maxDim = 1600, quality = 0.72): Promise<string> {
  if (!file.type.startsWith('image/')) return readAsDataUrl(file);
  if (file.size < 150 * 1024) return readAsDataUrl(file);
  try {
    // Map legacy quality onto the ladder by trying it first.
    const bmp = await decodeImage(file);
    if (!bmp) return readAsDataUrl(file);
    const { w, h } = imageDims(bmp);
    if (!w || !h) return readAsDataUrl(file);
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return readAsDataUrl(file);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp as CanvasImageSource, 0, 0, cw, ch);
    if (bmp instanceof ImageBitmap) bmp.close();
    if (encodable('image/avif')) return canvas.toDataURL('image/avif', Math.min(quality, 0.55));
    const webp = supportsWebp();
    return canvas.toDataURL(webp ? 'image/webp' : 'image/jpeg', quality);
  } catch {
    return readAsDataUrl(file);
  }
}
