import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Dandelion like button — mock geometry verbatim (100x100 viewBox, 16 spokes:
 * 4 axis + 4 diagonal + 8 infill, curved umbrella tufts, tapered bent stem).
 * Stroke widths scaled x3.3 for 28px legibility (mock's 1.4-unit hairlines
 * would vanish at icon size — geometry untouched, only weight adapted).
 * - Unliked: slate flower · Liked: rose flower + glow + Y-seed gust.
 * Controlled: parent owns liked/count, this owns only the burst animation.
 */

// Deterministic pseudo-random for the burst (stable, no reshuffle).
const rand = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

interface BurstSeed {
  dx: number;
  dy: number;
  rot: number;
  dur: number;
  delay: number;
  size: number;
  gray: boolean;
}

// The gust: Y-seeds drift right + up in a cloud.
const makeBurst = (id: number): BurstSeed[] => {
  const r = rand(id * 7919 + 13);
  return Array.from({ length: 22 }, () => ({
    dx: 10 + r() * 60,
    dy: -32 + r() * 54,
    rot: (r() - 0.5) * 140,
    dur: 0.9 + r() * 0.6,
    delay: r() * 0.1,
    size: 6 + r() * 3,
    gray: r() < 0.35,
  }));
};

// Mini flying Y-seed (umbrella tuft on a stalk).
const FlyingSeed: React.FC<{ color: string }> = ({ color }) => (
  <svg width="100%" height="100%" viewBox="0 0 7 7" fill="none" stroke={color}>
    <line x1={3.5} y1={6.5} x2={3.5} y2={3} strokeWidth={0.9} strokeLinecap="round" />
    <path
      d="M3.5 3 L1.9 1.2 M3.5 3 L3.5 0.6 M3.5 3 L5.1 1.2"
      strokeWidth={0.9}
      strokeLinecap="round"
    />
  </svg>
);

/** Insta-style compact counts: 999 → 1K → 222K → 1M. Layout never clips. */
export function formatCount(n: number): string {
  const v = Math.max(0, Math.floor(n));
  if (v < 1000) return String(v);
  if (v < 1_000_000) {
    const k = v / 1000;
    return `${k >= 100 ? Math.round(k) : Math.round(k * 10) / 10}K`;
  }
  const m = v / 1_000_000;
  return `${m >= 100 ? Math.round(m) : Math.round(m * 10) / 10}M`;
}

