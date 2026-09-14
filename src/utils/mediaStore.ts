import { openDB, type IDBPDatabase } from 'idb';

/**
 * The phone's large store (IndexedDB) — same offline data, much bigger pocket.
 * localStorage (~5MB) holds only text/metadata; photo/file bytes live here.
 * URL fields hold either a normal URL or an `idb:<kind>:<id>` pointer.
 *
 * Bytes are stored as binary Blobs (not base64 text) — base64 inflates every
 * file by exactly 33% (4/3). The Blob holds bit-identical bytes, so quality
 * never changes; only the storage bill shrinks. Pre-Blob records (base64 in
 * `dataUrl`) still read fine via dual-read below.
 */

export type MediaKind = 'image' | 'file';

interface MediaRecord {
  id: string;
  tripId: string;
  kind: MediaKind;
  /** Binary bytes (new records). Absent on pre-Blob records. */
  blob?: Blob;
  /** Legacy base64 text (pre-Blob records only). New writes omit this. */
  dataUrl?: string;
  fileName?: string;
  mime?: string;
  /** Real stored bytes (blob.size for new records). */
  size: number;
  createdAt: string;
}

const DB_NAME = 'wandersync';
const STORE = 'media';
let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(d) {
        const s = d.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('trip', 'tripId', { unique: false });
      },
    });
  }
  return dbPromise;
}

export function mediaRef(kind: MediaKind, id: string): string {
  return `idb:${kind}:${id}`;
}

export function parseMediaRef(ref: string): { kind: MediaKind; id: string } | null {
  const m = /^idb:(image|file):(.+)$/.exec(ref || '');
  if (!m) return null;
  return { kind: m[1] as MediaKind, id: m[2] };
}

export function isMediaRef(ref: string): boolean {
  return ref.startsWith('idb:');
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** data: URL → binary Blob (chunked so large strings never blow the stack). */
function dataUrlToBlob(dataUrl: string, fallbackMime = ''): Blob | null {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const mime = m[1] || fallbackMime || 'application/octet-stream';
  try {
    if (m[2]) {
      const bin = atob(m[3]);
      const len = bin.length;
      const bytes = new Uint8Array(len);
      const CHUNK = 0x8000;
      for (let o = 0; o < len; o += CHUNK) {
        const end = Math.min(o + CHUNK, len);
        for (let i = o; i < end; i++) bytes[i] = bin.charCodeAt(i);
      }
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(m[3])], { type: mime });
  } catch {
    return null;
  }
}

/** Store bytes, get back a pointer for URL fields. */
export async function putMedia(
  tripId: string,
  kind: MediaKind,
  dataUrl: string,
  opts?: { fileName?: string; mime?: string }
): Promise<string> {
  const id = uid('m');
  let blob: Blob | undefined;
  let legacy: string | undefined;
  let size: number;
  if (dataUrl.startsWith('data:')) {
    // Binary path: identical bytes, ~25% smaller on disk than base64 text.
    blob = dataUrlToBlob(dataUrl, opts?.mime) ?? undefined;
  }
  if (blob) {
    size = blob.size;
  } else {
    // Non-data URLs (remote http etc.) or undecodable input: legacy text path.
    legacy = dataUrl;
    size = dataUrl.length;
  }
  const rec: MediaRecord = {
    id,
    tripId,
    kind,
    blob,
    dataUrl: legacy,
    fileName: opts?.fileName,
    mime: opts?.mime,
    size,
    createdAt: new Date().toISOString(),
  };
  (await db()).put(STORE, rec);
  return mediaRef(kind, id);
}

/** Pointer → renderable URL (blob: for new records, legacy text for old). */
export async function resolveMedia(ref: string): Promise<string> {
  if (!ref || !isMediaRef(ref)) return ref || '';
  const blob = await resolveMediaBlob(ref);
  if (blob) return URL.createObjectURL(blob);
  const parsed = parseMediaRef(ref);
  if (!parsed) return '';
  const hit = await getCached(parsed.id);
  return hit?.dataUrl || '';
}

/** Pointer → binary bytes (null when missing). Old records decode on the fly. */
export async function resolveMediaBlob(ref: string): Promise<Blob | null> {
  const parsed = parseMediaRef(ref || '');
  if (!parsed) return null;
  const hit = await getCached(parsed.id);
  if (!hit) return null;
  if (hit.blob) return hit.blob;
  if (hit.dataUrl?.startsWith('data:')) return dataUrlToBlob(hit.dataUrl, hit.mime);
  return null;
}

/** Binary → data: URL (only for sinks that need text: uploads, backups, mirrors). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => resolve('');
    r.readAsDataURL(blob);
  });
}

/** Pointer → data: URL even for Blob records (backup/export path). */
export async function resolveMediaDataUrl(ref: string): Promise<string> {
  if (!ref) return '';
  if (!isMediaRef(ref)) return ref;
  const blob = await resolveMediaBlob(ref);
  if (blob) return blobToDataUrl(blob);
  return '';
}

// Tiny in-memory cache so grids don't hammer IndexedDB
const memCache = new Map<string, MediaRecord>();

async function getCached(id: string): Promise<MediaRecord | undefined> {
  const hit = memCache.get(id);
  if (hit) return hit;
  const rec = (await (await db()).get(STORE, id)) as MediaRecord | undefined;
  if (rec) {
    if (memCache.size > 400) memCache.clear();
    memCache.set(id, rec);
  }
  return rec;
}

export async function deleteMedia(ref: string): Promise<void> {
  const parsed = parseMediaRef(ref || '');
  if (!parsed) return;
  memCache.delete(parsed.id);
  (await db()).delete(STORE, parsed.id);
}

export async function deleteMediaRefs(refs: string[]): Promise<void> {
  await Promise.all(refs.map(deleteMedia));
}

/** Total bytes + counts for one trip (for the meter). */
export async function getTripMediaUsage(tripId: string): Promise<{ bytes: number; files: number }> {
  const all = (await (await db()).getAllFromIndex(STORE, 'trip', tripId)) as MediaRecord[];
  return { bytes: all.reduce((a, r) => a + (r.size || 0), 0), files: all.length };
}

/** Plain read, NO resize — full quality for the large store. */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/** Migrate one data: URL into the store (one-time, boot pe). */
export async function migrateDataUrl(
  tripId: string,
  kind: MediaKind,
  dataUrl: string,
  fileName?: string
): Promise<string> {
  if (!dataUrl.startsWith('data:')) return dataUrl;
  return putMedia(tripId, kind, dataUrl, { fileName });
}

/** Picked file → stored bytes + pointer for URL fields. */
export async function storePickedFile(
  tripId: string,
  file: File
): Promise<{ ref: string; fileName: string }> {
  // Images are crushed on-device (libavif/MozJPEG WASM, staged resize, ~70KB target)
  // BEFORE storage — a 10MB camera photo must never reach the free-tier bucket raw.
  let dataUrl: string;
  const kind: MediaKind = file.type.startsWith('image/') ? 'image' : 'file';
  if (kind === 'image') {
    try {
      const { compressImage } = await import('./image');
      dataUrl = (await compressImage(file)).url;
    } catch {
      dataUrl = await readFileAsDataUrl(file);
    }
  } else {
    dataUrl = await readFileAsDataUrl(file);
  }
  const ref = await putMedia(tripId, kind, dataUrl, { fileName: file.name, mime: file.type });
  return { ref, fileName: file.name };
}

/** Collect every media pointer inside docs/photos/places/trips (for cleanup). */
export function collectRefs(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    if (isMediaRef(value)) out.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectRefs(v, out));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((v) => collectRefs(v, out));
  }
  return out;
}
