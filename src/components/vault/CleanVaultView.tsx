import React, { useRef, useState } from 'react';
import { DocumentVaultItem, SharedPhoto, PlaceRecommendation, Trip } from '../../types';
import { reminderCountdown } from '../../utils/reminder';
import { normalizeLocation, uniqueLocations, suggestLocations, resolveLocationOnSave } from '../../utils/location';
import { DatePicker } from '../common/DatePicker';
import { CustomSelect } from '../common/CustomSelect';
import { StorageCard } from './StorageCard';
import { MediaImg } from '../common/MediaImg';
import { Lightbox } from '../common/Lightbox';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { storePickedFile, resolveMedia, isMediaRef } from '../../utils/mediaStore';
import { saveToPhoneFolder, deleteManyFromPhoneFolder } from '../../utils/phoneFolder';
import { Eye, MapPin, X, Edit2, Trash2, Copy, Check, Camera, Upload, ImagePlus } from 'lucide-react';

export const DEFAULT_PHOTO = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80';

interface CleanVaultViewProps {
  documents: DocumentVaultItem[];
  photos: SharedPhoto[];
  recommendations: PlaceRecommendation[];
  trip: Trip;
  onAddPhoto: (photo: SharedPhoto) => void;
  onAddPhotos: (photos: SharedPhoto[]) => void;
  onUpdatePhoto: (photo: SharedPhoto) => void;
  onDeletePhoto: (id: string) => void;
  onAddDocument: (doc: DocumentVaultItem) => void;
  onUpdateDocument: (doc: DocumentVaultItem) => void;
  onDeleteDocument: (id: string) => void;
  onAddPlace: (place: PlaceRecommendation) => void;
  onUpdatePlace: (place: PlaceRecommendation) => void;
  onDeletePlace: (id: string) => void;
}

export const DEFAULT_PLACE_IMG = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80';

