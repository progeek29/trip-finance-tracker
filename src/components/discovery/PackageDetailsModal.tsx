import React from 'react';
import { X, MapPin, CalendarDays, Users, Check, Minus, Share2, Mountain, Palmtree, Waves } from 'lucide-react';
import { inr, type DiscoverPackage } from '../../data/discover';

const ICONS = {
  mountain: Mountain,
  palmtree: Palmtree,
  waves: Waves,
} as const;

interface PackageDetailsModalProps {
  pkg: DiscoverPackage;
  onClose: () => void;
  onEnquire: (pkg: DiscoverPackage) => void;
  onShare: (pkg: DiscoverPackage) => void;
}

/** Static package details (P1) — gallery, itinerary, inclusions, price,
 *  dates, cancellation, organiser. Booking/payment arrives in a later MVP. */
export const PackageDetailsModal: React.FC<PackageDetailsModalProps> = ({ pkg, onClose, onEnquire, onShare }) => {
  const Icon = ICONS[pkg.icon];
  const total = pkg.priceBreakup.reduce((n, r) => n + r.amount, 0);
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[92dvh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden panel-enter">
        <div className={`flex-shrink-0 bg-gradient-to-br ${pkg.gradient} px-5 pt-10 pb-5 relative`}>
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 p-1.5 rounded-full bg-black/25 text-white hover:bg-black/40 cursor-pointer"
          >
            <X size={16} />
          </button>
          <span className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-2">
            <Icon size={24} className="text-white" />
          </span>
          <h2 className="text-lg font-extrabold text-white leading-tight">{pkg.title}</h2>
          <p className="text-xs text-white/80 font-medium mt-0.5 flex items-center gap-1">
            <MapPin size={11} /> {pkg.destination} · {pkg.duration}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="px-2.5 py-1 rounded-full bg-white text-slate-900 text-xs font-extrabold">
              {inr(pkg.price)} <span className="font-medium text-slate-500">{pkg.priceNote}</span>
            </span>
            <span className="px-2.5 py-1 rounded-full bg-white/20 text-white text-[11px] font-bold">
              {pkg.seatsLeft} seats left
            </span>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
          <p className="text-xs text-slate-600 leading-relaxed">{pkg.overview}</p>

          <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mt-5 mb-2">Day by day</h4>
          <div className="space-y-2">
            {pkg.itinerary.map((d) => (
              <div key={d.day} className="flex gap-2.5 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
                <span className="flex-shrink-0 text-[10px] font-extrabold text-indigo-600 bg-indigo-50 rounded-lg px-1.5 py-1 h-fit whitespace-nowrap">{d.day}</span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-slate-800">{d.title}</span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">{d.text}</span>
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 mt-5">
            <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3">
              <h4 className="text-[11px] font-extrabold text-emerald-700 uppercase tracking-wider mb-1.5">Included</h4>
              {pkg.inclusions.map((x) => (
                <p key={x} className="flex items-start gap-1.5 text-[11px] text-slate-600 py-0.5">
                  <Check size={12} strokeWidth={3} className="text-emerald-500 flex-shrink-0 mt-px" /> {x}
                </p>
              ))}
            </div>
            <div className="bg-rose-50/60 border border-rose-100 rounded-xl p-3">
              <h4 className="text-[11px] font-extrabold text-rose-600 uppercase tracking-wider mb-1.5">Not included</h4>
              {pkg.exclusions.map((x) => (
                <p key={x} className="flex items-start gap-1.5 text-[11px] text-slate-600 py-0.5">
                  <Minus size={12} strokeWidth={3} className="text-rose-400 flex-shrink-0 mt-px" /> {x}
                </p>
              ))}
            </div>
          </div>

          <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mt-5 mb-2">Price breakup</h4>
          <div className="bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
            {pkg.priceBreakup.map((r) => (
              <p key={r.label} className="flex justify-between text-[11px] font-medium text-slate-600 py-1">
                <span>{r.label}</span><span className="font-bold text-slate-800">{inr(r.amount)}</span>
              </p>
            ))}
            <p className="flex justify-between text-xs font-extrabold text-slate-900 border-t border-slate-200 pt-1.5 mt-1">
              <span>Total</span><span>{inr(total)}</span>
            </p>
          </div>

          <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mt-5 mb-2">Dates</h4>
          {pkg.dateOptions.map((d) => (
            <p key={d.label} className="flex items-center gap-2 text-[11px] font-medium text-slate-600 py-1">
              <CalendarDays size={13} className="text-indigo-500" /> {d.label}
              <span className="ml-auto text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded-md px-1.5 py-0.5">{d.seats} left</span>
            </p>
          ))}

          <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mt-5 mb-1.5">Cancellation</h4>
          <p className="text-[11px] text-slate-500">{pkg.cancellation}</p>

          <p className="flex items-center gap-2 text-[11px] text-slate-500 mt-4">
            <Users size={13} className="text-indigo-500" />
            Organised by <strong className="text-slate-700">{pkg.organiser.name}</strong> · {pkg.organiser.phone}
          </p>
        </div>

        <div className="flex-shrink-0 px-5 py-3 border-t border-slate-100 flex gap-2 bg-white">
          <button
            onClick={() => onShare(pkg)}
            aria-label="Share package"
            className="w-11 h-11 rounded-xl border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 flex items-center justify-center flex-shrink-0 cursor-pointer"
          >
            <Share2 size={17} />
          </button>
          <button
            onClick={() => onEnquire(pkg)}
            className="flex-1 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold cursor-pointer"
          >
            Enquire · {inr(pkg.price)}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PackageDetailsModal;