export const DandelionLike: React.FC<{
  liked: boolean;
  count: number;
  onToggle: () => void;
}> = ({ liked, count, onToggle }) => {
  const [burstId, setBurstId] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    []
  );

  const burst = useMemo(() => (burstId > 0 ? makeBurst(burstId) : []), [burstId]);

  const handle = () => {
    if (!liked) {
      setBurstId((n) => n + 1);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setBurstId(0), 1700);
    }
    onToggle();
  };

  return (
    <button
      type="button"
      onClick={handle}
      aria-label={liked ? 'Unlike' : 'Like'}
      className="relative flex items-center justify-center gap-1.5 h-8 text-slate-500 hover:text-indigo-600 transition-colors cursor-pointer group active:scale-95"
    >
      <span className="relative p-0.5 flex items-center justify-center">
        <svg
          className={`block w-7 h-7 transition-all duration-300 ${
            liked
              ? 'text-rose-500 drop-shadow-[0_2px_6px_rgba(244,63,94,0.25)]'
              : 'text-slate-500 group-hover:text-indigo-600'
          }`}
          viewBox="0 10 100 78"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Tapered bent stem */}
          <path d="M 50 45 Q 49 65 54 85" strokeWidth="5.5" />
          {/* Hub knot */}
          <circle cx="50" cy="45" r="2" fill="currentColor" stroke="none" />

          {/* Axis spokes */}
          <line x1="50" y1="45" x2="50" y2="17" strokeWidth="1.4" />
          <path d="M 44 18 Q 50 13 56 18 M 46.5 20.5 Q 50 16.5 53.5 20.5" strokeWidth="1.6" />
          <line x1="50" y1="45" x2="50" y2="73" strokeWidth="1.4" />
          <path d="M 44 72 Q 50 77 56 72 M 46.5 69.5 Q 50 73.5 53.5 69.5" strokeWidth="1.6" />
          <line x1="50" y1="45" x2="22" y2="45" strokeWidth="1.4" />
          <path d="M 23 39 Q 18 45 23 51 M 25.5 41.5 Q 21.5 45 25.5 48.5" strokeWidth="1.6" />
          <line x1="50" y1="45" x2="78" y2="45" strokeWidth="1.4" />
          <path d="M 77 39 Q 82 45 77 51 M 74.5 41.5 Q 78.5 45 74.5 48.5" strokeWidth="1.6" />

          {/* Diagonals */}
          <line x1="50" y1="45" x2="30.5" y2="25.5" strokeWidth="1.4" />
          <path d="M 25 28 Q 23 21.5 30 23.5 M 28 30.5 Q 26 25 31.5 26.5" strokeWidth="1.4" />
          <line x1="50" y1="45" x2="69.5" y2="25.5" strokeWidth="1.4" />
          <path d="M 70 23.5 Q 77 21.5 75 28 M 68.5 26.5 Q 74 25 72 30.5" strokeWidth="1.4" />
          <line x1="50" y1="45" x2="30.5" y2="64.5" strokeWidth="1.4" />
          <path d="M 25 62 Q 23 68.5 30 66.5 M 28 59.5 Q 26 65 31.5 63.5" strokeWidth="1.4" />
          <line x1="50" y1="45" x2="69.5" y2="64.5" strokeWidth="1.4" />
          <path d="M 70 66.5 Q 77 68.5 75 62 M 68.5 63.5 Q 74 65 72 59.5" strokeWidth="1.4" />

          {/* Infill sectors */}
          <line x1="50" y1="45" x2="40" y2="19.5" strokeWidth="2.4" />
          <path d="M 34 20.5 Q 38 14.5 44 17" strokeWidth="1.4" />
          <line x1="50" y1="45" x2="60" y2="19.5" strokeWidth="2.4" />
          <path d="M 56 17 Q 62 14.5 66 20.5" strokeWidth="1.4" />
          <line x1="50" y1="45" x2="40" y2="70.5" strokeWidth="2.4" />
          <path d="M 34 69.5 Q 38 75.5 44 73" strokeWidth="1.4" />
          <line x1="50" y1="45" x2="60" y2="70.5" strokeWidth="2.4" />
          <path d="M 56 73 Q 62 75.5 66 69.5" strokeWidth="1.4" />
          <line x1="50" y1="45" x2="19.5" y2="34.5" strokeWidth="2.4" />
          <path d="M 14 29.5 Q 15 36 21.5 35" strokeWidth="1.4" />
          <line x1="50" y1="45" x2="80.5" y2="34.5" strokeWidth="2.4" />
          <path d="M 78.5 35 Q 85 36 86 29.5" strokeWidth="1.4" />
          <line x1="50" y1="45" x2="19.5" y2="55.5" strokeWidth="2.4" />
          <path d="M 14 60.5 Q 15 54 21.5 55" strokeWidth="1.4" />
          <line x1="50" y1="45" x2="80.5" y2="55.5" strokeWidth="2.4" />
          <path d="M 78.5 55 Q 85 54 86 60.5" strokeWidth="1.4" />
        </svg>
        {burstId > 0 && (
          <span className="absolute left-1/2 top-2 pointer-events-none">
            {burst.map((b, i) => (
              <span
                key={`${burstId}-${i}`}
                className="absolute dseed"
                style={
                  {
                    width: b.size,
                    height: b.size,
                    '--dx': `${b.dx}px`,
                    '--dy': `${b.dy}px`,
                    '--dr': `${b.rot}deg`,
                    animationDuration: `${b.dur}s`,
                    animationDelay: `${b.delay}s`,
                  } as React.CSSProperties
                }
              >
                <FlyingSeed color={b.gray ? '#9ca3af' : '#fb7185'} />
              </span>
            ))}
          </span>
        )}
      </span>
      {/* Count shows only after the first like — zero stays invisible */}
      {count > 0 && (
        <span
          key={count}
          className="text-[11px] font-bold leading-none text-slate-500 animate-num-pop"
        >
          {formatCount(count)}
        </span>
      )}
    </button>
  );
};

export default DandelionLike;
