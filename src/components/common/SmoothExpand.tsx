import React from 'react';

interface SmoothExpandProps {
  open: boolean;
  children: React.ReactNode;
  className?: string;
  durationMs?: number;
}

/**
 * Apple-smooth expand/collapse (grid-rows animation).
 * Use everywhere instead of conditional snap rendering.
 */
export const SmoothExpand: React.FC<SmoothExpandProps> = ({
  open,
  children,
  className = '',
  durationMs = 300,
}) => {
  return (
    <div
      className={`grid transition-all ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'} ${className}`}
      style={{ transitionDuration: `${durationMs}ms` }}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
};
