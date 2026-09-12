import { useEffect } from 'react';

/**
 * Locks background page scroll while a fullscreen modal is open.
 * Without this the page behind scrolls too → double scrollbars + conflict.
 */
export function useLockBodyScroll(active = true): void {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}
