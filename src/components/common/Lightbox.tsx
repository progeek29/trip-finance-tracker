import React, { useRef, useState } from 'react';
import { X, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMediaUrl } from './MediaImg';

interface LightboxProps {
  images: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  title?: string;
}

/** Full-screen image viewer with zoom + pan + prev/next. */
export const Lightbox: React.FC<LightboxProps> = ({ images, index, onIndex, onClose, title }) => {
  const [zoom, setZoomState] = useState(1);
  const [pan, setPanState] = useState({ x: 0, y: 0 });
  // Mirrors for gesture math (state lags mid-gesture)
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{
    startDist: number;
    startZoom: number;
    startPan: { x: number; y: number };
    startMid: { x: number; y: number };
  } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const src = useMediaUrl(images[index]);

  const safeIndex = images.length === 0 ? 0 : Math.min(Math.max(index, 0), images.length - 1);

  const applyZoomPan = (z: number, p: { x: number; y: number }) => {
    const clamped = Math.min(4, Math.max(1, Math.round(z * 100) / 100));
    const cleanPan = clamped <= 1 ? { x: 0, y: 0 } : p;
    zoomRef.current = clamped;
    panRef.current = cleanPan;
    setZoomState(clamped);
    setPanState(cleanPan);
  };

  const zoomBy = (d: number) => applyZoomPan(zoomRef.current + d, panRef.current);
  const reset = () => {
    pinch.current = null;
    setDrag(null);
    applyZoomPan(1, { x: 0, y: 0 });
  };
  const go = (dir: number) => {
    if (images.length < 2) return;
    onIndex((safeIndex + dir + images.length) % images.length);
    reset();
  };

  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setDrag(null);
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinch.current = {
        startDist: Math.max(1, dist(a, b)),
        startZoom: zoomRef.current,
        startPan: { ...panRef.current },
        startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
    } else if (pointers.current.size === 1 && zoomRef.current > 1) {
      setDrag({ x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = Array.from(pointers.current.values());
      const d = Math.max(1, dist(a, b));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const p = pinch.current;
      applyZoomPan((p.startZoom * d) / p.startDist, {
        x: p.startPan.x + (mid.x - p.startMid.x),
        y: p.startPan.y + (mid.y - p.startMid.y),
      });
    }
  };

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) setDrag(null);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/95 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-xs font-bold truncate">
          {title || 'Photo'}{images.length > 1 ? ` (${safeIndex + 1}/${images.length})` : ''}
        </span>
        <div className="flex items-center gap-1.5">
          <button onClick={reset} className="p-2 rounded-full bg-white/10 hover:bg-white/20 cursor-pointer" title="Reset">
            <RotateCcw size={15} />
          </button>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 cursor-pointer" title="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Image area — fingers: pinch to zoom, drag to move when zoomed */}
      <div
        className="flex-1 overflow-hidden flex items-center justify-center relative touch-none select-none"
        onWheel={(e) => zoomBy(e.deltaY < 0 ? 0.25 : -0.25)}
        onDoubleClick={() => (zoomRef.current > 1 ? reset() : applyZoomPan(2, panRef.current))}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => {
          onPointerMove(e);
          if (drag && pointers.current.size === 1) {
            const next = { x: e.clientX - drag.x, y: e.clientY - drag.y };
            panRef.current = next;
            setPanState(next);
          }
        }}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        style={{ cursor: zoom > 1 ? 'grab' : 'default' }}
      >
        {src ? (
          <img
            src={src}
            alt={title || 'Photo'}
            draggable={false}
            className="max-w-full max-h-full object-contain transition-transform"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          />
        ) : (
          <span className="text-slate-400 text-xs font-medium">Loading…</span>
        )}

        {images.length > 1 && (
          <>
            <button onClick={() => go(-1)} className="absolute left-2 p-2.5 rounded-full bg-white/10 hover:bg-white/25 text-white cursor-pointer">
              <ChevronLeft size={18} />
            </button>
            <button onClick={() => go(1)} className="absolute right-2 p-2.5 rounded-full bg-white/10 hover:bg-white/25 text-white cursor-pointer">
              <ChevronRight size={18} />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
