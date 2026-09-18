import React from 'react';
import { getImpersonation, stopImpersonation } from '../../utils/supabaseClient';

/** Master-key banner: visible on every screen while viewing as another user. */
export const ImpersonateBanner: React.FC = () => {
  const info = getImpersonation();
  if (!info) return null;
  return (
    <div className="sticky top-0 z-[60] bg-amber-500 text-white">
      <div className="max-w-3xl mx-auto px-4 py-1.5 flex items-center gap-2">
        <span className="text-[11px] font-bold truncate">
          Viewing as {info.targetName}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={stopImpersonation}
          className="text-[11px] font-extrabold bg-white/20 hover:bg-white/30 rounded-lg px-2.5 py-1 transition-colors cursor-pointer"
        >
          Exit to admin
        </button>
      </div>
    </div>
  );
};

export default ImpersonateBanner;
