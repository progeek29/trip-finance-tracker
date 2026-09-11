# Airbnb Pills Design — parked for later

Status: reverted for now (old segmented control restored). Rebuild from this spec.

## Files (kept in repo, unused for now)
- `src/components/common/CategoryNavigation.tsx` — reusable, props-driven
- `src/components/common/CategoryNavigation.css` — tokens + states

## API
```tsx
<CategoryNavigation
  categories={[{ id: 'all', label: 'All', icon?: ReactNode }, ...]}
  activeCategory={ownershipFilter}
  onCategoryChange={(id) => ...}
/>
```

## Design tokens (CSS vars in CategoryNavigation.css)
- Height 48px desktop / 42px mobile (roomy web variant: 54px @min-width:1024px)
- Radius 30px, gap 10px, padding-x 20px, font 15px (mobile 14px)
- Border #eeeeee, dark text #222
- Resting shadow: top-inner white highlight + bottom drop
  `inset 0 1px 1px rgba(255,255,255,.9), inset 0 -2px 3px rgba(0,0,0,.05), 0 2px 4px rgba(0,0,0,.12), 0 6px 12px rgba(0,0,0,.07)`
- Active = pressed DOWN (human psychology): `translateY(2px)`, white bg,
  `inset 0 2px 5px rgba(0,0,0,.08)`, dark text, semibold
- a11y: tablist + aria-selected + focus-visible ring

## Learnings (don't repeat)
- No emojis phase: text-only looked dead → needs icons (lucide colored worked best)
- Uniform width matters (min-width var) or long words make big buttons
- Indigo-tint active looked off vs Airbnb — keep active monochrome white
- framer-motion crashed the app twice — CSS-only animations only
