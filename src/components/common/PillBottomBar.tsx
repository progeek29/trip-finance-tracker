import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface PillBarItem {
  id: string;
  label: string;
  Icon: LucideIcon;
  active?: boolean;
  onClick?: () => void;
}

/** Floating pill bottom bar (reference-grade) — white capsule, filled
 * indigo active tile, sexy outline icons. Shared by My Trips + trip bars. */
export const PillBottomBar: React.FC<{ items: PillBarItem[] }> = ({ items }) => (
  <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-40 w-[calc(100%-2rem)] max-w-md [transform:translateX(-50%)translateZ(0)]">
    <nav className="bg-white rounded-full border border-slate-100 shadow-[0_12px_40px_rgba(30,27,75,0.14)] px-3 py-2 flex justify-around items-center">
      {items.map(({ id, label, Icon, active, onClick }) => (
        <button
          key={id}
          onClick={onClick}
          aria-label={label}
          title={label}
          className="flex flex-col items-center justify-center gap-0.5 flex-1 py-0.5 transition-all duration-200 ease-out active:scale-95 focus:outline-none cursor-pointer"
        >
          <span
            className={`flex items-center justify-center w-11 h-9 rounded-2xl transition-all duration-200 ${
              active ? 'bg-indigo-600 shadow-md shadow-indigo-300' : 'bg-transparent'
            }`}
          >
            <Icon
              size={20}
              strokeWidth={active ? 2.2 : 1.8}
              className={`transition-colors duration-200 ${active ? 'text-white' : 'text-slate-400'}`}
            />
          </span>
          <span
            className={`text-[9px] leading-tight tracking-tight transition-colors duration-200 ${
              active ? 'text-indigo-600 font-bold' : 'text-slate-400 font-medium'
            }`}
          >
            {label}
          </span>
        </button>
      ))}
    </nav>
  </div>
);
