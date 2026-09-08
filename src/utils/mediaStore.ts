import { openDB, type IDBPDatabase } from 'idb';

/**
 * Phone ka bada godown (IndexedDB) — same offline, bas jeb badi.
 * localStorage (~5MB) me sirf text/metadata; photos/files ke bytes yahan.
 * URL fields me ya to normal URL hota hai ya `idb:<kind>:<id>` pointer.
 */

export type MediaKind = 'image' | 'file';

interface MediaRecord {
  id: string;
  tripId: string;
  kind: MediaKind;
  dataUrl: string;
  fileName?: string;
  mime?: string;
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

/** Store bytes, get back a pointer for URL fields. */
export async function putMedia(
  tripId: string,
  kind: MediaKind,
  dataUrl: string,
  opts?: { fileName?: string; mime?: string }
): Promise<string> {
  const id = uid('m');
  const rec: MediaRecord = {
    id,
    tripId,
    kind,
    dataUrl,
    fileName: opts?.fileName,
    mime: opts?.mime,
    size: dataUrl.length,
    createdAt: new Date().toISOString(),
  };
  (await db()).put(STORE, rec);
  return mediaRef(kind, id);
}

/** Pointer → real bytes (http/data URLs pass through). Missing → ''. */
export async function resolveMedia(ref: string): Promise<string> {
  if (!ref || !isMediaRef(ref)) return ref || '';
  const parsed = parseMediaRef(ref);
  if (!parsed) return '';
  const hit = await getCached(parsed.id);
  return hit?.dataUrl || '';
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

/** Total bytes + counts for one trip (meter ke liye). */
export async function getTripMediaUsage(tripId: string): Promise<{ bytes: number; files: number }> {
  const all = (await (await db()).getAllFromIndex(STORE, 'trip', tripId)) as MediaRecord[];
  return { bytes: all.reduce((a, r) => a + (r.size || 0), 0), files: all.length };
}

/** Plain read, NO resize — full quality for the big godown. */
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
  const dataUrl = await readFileAsDataUrl(file);
  const kind: MediaKind = file.type.startsWith('image/') ? 'image' : 'file';
  const ref = await putMedia(tripId, kind, dataUrl, { fileName: file.name, mime: file.type });
  return { ref, fileName: file.name };
}

/** Collect every media pointer inside docs/photos/places/trips (cleanup ke liye). */
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
