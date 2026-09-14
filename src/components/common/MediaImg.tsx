import React, { useEffect, useState } from 'react';
import { resolveMedia } from '../../utils/mediaStore';

const urlCache = new Map<string, string>();

/** Drop a cached URL (call on delete so dead blob: URLs free memory). */
export function dropCachedMediaUrl(ref: string | undefined): void {
  if (!ref) return;
  const hit = urlCache.get(ref);
  if (hit) {
    urlCache.delete(ref);
    if (hit.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(hit);
      } catch {
        /* already gone */
      }
    }
  }
}

/** Resolve an `idb:` pointer (or plain URL) for rendering. */
export function useMediaUrl(ref: string | undefined): string {
  const [url, setUrl] = useState(() => {
    if (!ref || !ref.startsWith('idb:')) return ref || '';
    return urlCache.get(ref) || '';
  });

  useEffect(() => {
    if (!ref || !ref.startsWith('idb:')) {
      setUrl(ref || '');
      return;
    };
    const hit = urlCache.get(ref);
    if (hit) {
      setUrl(hit);
      return;
    }
    let live = true;
    resolveMedia(ref).then((u) => {
      if (!live) return;
      if (u) urlCache.set(ref, u);
      setUrl(u);
    });
    return () => {
      live = false;
    };
  }, [ref]);

  return url;
}

interface MediaImgProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  srcRef: string | undefined;
  fallback?: string;
}

/** Drop-in <img> that understands IndexedDB pointers. UI same. */
export const MediaImg: React.FC<MediaImgProps> = ({ srcRef, fallback, alt, ...rest }) => {
  const url = useMediaUrl(srcRef);
  if (!url) {
    if (!fallback) return null;
    return <img src={fallback} alt={alt || ''} {...rest} />;
  }
  return <img src={url} alt={alt || ''} {...rest} />;
};
