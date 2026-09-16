import React, { useRef } from 'react';

/** Crop box in PERCENT of the displayed image (0–100, resolution-independent). */
export interface CropPct {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MIN_SIZE = 8; // % — box never smaller than this

/** Insta rule: crop lives between 4:5 portrait and 1.91:1 landscape. Always. */
const MIN_ASPECT = 0.8;
const MAX_ASPECT = 1.91;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Largest centered box clamped into bounds for a w×h image — percent units. */
function defaultBoxFor(w: number, h: number): CropPct {
  const a = clamp(w / h, MIN_ASPECT, MAX_ASPECT);
  const imgA = w / h;
  let width: number;
  let height: number;
  if (a >= imgA) {
    width = 100;
    height = (100 * imgA) / a;
  } else {
    height = 100;
    width = (100 * a) / imgA;
  }
  return { x: (100 - width) / 2, y: (100 - height) / 2, width, height };
}

/** Keep a dragged box inside bounds — adjust the free dimension, keep the anchor. */
function clampAspect(b: CropPct): CropPct {
  let { x, y, width: w, height: h } = b;
  const a = w / Math.max(1e-6, h);
  if (a < MIN_ASPECT) {
    w = h * MIN_ASPECT;
    if (x + w > 100) x = 100 - w;
  } else if (a > MAX_ASPECT) {
    h = w / MAX_ASPECT;
    if (y + h > 100) y = 100 - h;
  }
  return { x, y, width: w, height: h };
}

interface FreeCropperProps {
  src: string;
  /** Current box (%). Undefined until the image loads (default set internally). */
  value: CropPct | undefined;
  /** Live while dragging. */
  onChange: (box: CropPct) => void;
  /** Finger/mouse lifted. */
  onComplete: (box: CropPct) => void;
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se';

/**
 * Minimal BOUNDED-FREE cropper with Apple-dark skin (white frame, matte mask).
 * No library: plain pointer events, works with mouse + touch.
 * - Drag INSIDE the box = move · drag CORNERS = resize
 * - Box aspect always clamped to 0.8–1.91 (Insta rule) · box always in 0–100%.
 */
export const FreeCropper: React.FC<FreeCropperProps> = ({
  src,
  value,
  onChange,
  onComplete,
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    orig: CropPct;
  } | null>(null);
  // Latest box for the window-level move handler (avoids stale closures).
  const boxRef = useRef<CropPct | undefined>(value);
  boxRef.current = value;

  const toPct = (clientX: number, clientY: number) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return null;
    return {
      dx: ((clientX - r.left) / r.width) * 100,
      dy: ((clientY - r.top) / r.height) * 100,
    };
  };

  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    const base = boxRef.current;
    if (!d || !base) return;
    const p = toPct(e.clientX, e.clientY);
    if (!p) return;
    const ddx = p.dx - d.startX;
    const ddy = p.dy - d.startY;
    const o = d.orig;
    let next: CropPct;
    if (d.mode === 'move') {
      next = {
        x: clamp(o.x + ddx, 0, 100 - o.width),
        y: clamp(o.y + ddy, 0, 100 - o.height),
        width: o.width,
        height: o.height,
      };
    } else {
      // Corner resize — anchor the opposite corner, enforce min size + bounds.
      let x1 = o.x;
      let y1 = o.y;
      let x2 = o.x + o.width;
      let y2 = o.y + o.height;
      if (d.mode.includes('w')) x1 = clamp(o.x + ddx, 0, x2 - MIN_SIZE);
      else x2 = clamp(o.x + o.width + ddx, x1 + MIN_SIZE, 100);
      if (d.mode.includes('n')) y1 = clamp(o.y + ddy, 0, y2 - MIN_SIZE);
      else y2 = clamp(o.y + o.height + ddy, y1 + MIN_SIZE, 100);
      next = clampAspect({ x: x1, y: y1, width: x2 - x1, height: y2 - y1 });
    }
    onChange(next);
  };

