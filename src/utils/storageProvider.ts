import {
  loadTripsData,
  loadExpensesData,
  loadRemindersData,
  loadDocumentsData,
  loadPhotosData,
} from './storage';
import { resolveMedia } from './mediaStore';

/**
 * Storage abstraction (local-first).
 * Today every method works on the phone's offline store.
 * Tomorrow the same interface gets a CloudProvider (Supabase/R2)
 * without touching any UI — buckets per trip, quota, archive stay identical.
 */

export interface TripUsage {
  bytes: number;
  photos: number;
  docs: number;
}

export function getTripUsage(tripId: string): TripUsage {
  const photos = loadPhotosData().filter((p) => p.tripId === tripId);
  const docs = loadDocumentsData().filter((d) => d.tripId === tripId);
  const bytes = JSON.stringify(photos).length + JSON.stringify(docs).length;
  return { bytes, photos: photos.length, docs: docs.length };
}

export function formatMB(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** Full trip bundle with REAL bytes (pointers resolved) as a backup file. */
export async function buildTripBundle(tripId: string): Promise<string> {
  const trip = loadTripsData().find((t) => t.id === tripId);
  const photos = await Promise.all(
    loadPhotosData()
      .filter((p) => p.tripId === tripId)
      .map(async (p) => ({ ...p, url: await resolveMedia(p.url) }))
  );
  const documents = await Promise.all(
    loadDocumentsData()
      .filter((d) => d.tripId === tripId)
      .map(async (d) => ({
        ...d,
        previewUrl: d.previewUrl ? await resolveMedia(d.previewUrl) : d.previewUrl,
        fileUrl: d.fileUrl ? await resolveMedia(d.fileUrl) : d.fileUrl,
        stayPhotos: d.stayPhotos ? await Promise.all(d.stayPhotos.map((s) => resolveMedia(s))) : d.stayPhotos,
      }))
  );
  const bundle = {
    app: 'WanderSync',
    version: 2,
    exportedAt: new Date().toISOString(),
    trip: trip ? { ...trip, coverImage: await resolveMedia(trip.coverImage) } : trip,
    expenses: loadExpensesData().filter((e) => e.tripId === tripId),
    reminders: loadRemindersData().filter((r) => r.tripId === tripId),
    documents,
    photos,
  };
  return JSON.stringify(bundle);
}

export function downloadTextFile(filename: string, content: string, mime = 'application/json'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Local browser budget (~5MB). IndexedDB godown budget is device-sized (GBs). */
export const LOCAL_BUDGET_BYTES = 5 * 1024 * 1024;
/** Godown budget shown on the meter (device store — grows with free space). */
export const GODOWN_BUDGET_BYTES = 1024 * 1024 * 1024;
