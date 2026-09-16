import React, { useEffect, useState } from 'react';
import { MediaImg, useMediaUrl } from '../common/MediaImg';

/**
 * Feed photo frame — matches the SAVED crop aspect (Insta rule: editor bounds
 * == feed frame, so the photo always fills 100%: no cut, no cramp, no bars).
 * Legacy rows without aspect fall back to measuring once, then 4:5.
 */
export const MomentPhoto: React.FC<{
  srcRef: string | undefined;
  alt: string;
  aspect?: number;
}> = ({ srcRef, alt, aspect }) => {
  const url = useMediaUrl(srcRef);
  const [measured, setMeasured] = useState<number | null>(null);

  useEffect(() => {
    if (!url || aspect) return;
    setMeasured(null);
    let live = true;
    const el = new Image();
    el.onload = () => {
      if (live && el.naturalWidth && el.naturalHeight) {
        setMeasured(el.naturalWidth / el.naturalHeight);
      }
    };
    el.src = url;
    return () => {
      live = false;
    };
  }, [url, aspect]);

  if (!url) return null;
  // Saved aspect wins (canvas ground truth). Sanity-clamp to the crop bounds.
  const raw = aspect || measured || 0.8;
  const frame = Math.min(1.91, Math.max(0.8, raw));
  return (
    <span
      className="relative block w-full overflow-hidden bg-slate-950"
      style={{ aspectRatio: `${frame}` }}
    >
      <MediaImg
        srcRef={srcRef}
        alt=""
        className="absolute inset-0 w-full h-full object-cover blur-2xl brightness-[0.6] scale-110 pointer-events-none"
      />
      <MediaImg
        srcRef={srcRef}
        alt={alt}
        className="absolute inset-0 w-full h-full object-contain"
      />
    </span>
  );
};

export default MomentPhoto;
