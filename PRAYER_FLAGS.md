# Tibetan Prayer Flags (Lungta) — parked (revert for now)

> Status: removed from login page on request. Exact code preserved below —
> copy back verbatim to restore. Last live in commit `eb312cf` era.

## Restore steps

1. Recreate `src/components/common/PrayerFlags.tsx` (code below).
2. Recreate `src/components/common/prayer-flags.css` (code below).
3. In `src/components/common/LoginLanding.tsx`:
   - `import { PrayerFlags } from './PrayerFlags';`
   - Root div → `className="min-h-screen bg-slate-50 relative"`
   - First child inside root: `<PrayerFlags />`

## `src/components/common/PrayerFlags.tsx` (exact)

```tsx
import React from 'react';
import './prayer-flags.css';

const A = 'ཨོཾ་མ་ཎི་པདྨེ་ཧཱུྃ་ཧྲཱིཿ';
const B = 'ནམོ་རཏྣ་ཏྲ་ཡཱ་ཡཱ་';
const C = 'ཨོཾ་མ་ཎི པདྨེ་ཧཱུྃ';
const T1 = `${A} ${B} ${A} ${B} ${A} ${C} ${C} ${C} ${A} ${B} ${A} ${B} ${A}`;
const T2 = `${B} ${A} ${B} ${A} ${A} ${B} ${A} ${B} ${A} ${A} ${B} ${A} ${B} ${A}`;
const T3 = `${B} ${A} ${B} ${A} ${A} ${B} ${A} ${B} ${A} ${A} ${B} ${A} ${B} ${A}`;
const T4 = `${A} ${B} ${A} ${A} ${B} ${A} ${B} ${A} ${A} ${B} ${A} ${B} ${A}`;
const T5 = `${A} ${B} ${A} ${A} ${B} ${A} ${B} ${A} ${A} ${B} ${A} ${B} ${A}`;

const SET1 = [
  { cls: 'flag-blue', text: T1 },
  { cls: 'flag-white', text: T2 },
  { cls: 'flag-red', text: T3 },
  { cls: 'flag-green', text: T4 },
  { cls: 'flag-yellow', text: T5 },
];
const SET2 = [
  { cls: 'flag-blue', text: T4 },
  { cls: 'flag-white', text: T5 },
  { cls: 'flag-red', text: T1 },
  { cls: 'flag-green', text: T2 },
  { cls: 'flag-yellow', text: T3 },
];

/** Tibetan Prayer Flags (Lungta) — compact strand, authentic mantra print,
 *  wind sway. Set 1 all screens; Set 2 desktop extension. */
export const PrayerFlags: React.FC = () => {
  return (
    <div className="prayer-flags-container" aria-hidden="true">
      {SET1.map((f, i) => (
        <div key={`a-${i}`} className={`flag ${f.cls}`}>
          <div className="prayer-text-block">{f.text}</div>
        </div>
      ))}
      {SET2.map((f, i) => (
        <div key={`b-${i}`} className={`flag ${f.cls} desktop-only`}>
          <div className="prayer-text-block">{f.text}</div>
        </div>
      ))}
    </div>
  );
};

export default PrayerFlags;
```

## `src/components/common/prayer-flags.css` (exact)

```css
/* Tibetan Prayer Flags (Lungta) — compact strand, wind sway.
 * Scoped under .prayer-flags-container. Transform-only animation. */

/* 1. FLEX ENGINE CONTAINER */
.prayer-flags-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  gap: 3px;
  pointer-events: none;
  z-index: 30;
  padding-top: 6px;
  box-sizing: border-box;
}

/* Thinned hanging thread line */
.prayer-flags-container::before {
  content: '';
  position: absolute;
  top: 6px;
  left: 0;
  width: 100%;
  height: 1px;
  background: rgba(0, 0, 0, 0.1);
  z-index: 1;
}

/* 2. DOWNSCALED GEOMETRY (~50% size) */
.prayer-flags-container .flag {
  position: relative;
  width: 24px;
  height: 28px;
  flex-shrink: 0;
  clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 50% 90%, 0% 100%);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  transform-origin: top center;
  animation: windSway 3.6s ease-in-out infinite alternate;
  box-sizing: border-box;
  z-index: 2;
}

/* 3. DENSE MICRO-TYPOGRAPHY */
.prayer-flags-container .prayer-text-block {
  width: 100%;
  height: 100%;
  padding: 3px 2px 4px 2px;
  font-family: 'Noto Serif Tibetan', 'Microsoft Himalaya', serif;
  font-size: 2px;
  line-height: 2.8px;
  letter-spacing: 0.1px;
  text-align: center;
  word-break: break-all;
  overflow: hidden;
  user-select: none;
  box-sizing: border-box;
  opacity: 0.8;
}

/* 4. TRADITIONAL CONTRAST VALUES */
.prayer-flags-container .flag-blue {
  background-color: #1a3a6c;
  color: rgba(255, 255, 255, 0.55);
  animation-delay: 0.1s;
  animation-duration: 3s;
}
.prayer-flags-container .flag-white {
  background-color: #fafafa;
  color: rgba(28, 35, 49, 0.6);
  border-left: 1px solid #e1e4e8;
  border-right: 1px solid #e1e4e8;
  animation-delay: 0.4s;
  animation-duration: 3.6s;
}
.prayer-flags-container .flag-red {
  background-color: #8c1d1d;
  color: rgba(255, 255, 255, 0.55);
  animation-delay: 0.8s;
  animation-duration: 2.8s;
}
.prayer-flags-container .flag-green {
  background-color: #1b4d3e;
  color: rgba(255, 255, 255, 0.55);
  animation-delay: 1.2s;
  animation-duration: 3.4s;
}
.prayer-flags-container .flag-yellow {
  background-color: #cca025;
  color: rgba(50, 37, 2, 0.65);
  animation-delay: 0.3s;
  animation-duration: 3.2s;
}

/* 5. SOFTENED WIND MOVEMENT */
@keyframes windSway {
  0% {
    transform: rotate(-2deg) skewX(-0.5deg);
    filter: brightness(0.97);
  }
  100% {
    transform: rotate(2.5deg) skewX(1deg);
    filter: brightness(1.03);
  }
}

/* 6. RESPONSIVE CONTROLS */
.prayer-flags-container .desktop-only {
  display: none;
}

@media (min-width: 768px) {
  .prayer-flags-container .desktop-only {
    display: flex;
  }
  .prayer-flags-container .flag {
    width: 28px;
    height: 32px;
  }
  .prayer-flags-container .prayer-text-block {
    font-size: 2.2px;
    line-height: 3px;
    padding: 4px 2px 5px 2px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .prayer-flags-container .flag {
    animation: none;
  }
}
```
