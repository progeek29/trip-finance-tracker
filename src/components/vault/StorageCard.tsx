import React, { useEffect, useState } from 'react';
import { Trip, DocumentVaultItem, SharedPhoto } from '../../types';
import {
  formatMB,
  buildTripBundle,
  downloadTextFile,
  GODOWN_BUDGET_BYTES,
} from '../../utils/storageProvider';
import { getTripMediaUsage } from '../../utils/mediaStore';
import { Database, Download, Trash2, X } from 'lucide-react';

interface StorageCardProps {
  trip: Trip;
  documents: DocumentVaultItem[];
  photos: SharedPhoto[];
  onArchiveTrip: (tripId: string) => void;
}

/** Trip godown meter: kitna bhara, archive karke khaali karo. */
export const StorageCard: React.FC<StorageCardProps> = ({ trip, documents, photos, onArchiveTrip }) => {
  const [showArchive, setShowArchive] = useState(false);
  const [exported, setExported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [bytes, setBytes] = useState(0);

  const photoCount = photos.filter((p) => p.tripId === trip.id).length;
  const docCount = documents.filter((d) => d.tripId === trip.id).length;

  // Real bytes from the big godown (IndexedDB)
  useEffect(() => {
    let live = true;
    getTripMediaUsage(trip.id).then((u) => {
      if (live) setBytes(u.bytes);
    });
    return () => {
      live = false;
    };
  }, [trip.id, photoCount, docCount]);

  const pct = Math.min(100, (bytes / GODOWN_BUDGET_BYTES) * 100);
  const pctLabel = pct < 0.1 && bytes > 0 ? '<0.1' : pct.toFixed(pct < 10 ? 1 : 0);
  const barColor = pct > 85 ? 'bg-red-400' : pct > 65 ? 'bg-amber-400' : 'bg-emerald-400';

  const safeName = trip.title.replace(/[^a-z0-9]+/gi, '_').slice(0, 30) || 'trip';

  const handleExport = async () => {
    setBusy(true);
    try {
      downloadTextFile(`${safeName}_archive_${new Date().toISOString().slice(0, 10)}.json`, await buildTripBundle(trip.id));
      setExported(true);
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    onArchiveTrip(trip.id);
    setShowArchive(false);
    setExported(false);
    setArmed(false);
  };

  const closeArchive = () => {
    setShowArchive(false);
    setExported(false);
    setArmed(false);
  };

  return (
    <>
      <div className="clean-card rounded-2xl p-4 border border-slate-200 bg-white shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 flex-shrink-0">
            <Database className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Trip Storage (on this phone)</span>
              <span className="text-[11px] font-bold text-slate-600">{formatMB(bytes)} • {photoCount} photos • {docCount} files</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1.5 overflow-hidden">
              <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${Math.max(pct, bytes > 0 ? 2 : 0)}%` }} />
            </div>
            <span className="text-[10px] text-slate-400 font-medium block pt-0.5">{pctLabel}% of 1GB store • full-quality originals safe</span>
          </div>
        </div>
        <button
          onClick={() => setShowArchive(true)}
          className="flex-shrink-0 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
        >
          Archive Trip
        </button>
      </div>

      {showArchive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
          <div className="bg-white max-w-sm w-full rounded-3xl p-6 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold text-slate-900">Archive "{trip.title}"</h4>
              <button onClick={closeArchive} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-600">
              Step 1: <strong>download the full trip as one file</strong> (full-quality photos + tickets + expenses + everything). Step 2: clear media from the phone — <strong>{formatMB(bytes)} free</strong>, history and totals stay.
            </p>
            <button onClick={handleExport} disabled={busy} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold cursor-pointer">
              <Download className="w-4 h-4" /> {busy ? 'Preparing…' : exported ? 'Downloaded — you can download again' : 'Step 1: Download Backup'}
            </button>
            {!exported && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-medium">Backup first is recommended — wiping without it cannot be undone.</p>
            )}
            <button onClick={handleArchive} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold cursor-pointer">
              <Trash2 className="w-4 h-4" /> {armed ? 'Tap again to wipe media' : 'Step 2: Clear media from phone'}
            </button>
            <button onClick={closeArchive} className="w-full text-[11px] font-bold text-slate-400 cursor-pointer">Close</button>
          </div>
        </div>
      )}
    </>
  );
};