function isImageSrc(src: string): boolean {
  if (!src) return false;
  if (src.startsWith('idb:image:')) return true;
  if (src.startsWith('idb:')) return false;
  if (src.startsWith('data:image/')) return true;
  if (src.startsWith('data:')) return false;
  return !/\.(pdf|csv|xls|xlsx|doc|docx|txt)(\?|#|$)/i.test(src);
}

/** Tap behavior: image → zoom viewer, file → opens directly (no extra popup). */
function openDocFile(doc: DocumentVaultItem, viewImage: (images: string[], title: string) => void): void {
  const src = doc.previewUrl || doc.fileUrl || '';
  if (isImageSrc(src)) {
    viewImage([src], doc.title);
    return;
  }
  const openDirect = (real: string) => {
    if (real) window.open(real, '_blank', 'noopener');
  };
  if (isMediaRef(src)) {
    resolveMedia(src).then(openDirect);
  } else {
    openDirect(src);
  }
}

function detectFileType(file: File): DocumentVaultItem['fileType'] {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf';
  if (/csv/i.test(file.type) || /\.csv$/i.test(file.name)) return 'csv';
  return 'file';
}

/** All photos of a place — old entries only have imageUrl, new ones have imageUrls */
export function placeImages(rec: PlaceRecommendation): string[] {
  if (rec.imageUrls && rec.imageUrls.length > 0) return rec.imageUrls;
  if (rec.imageUrl) return [rec.imageUrl];
  return [DEFAULT_PLACE_IMG];
}

export const CleanVaultView: React.FC<CleanVaultViewProps> = ({
  documents,
  photos,
  recommendations,
  trip,
  onAddDocument,
  onUpdateDocument,
  onDeleteDocument,
  onAddPhoto,
  onAddPhotos,
  onUpdatePhoto,
  onDeletePhoto,
  onAddPlace,
  onUpdatePlace,
  onDeletePlace,
}) => {
  const [subTab, setSubTab] = useState<'tickets' | 'photos' | 'places'>('tickets');
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number; title?: string } | null>(null);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  // modals
  const [docModal, setDocModal] = useState<{ open: boolean; editing: DocumentVaultItem | null }>({ open: false, editing: null });
  const [photoModal, setPhotoModal] = useState<{ open: boolean; editing: SharedPhoto | null }>({ open: false, editing: null });
  const [placeModal, setPlaceModal] = useState<{ open: boolean; editing: PlaceRecommendation | null }>({ open: false, editing: null });
  const [confirmDel, setConfirmDel] = useState<{ kind: 'doc' | 'place'; id: string; label: string } | null>(null);
  const [placeLocation, setPlaceLocation] = useState<string>('all');

  const locations = uniqueLocations(recommendations);
  const visibleRecs = placeLocation === 'all'
    ? recommendations
    : recommendations.filter((r) => normalizeLocation(r.cityName).toLowerCase() === placeLocation.toLowerCase());

  const confirmDeleteGo = () => {
    if (!confirmDel) return;
    if (confirmDel.kind === 'doc') onDeleteDocument(confirmDel.id);
    else onDeletePlace(confirmDel.id);
  };

  const copyText = async (key: string, text?: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedRef(key);
    setTimeout(() => setCopiedRef(null), 2000);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-2xl w-fit">
        {[
          { id: 'tickets', label: 'Tickets and Passes' },
          { id: 'photos', label: 'Shared Photos' },
          { id: 'places', label: 'Places and Fares' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id as any)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              subTab === tab.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. Tickets */}
      {subTab === 'tickets' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 font-display">Important Tickets and Passes ({documents.length})</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDocModal({ open: true, editing: null })}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
              >
                Add Ticket
              </button>
            </div>
          </div>

          {documents.length === 0 && (
            <div className="clean-card rounded-2xl p-6 text-center border border-dashed border-slate-300 bg-white">
              <p className="text-xs text-slate-500 font-medium">No tickets yet. Add boarding passes, hotel vouchers or ID proofs.</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {documents.map((doc) => {
              const fileSrc = doc.previewUrl || doc.fileUrl || '';
              const isImg = isImageSrc(fileSrc);
              return (
              <div key={doc.id} className="clean-card rounded-2xl p-4 border border-slate-200 bg-white hover:border-indigo-300 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">{doc.category}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setDocModal({ open: true, editing: doc })} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer" title="Edit (upload / change file anytime)">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setConfirmDel({ kind: 'doc', id: doc.id, label: doc.title })}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <h4 className="text-sm font-bold text-slate-900">{doc.title}</h4>
                {/* The uploaded document itself — images open here, files open directly */}
                {fileSrc ? (
                  <button
                    onClick={() => openDocFile(doc, (images, title) => setLightbox({ images, index: 0, title }))}
                    className="block w-full text-left cursor-pointer group/doc"
                    title={isImg ? 'Tap to view and zoom' : 'Tap to open file directly'}
                  >
                    {isImg ? (
                      <MediaImg srcRef={fileSrc} alt={doc.title} className="w-full h-32 object-cover rounded-xl border border-slate-200 group-hover/doc:border-indigo-300" />
                    ) : (
                      <span className="flex items-center gap-2.5 w-full p-3 rounded-xl border border-slate-200 bg-slate-50 group-hover/doc:border-indigo-300">
                        <span className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-[10px] font-extrabold flex-shrink-0">
                          {(doc.fileType || 'file').toUpperCase().slice(0, 4)}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-slate-800 truncate">{doc.fileName || 'Attached document'}</span>
                          <span className="block text-[11px] text-indigo-600 font-bold">Tap to open</span>
                        </span>
                      </span>
                    )}
                  </button>
                ) : null}
                {/* Stay spotlight: what/where we stay + a few photos */}
                {(doc.category === 'hotel' && (doc.stayDetails || (doc.stayPhotos && doc.stayPhotos.length > 0))) && (
                  <div className="rounded-xl bg-amber-50/70 border border-amber-100 p-2.5 space-y-1.5">
                    <p className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wide">Our Stay</p>
                    {doc.stayDetails && <p className="text-[11px] text-slate-700">{doc.stayDetails}</p>}
                    {doc.stayPhotos && doc.stayPhotos.length > 0 && (
                      <div className="flex gap-1.5 overflow-x-auto">
                        {doc.stayPhotos.map((sp, i) => (
                          <MediaImg key={i} srcRef={sp} alt="" className="w-16 h-16 rounded-lg object-cover border flex-shrink-0" />
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {doc.referenceNumber && (
                  <button
                    onClick={() => copyText(doc.id, doc.referenceNumber)}
                    className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50/80 px-2.5 py-1 rounded-xl inline-flex items-center gap-1.5 border border-indigo-100 hover:border-indigo-300 cursor-pointer"
                    title="Tap to copy PNR / reference"
                  >
                    <span>Ref: {doc.referenceNumber}</span>
                    {copiedRef === doc.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  </button>
                )}
                {doc.remindAt && (
                  <p className="text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-xl px-2.5 py-1.5 font-bold">
                    Reminder: {reminderCountdown(doc.remindAt)} • {new Date(doc.remindAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {doc.reminderNote ? ` — ${doc.reminderNote}` : ''}
                  </p>
                )}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-medium">{doc.uploadedAt}</span>
                  {fileSrc ? (
                    <button
                      onClick={() => openDocFile(doc, (images, title) => setLightbox({ images, index: 0, title }))}
                      className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-bold cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{isImg ? 'View Document' : 'Open File'}</span>
                    </button>
                  ) : (
                    <button onClick={() => setDocModal({ open: true, editing: doc })} className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 font-bold cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload file</span>
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Photos — coming soon (full rebuild from scratch) */}
      {subTab === 'photos' && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-900 font-display">Shared Photos ({photos.length})</h3>
          <div className="clean-card rounded-3xl p-10 text-center border border-dashed border-slate-300 bg-white space-y-2">
            <p className="text-base font-extrabold text-slate-900">Coming Soon</p>
            <p className="text-xs text-slate-500 font-medium max-w-xs mx-auto">
              Shared squad gallery is being rebuilt from scratch — multi-photo upload, zoom viewer and free sharing included.
            </p>
          </div>
        </div>
      )}

      {/* 3. Places */}
      {subTab === 'places' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 font-display">Places and Fares ({visibleRecs.length})</h3>
              <p className="text-[11px] text-slate-500 font-medium">Community picks with real fares — public for all once sync is on.</p>
            </div>
            <button
              onClick={() => setPlaceModal({ open: true, editing: null })}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer flex-shrink-0"
            >
              Add Place
            </button>
          </div>

          {recommendations.length === 0 && (
            <div className="clean-card rounded-2xl p-6 text-center border border-dashed border-slate-300 bg-white">
              <p className="text-xs text-slate-500 font-medium">No places yet. Add must-visit spots with real fares.</p>
            </div>
          )}

          <CustomSelect
            label="Explore by location"
            value={placeLocation}
            onChange={setPlaceLocation}
            placeholder="All locations"
            options={[{ value: 'all', label: `All locations (${recommendations.length})` }, ...locations.map((l) => ({ value: l, label: l }))]}
          />
          {visibleRecs.length === 0 && recommendations.length > 0 && (
            <p className="text-xs text-slate-500 bg-white border border-dashed border-slate-300 rounded-2xl p-4 text-center">No spots in this location yet — add the first one.</p>
          )}

          <div className="space-y-3">
            {visibleRecs.map((rec) => {
              const imgs = placeImages(rec);
              return (
              <div key={rec.id} className="clean-card rounded-2xl p-4 border border-slate-200 bg-white hover:border-indigo-300 flex flex-col sm:flex-row gap-4 shadow-2xs">
                <div className="w-full sm:w-32 flex-shrink-0 space-y-1.5">
                  <button onClick={() => setLightbox({ images: imgs, index: 0, title: rec.title })} className="block w-full cursor-pointer" title="Tap to view and zoom">
                    <MediaImg srcRef={imgs[0]} alt={rec.title} className="w-full sm:w-32 h-28 rounded-xl object-cover" />
                  </button>
                  {imgs.length > 1 && (
                    <div className="flex gap-1 overflow-x-auto">
                      {imgs.slice(1, 5).map((im, i) => (
                        <button key={i} onClick={() => setLightbox({ images: imgs, index: i + 1, title: rec.title })} className="cursor-pointer flex-shrink-0" title="Tap to view and zoom">
                          <MediaImg srcRef={im} alt="" className="w-10 h-10 rounded-lg object-cover border" />
                        </button>
                      ))}
                      {imgs.length > 5 && (
                        <button onClick={() => setLightbox({ images: imgs, index: 5, title: rec.title })} className="w-10 h-10 rounded-lg bg-slate-100 border flex items-center justify-center text-[10px] font-bold text-slate-600 flex-shrink-0 cursor-pointer">+{imgs.length - 5}</button>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-1.5 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-extrabold text-slate-900 text-sm">{rec.title}</h4>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {rec.estimatedFareOrCost > 0 && (
                        <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                          Rs.{rec.estimatedFareOrCost.toLocaleString('en-IN')}
                        </span>
                      )}
                      <button onClick={() => setPlaceModal({ open: true, editing: rec })} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer" title="Edit">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setConfirmDel({ kind: 'place', id: rec.id, label: rec.title })} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {rec.description ? (
                    <p className="text-xs text-slate-600 line-clamp-2">{rec.description}</p>
                  ) : null}
                  <p className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-indigo-400" />
                    <span>{rec.cityName || 'Unknown location'}</span>
                    <span className="mx-0.5">•</span>
                    <span>by {rec.authorName || 'a traveller'}</span>
                  </p>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {lightbox && (
        <Lightbox
          images={lightbox.images}
          index={lightbox.index}
          onIndex={(i) => setLightbox({ ...lightbox, index: i })}
          onClose={() => setLightbox(null)}
          title={lightbox.title}
        />
      )}
      {confirmDel && (
        <ConfirmDialog
          message={`"${confirmDel.label}" will be deleted.`}
          onConfirm={confirmDeleteGo}
          onClose={() => setConfirmDel(null)}
        />
      )}

      {docModal.open && (
        <DocumentFormModal
          trip={trip}
          editing={docModal.editing}
          onClose={() => setDocModal({ open: false, editing: null })}
          onSave={(doc) => {
            if (docModal.editing) onUpdateDocument(doc);
            else onAddDocument(doc);
            setDocModal({ open: false, editing: null });
          }}
        />
      )}
      {photoModal.open && (
        <PhotoFormModal
          trip={trip}
          editing={photoModal.editing}
          onClose={() => setPhotoModal({ open: false, editing: null })}
          onSaveOne={(photo) => {
            if (photoModal.editing) onUpdatePhoto(photo);
            else onAddPhoto(photo);
            setPhotoModal({ open: false, editing: null });
          }}
          onSaveMany={(newPhotos) => {
            onAddPhotos(newPhotos);
            setPhotoModal({ open: false, editing: null });
          }}
        />
      )}
      {placeModal.open && (
        <PlaceFormModal
          tripId="shared"
          tripTitle={trip.title}
          editing={placeModal.editing}
          existingLocations={locations}
          onClose={() => setPlaceModal({ open: false, editing: null })}
          onSave={(place) => {
            if (placeModal.editing) onUpdatePlace(place);
            else onAddPlace(place);
            setPlaceModal({ open: false, editing: null });
          }}
        />
      )}
    </div>
  );
};

/* ── Document add (simple) / edit (full) ── */
function DocumentFormModal({ trip, editing, onClose, onSave }: { trip: Trip; editing: DocumentVaultItem | null; onClose: () => void; onSave: (d: DocumentVaultItem) => void }) {
  const [title, setTitle] = useState(editing?.title || '');
  const [category, setCategory] = useState<DocumentVaultItem['category']>(editing?.category || 'ticket');
  const [notes, setNotes] = useState(editing?.notes || '');
  const [previewUrl, setPreviewUrl] = useState(editing?.previewUrl || editing?.fileUrl || '');
  const [fileName, setFileName] = useState(editing?.fileName || '');
  const [fileType, setFileType] = useState<DocumentVaultItem['fileType']>(editing?.fileType || 'link');
  const [stayDetails, setStayDetails] = useState(editing?.stayDetails || '');
  const [stayPhotos, setStayPhotos] = useState<string[]>(editing?.stayPhotos || []);
  const [remindAt, setRemindAt] = useState(editing?.remindAt || '');
  const [reminderNote, setReminderNote] = useState(editing?.reminderNote || '');
  const [wantReminder, setWantReminder] = useState(!!editing?.remindAt);
  const [titleError, setTitleError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const stayFileRef = useRef<HTMLInputElement>(null);

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    // Large store, but not infinite — stop absurd files early with a clear message
    if (!f.type.startsWith('image/') && f.size > 60 * 1024 * 1024) {
      alert(`"${f.name}" is ${(f.size / 1048576).toFixed(0)}MB — too big even for the big store (max 60MB).`);
      return;
    }
    const stored = await storePickedFile(trip.id, f);
    setPreviewUrl(stored.ref);
    setFileName(stored.fileName);
    setFileType(detectFileType(f));
    if (!title.trim()) {
      setTitle(stored.fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').slice(0, 60) || 'Ticket');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setTitleError(true); return; }
    setTitleError(false);
    const hasFile = !!previewUrl;
    const docId = editing?.id || `doc_${Date.now()}`;
    // Phone folder mirror (old mirror cleaned first)
    await deleteManyFromPhoneFolder([...(editing?.phonePaths || []), editing?.phonePath]);
    const mainData = previewUrl ? await resolveMedia(previewUrl) : '';
    const phonePath = mainData.startsWith('data:') ? await saveToPhoneFolder(trip.title, docId, mainData, fileName) : null;
    const phonePaths: string[] = [];
    for (let i = 0; i < stayPhotos.length; i++) {
      const d = await resolveMedia(stayPhotos[i]);
      if (d.startsWith('data:')) {
        const p = await saveToPhoneFolder(trip.title, `${docId}_stay_${i}`, d);
        if (p) phonePaths.push(p);
      }
    }
    onSave({
      id: docId,
      tripId: editing?.tripId || trip.id,
      title: title.trim(),
      category,
      fileType: hasFile ? (previewUrl.startsWith('data:') ? fileType : (isImageSrc(previewUrl) ? 'image' : 'link')) : 'link',
      fileUrl: previewUrl,
      previewUrl,
      fileName: fileName || undefined,
      referenceNumber: editing?.referenceNumber || '',
      notes: notes.trim(),
      uploadedAt: editing?.uploadedAt || new Date().toISOString().split('T')[0],
      uploadedByMemberId: editing?.uploadedByMemberId || trip.members.find((m) => m.isCurrentUser)?.id || trip.members[0]?.id || 'm1',
      stayDetails: category === 'hotel' ? stayDetails.trim() : undefined,
      stayPhotos: category === 'hotel' ? stayPhotos : undefined,
      remindAt: category === 'ticket' && wantReminder && remindAt ? remindAt : undefined,
      reminderNote: category === 'ticket' && wantReminder ? reminderNote.trim() || undefined : undefined,
      phonePath: phonePath || undefined,
      phonePaths,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
      <form onSubmit={submit} className="bg-white max-w-md w-full rounded-3xl p-6 space-y-3 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h4 className="font-extrabold text-slate-900">{editing ? 'Edit Ticket' : 'Add Ticket'}</h4>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        {/* Upload first — screenshot ya PDF, bas */}
        <div className="space-y-2">
          <button type="button" onClick={() => fileRef.current?.click()} className="w-full py-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold cursor-pointer">
            {previewUrl ? 'Change file' : 'Upload ticket (screenshot or PDF)'}
          </button>
          <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
          {previewUrl && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              {isImageSrc(previewUrl)
                ? <MediaImg srcRef={previewUrl} alt="" className="w-full h-36 object-cover" />
                : null}
              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50">
                <span className="text-[11px] font-bold text-slate-700 truncate">{fileName || 'Attached file'}</span>
                <button type="button" onClick={() => { setPreviewUrl(''); setFileName(''); setFileType('link'); }} className="flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer">
                  <Trash2 className="w-3 h-3" /> Remove
                </button>
              </div>
            </div>
          )}
        </div>
        <div>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (titleError && e.target.value.trim()) setTitleError(false);
            }}
            placeholder="Title (auto-filled from file)"
            className={`w-full rounded-xl border px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-100 ${
              titleError ? 'bg-rose-50 border-rose-400 placeholder-rose-300 focus:border-rose-400' : 'bg-slate-50 border-slate-200 focus:border-indigo-500'
            }`}
          />
        </div>
        <CustomSelect
          label="Category"
          value={category}
          onChange={(v) => setCategory(v as any)}
          options={[
            { value: 'ticket', label: 'Ticket' },
            { value: 'hotel', label: 'Hotel' },
            { value: 'id_proof', label: 'ID Proof' },
            { value: 'visa', label: 'Visa' },
            { value: 'insurance', label: 'Insurance' },
            { value: 'rental', label: 'Rental' },
            { value: 'other', label: 'Other' },
          ]}
        />

        {/* Extra options only while editing — add stays one-tap simple */}
        {editing && (
          <>
        {category === 'ticket' && (
          <div className="space-y-2 rounded-2xl bg-indigo-50/70 border border-indigo-100 p-3">
            <label className="flex items-center justify-between gap-2 cursor-pointer">
              <span className="text-[11px] font-extrabold text-indigo-900 uppercase tracking-wide">Set a reminder for this ticket?</span>
              <input
                type="checkbox"
                checked={wantReminder}
                onChange={(e) => setWantReminder(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </label>
            {wantReminder && (
              <>
                <DatePicker withTime value={remindAt} onChange={setRemindAt} placeholder="When to remind (e.g. flight day)" />
                <input value={reminderNote} onChange={(e) => setReminderNote(e.target.value)} placeholder="Note — e.g. reach 3 hrs early" className="w-full rounded-xl bg-white border border-indigo-200 px-3 py-2 text-xs" />
                <p className="text-[10px] text-slate-500 font-medium">Rings on the phone even if the app is closed (Android app). Time and note are changeable anytime in Edit.</p>
              </>
            )}
          </div>
        )}
            {category === 'hotel' && (
              <div className="space-y-2 rounded-2xl bg-amber-50/70 border border-amber-100 p-3">
                <label className="block text-[11px] font-extrabold text-amber-800 uppercase tracking-wide">About this stay — write and upload</label>
                <textarea value={stayDetails} onChange={(e) => setStayDetails(e.target.value)} placeholder="e.g. Casa Portuguesa Villa, Anjuna — pool villa, breakfast included" rows={2} className="w-full rounded-xl bg-white border border-amber-200 px-3 py-2 text-xs" />
                {stayPhotos.length > 0 && (
                  <div className="grid grid-cols-4 gap-1.5">
                    {stayPhotos.map((sp, i) => (
                      <div key={i} className="relative rounded-lg overflow-hidden border aspect-square">
                        <MediaImg srcRef={sp} alt="" className="w-full h-full object-cover" />
                        <button type="button" onClick={() => setStayPhotos((prev) => prev.filter((_, x) => x !== i))} className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/60 text-white hover:bg-rose-600 cursor-pointer"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                )}
                <button type="button" onClick={() => stayFileRef.current?.click()} className="w-full py-2 rounded-xl bg-white border border-amber-200 text-amber-800 text-xs font-bold cursor-pointer">Upload</button>
                <input ref={stayFileRef} type="file" accept="image/*" multiple className="hidden" onChange={async (e) => { const files = e.target.files; if (!files) return; const refs: string[] = []; for (const f of Array.from(files)) refs.push((await storePickedFile(trip.id, f)).ref); setStayPhotos((prev) => [...prev, ...refs]); }} />
              </div>
            )}
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (seat nos, gate, check-in)" rows={2} className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs" />
          </>
        )}
        <button type="submit" className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold cursor-pointer">Save</button>
      </form>
    </div>
  );
}

/* ── Photo add (multi) / edit with camera ── */
function PhotoFormModal({ trip, editing, onClose, onSaveOne, onSaveMany }: { trip: Trip; editing: SharedPhoto | null; onClose: () => void; onSaveOne: (p: SharedPhoto) => void; onSaveMany: (ps: SharedPhoto[]) => void }) {
  const [images, setImages] = useState<string[]>(editing ? [editing.url] : []);
  const [urlInput, setUrlInput] = useState('');
  const [caption, setCaption] = useState(editing?.caption || '');
  const [locationTag, setLocationTag] = useState(editing?.locationTag || '');
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const pickFiles = async (files: FileList | null) => {
    if (!files) return;
    const refs: string[] = [];
    for (const f of Array.from(files)) refs.push((await storePickedFile(trip.id, f)).ref);
    setImages((prev) => [...prev, ...refs]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalImages = images.length > 0 ? images : [DEFAULT_PHOTO];
    const me = trip.members.find((m) => m.isCurrentUser) || trip.members[0];
    const mirrorOne = async (id: string, ref: string) => {
      const dataUrl = await resolveMedia(ref);
      if (!dataUrl.startsWith('data:')) return null;
      return saveToPhoneFolder(trip.title, id, dataUrl);
    };
    if (editing) {
      // Edit mode: change photo (replace), caption, location — or remove image (falls back to default)
      await deleteManyFromPhoneFolder([editing.phonePath]);
      onSaveOne({
        ...editing,
        url: finalImages[0],
        caption: caption || 'Trip moment',
        locationTag,
        phonePath: (await mirrorOne(editing.id, finalImages[0])) || undefined,
      });
      return;
    }
    const now = new Date().toISOString();
    onSaveMany(
      await Promise.all(
        finalImages.map(async (url, i) => {
          const id = `photo_${Date.now()}_${i}`;
          return {
            id,
            tripId: trip.id,
            url,
            caption: caption || 'Trip moment',
            locationTag,
            uploadedByMemberId: me.id,
            uploadedByName: me.name,
            uploadedAt: now,
            likesCount: 0,
            phonePath: (await mirrorOne(id, url)) || undefined,
          };
        })
      )
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
      <form onSubmit={submit} className="bg-white max-w-md w-full rounded-3xl p-6 space-y-3 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h4 className="font-extrabold text-slate-900">{editing ? 'Edit Photo' : `Add Trip Photos${images.length > 1 ? ` (${images.length})` : ''}`}</h4>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        {images.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {images.map((img, i) => (
              <div key={i} className="relative rounded-xl overflow-hidden border aspect-square">
                <MediaImg srcRef={img} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((_, x) => x !== i))}
                  className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-rose-600 cursor-pointer"
                  title={editing ? 'Remove image (saves with default)' : 'Remove this photo'}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-center">
            <p className="text-[11px] text-slate-500 font-medium">No image chosen — saving will use a <strong>default trip image</strong>.</p>
            <img src={DEFAULT_PHOTO} alt="default" className="w-full h-28 object-cover rounded-xl mt-2 border" />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => cameraRef.current?.click()} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer">
            <Camera className="w-4 h-4" /> {editing ? 'Retake' : 'Take Photo'}
          </button>
          <button type="button" onClick={() => galleryRef.current?.click()} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold cursor-pointer">
            <ImagePlus className="w-4 h-4" /> {editing ? 'Change' : 'Upload (multi)'}
          </button>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pickFiles(e.target.files)} />
        <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => pickFiles(e.target.files)} />
        <div className="flex gap-2">
          <input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="…or paste image URL, then Add" className="flex-1 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs" />
          <button type="button" onClick={() => { if (urlInput.trim()) { setImages((prev) => [...prev, urlInput.trim()]); setUrlInput(''); } }} className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-bold cursor-pointer">Add</button>
        </div>
        <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption" className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs" />
        <input value={locationTag} onChange={(e) => setLocationTag(e.target.value)} placeholder="Location tag" className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs" />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-500 cursor-pointer">Cancel</button>
          <button type="submit" className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold cursor-pointer">{editing ? 'Save Changes' : `Share ${images.length > 1 ? images.length + ' Photos' : 'Photo'}`}</button>
        </div>
      </form>
    </div>
  );
}

/* ── Place add/edit: photo + name + description + price. Nothing else. ── */
function PlaceFormModal({ tripId, tripTitle, editing, existingLocations, onClose, onSave }: { tripId: string; tripTitle: string; editing: PlaceRecommendation | null; existingLocations: string[]; onClose: () => void; onSave: (p: PlaceRecommendation) => void }) {
  const [title, setTitle] = useState(editing?.title || '');
  const [location, setLocation] = useState(editing?.cityName || '');
  const [cost, setCost] = useState<number | ''>(editing?.estimatedFareOrCost || '');
  const [desc, setDesc] = useState(editing?.description || '');
  const [images, setImages] = useState<string[]>(editing ? placeImages(editing) : []);
  const [askLocation, setAskLocation] = useState<{ typed: string; suggestion: string } | null>(null);
  const [fieldError, setFieldError] = useState<'title' | 'location' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const suggestions = suggestLocations(location, existingLocations).filter(
    (s) => s.toLowerCase() !== normalizeLocation(location).toLowerCase()
  );

  const doSave = async (finalLocation: string) => {
    // Your own uploads replace the default image; default only when nothing chosen
    const finalImages = images.length > 0 ? images : [DEFAULT_PLACE_IMG];
    const placeId = editing?.id || `rec_${Date.now()}`;
    await deleteManyFromPhoneFolder(editing?.phonePaths || []);
    const phonePaths: string[] = [];
    for (let i = 0; i < finalImages.length; i++) {
      const d = await resolveMedia(finalImages[i]);
      if (d.startsWith('data:')) {
        const p = await saveToPhoneFolder(tripTitle, `${placeId}_${i}`, d);
        if (p) phonePaths.push(p);
      }
    }
    onSave({
      id: placeId,
      title: title.trim(),
      cityName: finalLocation,
      category: editing?.category || 'must_visit',
      description: desc,
      estimatedFareOrCost: Number(cost) || 0,
      costType: editing?.costType || 'per_person',
      rating: editing?.rating || 4.5,
      imageUrl: finalImages[0],
      imageUrls: finalImages,
      phonePaths,
      tips: editing?.tips,
      authorName: editing?.authorName || 'You',
      authorAvatar: editing?.authorAvatar || '',
      verifiedByTrip: true,
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setFieldError('title'); return; }
    if (!location.trim()) { setFieldError('location'); return; }
    setFieldError(null);
    // Exact match → save. Close match → ASK first ("Did you mean Delhi?"). Else new.
    const resolved = resolveLocationOnSave(location, existingLocations);
    if (resolved.kind === 'exact' || resolved.kind === 'new') {
      if (!resolved.value) {
        alert('Add location');
        return;
      }
      await doSave(resolved.value);
    } else {
      setAskLocation({ typed: resolved.value, suggestion: resolved.suggestion });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
      <form onSubmit={submit} className="bg-white max-w-md w-full rounded-3xl p-6 space-y-3 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h4 className="font-extrabold text-slate-900">{editing ? 'Edit Place' : 'Add Place'}</h4>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (fieldError === 'title' && e.target.value.trim()) setFieldError(null);
            }}
            placeholder="Place name *"
            className={`w-full rounded-xl border px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-100 ${
              fieldError === 'title'
                ? 'bg-rose-50 border-rose-400 placeholder-rose-300 focus:border-rose-400'
                : 'bg-slate-50 border-slate-200 focus:border-indigo-500'
            }`}
          />
        </div>
        <div>
          <input
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
              setAskLocation(null);
              if (fieldError === 'location' && e.target.value.trim()) setFieldError(null);
            }}
            placeholder="Location * e.g. Goa"
            className={`w-full rounded-xl border px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-100 ${
              fieldError === 'location'
                ? 'bg-rose-50 border-rose-400 placeholder-rose-300 focus:border-rose-400'
                : 'bg-slate-50 border-slate-200 focus:border-indigo-500'
            }`}
          />
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setLocation(s);
                    setAskLocation(null);
                  }}
                  className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {askLocation && (
            <div className="mt-2 p-3 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
              <p className="text-xs font-bold text-slate-800">Did you mean "{askLocation.suggestion}"?</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAskLocation(null);
                    doSave(askLocation.suggestion);
                  }}
                  className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                >
                  Use {askLocation.suggestion}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAskLocation(null);
                    doSave(askLocation.typed);
                  }}
                  className="flex-1 py-2 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Save "{askLocation.typed}" as new
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <label className="block text-[11px] font-bold text-slate-700">Photos</label>
          {images.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {images.map((img, i) => (
                <div key={i} className="relative rounded-xl overflow-hidden border aspect-square">
                  <MediaImg srcRef={img} alt="" className="w-full h-full object-cover" />
                  {i === 0 && <span className="absolute bottom-1 left-1 text-[9px] font-bold bg-indigo-600 text-white px-1.5 py-0.5 rounded-full">Cover</span>}
                  <button type="button" onClick={() => setImages((prev) => prev.filter((_, x) => x !== i))} className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-rose-600 cursor-pointer" title="Delete this photo">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 p-3 text-center">
              <p className="text-[11px] text-slate-500 font-medium">No photo chosen — a <strong>default image</strong> will be used.</p>
            </div>
          )}
          <button type="button" onClick={() => fileRef.current?.click()} className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold cursor-pointer">Upload</button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={async (e) => { const files = e.target.files; if (!files) return; const refs: string[] = []; for (const f of Array.from(files)) refs.push((await storePickedFile(tripId, f)).ref); setImages((prev) => [...prev, ...refs]); }} />
        </div>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optional)" rows={2} className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs" />
        <input type="number" value={cost} onChange={(e) => setCost(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Price Rs. (optional)" className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-bold" />
        <button type="submit" className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold cursor-pointer">Save</button>
      </form>
    </div>
  );
}