  const endDrag = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointercancel', endDrag);
    const d = drag.current;
    drag.current = null;
    if (d && boxRef.current) onComplete(boxRef.current);
  };

  const begin = (mode: DragMode, e: React.PointerEvent) => {
    const base = boxRef.current;
    if (!base) return;
    e.preventDefault();
    e.stopPropagation();
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    drag.current = {
      mode,
      startX: ((e.clientX - r.left) / r.width) * 100,
      startY: ((e.clientY - r.top) / r.height) * 100,
      orig: { ...base },
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag, { once: true });
    window.addEventListener('pointercancel', endDrag);
  };

  const box = value;
  const corner =
    'absolute w-7 h-7 z-10 flex items-center justify-center touch-none';
  // White L-tick (visual) + generous invisible hit area around it.
  const tick = (pos: string, borders: string) => (
    <span className={`pointer-events-none absolute ${pos} block w-4 h-4 ${borders} border-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]`} />
  );

  return (
    <div
      ref={wrapRef}
      className="relative inline-block select-none"
      style={{ touchAction: 'none' }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onLoad={(e) => {
          // Default = full photo clamped into bounds, centered. Guard: modal
          // re-mounts on re-open must KEEP the user's box, not reset it.
          if (boxRef.current) return;
          const el = e.currentTarget;
          if (!el.naturalWidth || !el.naturalHeight) return;
          const next = defaultBoxFor(el.naturalWidth, el.naturalHeight);
          onChange(next);
          onComplete(next);
        }}
        className="block max-w-full pointer-events-none"
        style={{ maxHeight: '55vh' }}
      />
      {box && (
        <>
          {/* Matte mask — dim everything outside the box */}
          <span
            className="absolute pointer-events-none"
            style={{ left: 0, top: 0, width: '100%', height: `${box.y}%`, background: 'rgba(0,0,0,0.55)' }}
          />
          <span
            className="absolute pointer-events-none"
            style={{ left: 0, top: `${box.y + box.height}%`, width: '100%', bottom: 0, background: 'rgba(0,0,0,0.55)' }}
          />
          <span
            className="absolute pointer-events-none"
            style={{ left: 0, top: `${box.y}%`, width: `${box.x}%`, height: `${box.height}%`, background: 'rgba(0,0,0,0.55)' }}
          />
          <span
            className="absolute pointer-events-none"
            style={{ left: `${box.x + box.width}%`, top: `${box.y}%`, right: 0, height: `${box.height}%`, background: 'rgba(0,0,0,0.55)' }}
          />
          {/* White frame + thirds */}
          <span
            className="absolute border-2 border-white/90 pointer-events-none"
            style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%` }}
          >
            <span className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40">
              <span className="border-r border-b border-white/30" />
              <span className="border-r border-b border-white/30" />
              <span className="border-b border-white/30" />
              <span className="border-r border-b border-white/30" />
              <span className="border-r border-b border-white/30" />
              <span className="border-b border-white/30" />
              <span className="border-r border-white/30" />
              <span className="border-r border-white/30" />
              <span />
            </span>
          </span>
          {/* Move layer (whole box) */}
          <span
            className="absolute cursor-move"
            style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.width}%`, height: `${box.height}%`, touchAction: 'none' }}
            onPointerDown={(e) => begin('move', e)}
          />
          {/* Corner handles */}
          <span className={`${corner} cursor-nwse-resize`} style={{ left: `${box.x}%`, top: `${box.y}%`, transform: 'translate(-50%,-50%)' }} onPointerDown={(e) => begin('nw', e)}>
            {tick('-top-0.5 -left-0.5', 'border-t-4 border-l-4 rounded-tl-sm')}
          </span>
          <span className={`${corner} cursor-nesw-resize`} style={{ left: `${box.x + box.width}%`, top: `${box.y}%`, transform: 'translate(-50%,-50%)' }} onPointerDown={(e) => begin('ne', e)}>
            {tick('-top-0.5 -right-0.5', 'border-t-4 border-r-4 rounded-tr-sm')}
          </span>
          <span className={`${corner} cursor-nesw-resize`} style={{ left: `${box.x}%`, top: `${box.y + box.height}%`, transform: 'translate(-50%,-50%)' }} onPointerDown={(e) => begin('sw', e)}>
            {tick('-bottom-0.5 -left-0.5', 'border-b-4 border-l-4 rounded-bl-sm')}
          </span>
          <span className={`${corner} cursor-nwse-resize`} style={{ left: `${box.x + box.width}%`, top: `${box.y + box.height}%`, transform: 'translate(-50%,-50%)' }} onPointerDown={(e) => begin('se', e)}>
            {tick('-bottom-0.5 -right-0.5', 'border-b-4 border-r-4 rounded-br-sm')}
          </span>
        </>
      )}
    </div>
  );
};

export default FreeCropper;
