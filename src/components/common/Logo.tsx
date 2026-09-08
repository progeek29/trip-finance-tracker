import React from 'react';

/** WanderSync logo — compass needle + W. No emoji, no stock globe. */
export const Logo: React.FC<{ size?: number }> = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-label="WanderSync">
    <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#ws-grad)" />
    <circle cx="24" cy="24" r="12.5" fill="none" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.6" />
    <path d="M30.5 17.5 L26.8 26.8 L17.5 30.5 L21.2 21.2 Z" fill="#ffffff" />
    <circle cx="24" cy="24" r="2.2" fill="#4f46e5" />
    <defs>
      <linearGradient id="ws-grad" x1="2" y1="2" x2="46" y2="46" gradientUnits="userSpaceOnUse">
        <stop stopColor="#6366f1" />
        <stop offset="1" stopColor="#7c3aed" />
      </linearGradient>
    </defs>
  </svg>
);
