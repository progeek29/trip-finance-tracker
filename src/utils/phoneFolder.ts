import { Directory, Filesystem } from '@capacitor/filesystem';
import { isNativeApp } from './nativeBridge';

/**
 * Phone folder mirror: Documents/WanderSync/<trip>/ — visible in the
 * Files app, deletable from there. Web pe kuch nahi hota (silent no-op).
 */

const ROOT = 'WanderSync';

function safeName(s: string): string {
  return (s || 'file').replace(/[^a-z0-9._-]+/gi, '_').slice(0, 60) || 'file';
}

function extFor(dataUrl: string, fallbackName?: string): string {
  if (fallbackName && /\.[a-z0-9]{2,5}$/i.test(fallbackName)) return '';
  if (dataUrl.startsWith('data:image/jpeg')) return '.jpg';
  if (dataUrl.startsWith('data:image/png')) return '.png';
  if (dataUrl.startsWith('data:image/webp')) return '.webp';
  if (dataUrl.startsWith('data:application/pdf')) return '.pdf';
  if (dataUrl.startsWith('data:text/csv')) return '.csv';
  return '.bin';
}

function base64Of(dataUrl: string): string {
  const i = dataUrl.indexOf(',');
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

/** Returns stored path (save it on the entity for later delete). */
export async function saveToPhoneFolder(
  tripName: string,
  entityId: string,
  dataUrl: string,
  fileName?: string
): Promise<string | null> {
  if (!isNativeApp() || !dataUrl.startsWith('data:')) return null;
  try {
    const name = fileName && /\.[a-z0-9]{2,5}$/i.test(fileName)
      ? `${safeName(entityId)}_${safeName(fileName)}`
      : `${safeName(entityId)}${extFor(dataUrl, fileName)}`;
    const path = `${ROOT}/${safeName(tripName)}/${name}`;
    await Filesystem.writeFile({
      path,
      data: base64Of(dataUrl),
      directory: Directory.Documents,
      recursive: true,
    });
    return path;
  } catch {
    return null;
  }
}

export async function deleteFromPhoneFolder(path: string | null | undefined): Promise<void> {
  if (!isNativeApp() || !path) return;
  try {
    await Filesystem.deleteFile({ path, directory: Directory.Documents });
  } catch { /* already gone */ }
}

export async function deleteManyFromPhoneFolder(paths: (string | null | undefined)[]): Promise<void> {
  await Promise.all(paths.map(deleteFromPhoneFolder));
}
