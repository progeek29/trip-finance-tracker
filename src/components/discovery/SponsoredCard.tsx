import React from 'react';
import { Megaphone } from 'lucide-react';

/** Native sponsored slot for the explore feed — house placeholder until
 * real advertisers onboard. No external links, no fake brand deals:
 * advertiser cards plug into this exact frame later. */
export const SponsoredCard: React.FC = () => (
  <div className="rounded-3xl overflow-hidden border border-indigo-400/30 flex flex-col p-5 space-y-3 shadow-xl"
    style={{ background: 'linear-gradient(180deg, rgba(79,70,229,0.12) 0%, rgba(15,18,40,0.6) 100%)' }}
  >
    <div className="flex items-center justify-between">
      <span className="px-2.5 py-1 rounded-md bg-indigo-500/20 text-[10px] font-extrabold text-indigo-200 tracking-widest border border-indigo-400/30">
        SPONSORED
      </span>
      <Megaphone size={14} className="text-indigo-300" />
    </div>
    <h3 className="font-bold text-white text-base font-display leading-snug">
      Advertise on WanderSync
    </h3>
    <p className="text-xs text-slate-300 leading-relaxed">
      Travel-first brands appear here, woven into the trip flow. Advertiser onboarding opens soon.
    </p>
    <div className="pt-3 border-t border-white/10 flex items-center justify-between">
      <span className="text-[11px] font-semibold text-slate-400">House slot</span>
      <span className="text-[11px] font-bold text-indigo-300">Coming soon</span>
    </div>
  </div>
);
