import React, { useState } from 'react';
import { Mountain, Palmtree, Waves, Building2, Landmark, Tent, ChevronRight, Star, Sparkles } from 'lucide-react';
import {
  DISCOVER_PACKAGES,
  DISCOVER_CITIES,
  DISCOVER_EDITORIALS,
  inr,
  type DiscoverPackage,
} from '../../data/discover';
import { CommunityExploreView } from './CommunityExploreView';
import type { PlaceRecommendation } from '../../types';
import { PackageDetailsModal } from './PackageDetailsModal';

const PKG_ICONS = {
  mountain: Mountain,
  palmtree: Palmtree,
  waves: Waves,
} as const;

const CITY_ICONS = {
  building: Building2,
  landmark: Landmark,
  tent: Tent,
} as const;

interface DiscoverViewProps {
  recommendations: PlaceRecommendation[];
  onAddRecommendation: (rec: PlaceRecommendation) => void;
  onEnquire: (msg: string) => void;
  onSharePackage: (pkg: DiscoverPackage) => void;
}

/** Discover home (P1 skeleton) — curated static feed in the trip-card
 *  visual language: editorial strip, featured packages, city cards,
 *  then the existing Explore/saved-places section. */
export const DiscoverView: React.FC<DiscoverViewProps> = ({
  recommendations,
  onAddRecommendation,
  onEnquire,
  onSharePackage,
}) => {
  const [openPkg, setOpenPkg] = useState<DiscoverPackage | null>(null);

  return (
    <div className="max-w-2xl mx-auto px-4 pt-5 pb-32">
      {/* Editorial strip */}
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
        {DISCOVER_EDITORIALS.map((e) => (
          <button
            key={e.id}
            className={`flex-shrink-0 w-64 rounded-2xl bg-gradient-to-br ${e.gradient} p-4 text-left cursor-pointer active:scale-[0.98] transition-transform`}
          >
            <Sparkles size={16} className="text-white/70 mb-6" />
            <p className="text-white text-base font-extrabold leading-tight">{e.title}</p>
            <p className="text-white/75 text-[11px] font-medium mt-0.5">{e.subtitle}</p>
          </button>
        ))}
      </div>

      {/* Featured packages — trip-card language */}
      <div className="flex items-center justify-between mt-6 mb-2.5">
        <h3 className="text-sm font-extrabold text-slate-900">Featured packages</h3>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Curated</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {DISCOVER_PACKAGES.map((p) => {
          const Icon = PKG_ICONS[p.icon];
          return (
            <button
              key={p.id}
              onClick={() => setOpenPkg(p)}
              className="text-left bg-white rounded-3xl overflow-hidden border border-slate-200/70 shadow-sm hover:shadow-md active:scale-[0.99] transition-all cursor-pointer"
            >
              <div className={`relative bg-gradient-to-br ${p.gradient} px-4 pt-4 pb-14`}>
                <span className="absolute top-3 left-3 px-2 py-1 rounded-full bg-white/95 text-slate-700 text-[10px] font-extrabold">
                  {p.duration}
                </span>
                <span className="absolute top-3 right-3 px-2 py-1 rounded-full bg-black/25 text-white text-[10px] font-bold">
                  {p.availability}
                </span>
                <Icon size={40} strokeWidth={1.5} className="text-white/90 mt-6" />
              </div>
              <div className="px-4 py-3">
                <p className="text-sm font-extrabold text-slate-900 leading-tight">{p.title}</p>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">{p.destination}</p>
                <p className="text-[11px] text-slate-400 font-medium mt-1 truncate">
                  {p.highlights.join(' · ')}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm font-extrabold text-emerald-600">
                    {inr(p.price)} <span className="text-[10px] font-medium text-slate-400">{p.priceNote}</span>
                  </p>
                  <span className="flex items-center gap-0.5 text-indigo-600 text-[11px] font-bold">
                    View <ChevronRight size={14} strokeWidth={2.5} />
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Trending cities */}
      <h3 className="text-sm font-extrabold text-slate-900 mt-6 mb-2.5">Trending cities</h3>
      <div className="grid grid-cols-3 gap-2.5">
        {DISCOVER_CITIES.map((c) => {
          const Icon = CITY_ICONS[c.icon];
          return (
            <div key={c.id} className={`rounded-2xl bg-gradient-to-br ${c.gradient} p-3`}>
              <Icon size={20} className="text-white/85" />
              <p className="text-white text-sm font-extrabold mt-6 leading-tight">{c.title}</p>
              <p className="text-white/75 text-[10px] font-medium flex items-center gap-1 mt-0.5">
                <Star size={9} className="fill-amber-300 text-amber-300" /> {c.rating} · {c.season}
              </p>
            </div>
          );
        })}
      </div>

      {/* Saved places (existing Explore, kept as-is) */}
      <div className="mt-6">
        <CommunityExploreView
          recommendations={recommendations}
          trip={null}
          onAddRecommendation={onAddRecommendation}
        />
      </div>

      {openPkg && (
        <PackageDetailsModal
          pkg={openPkg}
          onClose={() => setOpenPkg(null)}
          onEnquire={(p) => {
            setOpenPkg(null);
            onEnquire(`Enquiry noted for "${p.title}" — our team will reach out with availability.`);
          }}
          onShare={onSharePackage}
        />
      )}
    </div>
  );
};

export default DiscoverView;
