import React, { useEffect, useRef, useState } from 'react';

/**
 * Dandelion like button — tap = flower blooms sky + seeds burst right.
 * Controlled: parent owns liked/count (localStorage + counts), this owns
 * only the 600ms burst animation.
 */
export const DandelionLike: React.FC<{
  liked: boolean;
  count: number;
  onToggle: () => void;
}> = ({ liked, count, onToggle }) => {
  const [bursting, setBursting] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    []
  );

  const handle = () => {
    if (!liked) {
      setBursting(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setBursting(false), 650);
    }
    onToggle();
  };

  return (
    <button
      type="button"
      onClick={handle}
      aria-label={liked ? 'Unlike' : 'Like'}
      className="relative flex items-center gap-1.5 text-slate-500 hover:text-slate-700 transition-colors cursor-pointer group"
    >
      <span className="relative p-0.5">
        <svg
          className={`w-[19px] h-[19px] transition-all duration-300 ${
            liked ? 'text-sky-500 scale-110' : 'text-slate-500 group-hover:text-slate-700'
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={liked ? 2.5 : 2}
        >
          <circle cx="12" cy="9" r="1.25" fill={liked ? 'currentColor' : 'none'} />
          <path d="M12 10.5V20M12 7.5V3M12 3L10 4M12 3L14 4" strokeLinecap="round" />
          <path d="M13.5 8.5l3.5-3M17 5.5l-1-1M10.5 8.5l-3.5-3M7 5.5l1-1" strokeLinecap="round" />
          <path d="M13.5 10l4.5 1M18 11l-.5-1.5M10.5 10L6 11M6 11l.5-1.5" strokeLinecap="round" />
        </svg>
        {bursting && (
          <span className="absolute top-0 left-4 w-12 h-6 pointer-events-none overflow-visible">
            <span className="absolute top-1 left-2 w-1.5 h-1.5 bg-sky-400 rounded-full animate-seed-1" />
            <span className="absolute top-3 left-3 w-1 h-1 bg-sky-300 rounded-full animate-seed-2" />
            <span className="absolute top-0 left-4 w-1.5 h-1.5 bg-gray-400 rounded-full animate-seed-3" />
          </span>
        )}
      </span>
      <span
        key={count}
        className={`text-[11px] font-bold transition-colors duration-300 ${
          liked ? 'text-sky-500 animate-num-pop' : ''
        }`}
      >
        {count}
      </span>
    </button>
  );
};

export default DandelionLike;
