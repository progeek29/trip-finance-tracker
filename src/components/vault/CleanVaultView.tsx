import React, { useRef, useState } from 'react';
import { DocumentVaultItem, SharedPhoto, PlaceRecommendation, Trip } from '../../types';
import { Eye, Heart, MapPin, X, Plus, Edit2, Trash2, Copy, Check, Camera, Upload, ImagePlus } from 'lucide-react';

interface CleanVaultViewProps {
  documents: DocumentVaultItem[];
  photos: SharedPhoto[];
  recommendations: PlaceRecommendation[];
  trip: Trip;
  onLikePhoto: (photoId: string) => void;
  onAddDocument: (doc: DocumentVaultItem) => void;
  onUpdateDocument: (doc: DocumentVaultItem) => void;
  onDeleteDocument: (id: string) => void;
  onAddPhoto: (photo: SharedPhoto) => void;
  onUpdatePhoto: (photo: SharedPhoto) => void;
  onDeletePhoto: (id: string) => void;
  onAddPlace: (place: PlaceRecommendation) => void;
  onUpdatePlace: (place: PlaceRecommendation) => void;
  onDeletePlace: (id: string) => void;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export const CleanVaultView: React.FC<CleanVaultViewProps> = ({
  documents,
  photos,
  recommendations,
  trip,
  onLikePhoto,
  onAddDocument,
  onUpdateDocument,
  onDeleteDocument,
  onAddPhoto,
  onUpdatePhoto,
  onDeletePhoto,
  onAddPlace,
  onUpdatePlace,
  onDeletePlace,
}) => {
  const [subTab, setSubTab] = useState<'tickets' | 'photos' | 'places'>('tickets');
  const [previewDoc, setPreviewDoc] = useState<DocumentVaultItem | null>(null);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  // modals
  const [docModal, setDocModal] = useState<{ open: boolean; editing: DocumentVaultItem | null }>({ open: false, editing: null });
  const [photoModal, setPhotoModal] = useState<{ open: boolean; editing: SharedPhoto | null }>({ open: false, editing: null });
  const [placeModal, setPlaceModal] = useState<{ open: boolean; editing: PlaceRecommendation | null }>({ open: false, editing: null });

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

  const confirmDelete = (label: string) => window.confirm(`Delete "${label}"? This cannot be undone.`);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-2xl w-fit">
        {[
          { id: 'tickets', label: '🎟 Tickets & Passes' },
          { id: 'photos', label: '📸 Shared Photos' },
          { id: 'places', label: '📍 Places & Fares' },
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
            <h3 className="text-sm font-extrabold text-slate-900 font-display">Important Tickets & Passes</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-bold">Offline Available</span>
              <button
                onClick={() => setDocModal({ open: true, editing: null })}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Ticket
              </button>
            </div>
          </div>

          {documents.length === 0 && (
            <div className="clean-card rounded-2xl p-6 text-center border border-dashed border-slate-300 bg-white">
              <p className="text-xs text-slate-500 font-medium">No tickets yet. Add boarding passes, hotel vouchers or ID proofs.</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {documents.map((doc) => (
              <div key={doc.id} className="clean-card rounded-2xl p-4 border border-slate-200 bg-white hover:border-indigo-300 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">{doc.category}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setDocModal({ open: true, editing: doc })} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer" title="Edit">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => confirmDelete(doc.title) && onDeleteDocument(doc.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <h4 className="text-sm font-bold text-slate-900">{doc.title}</h4>
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
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-medium">{doc.uploadedAt}</span>
                  <button onClick={() => setPreviewDoc(doc)} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-bold cursor-pointer">
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Voucher</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Photos */}
      {subTab === 'photos' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-900 font-display">Shared Trip Moments</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">{photos.length} Photos</span>
              <button
                onClick={() => setPhotoModal({ open: true, editing: null })}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" /> Add Photo
              </button>
            </div>
          </div>

          {photos.length === 0 && (
            <div className="clean-card rounded-2xl p-6 text-center border border-dashed border-slate-300 bg-white">
              <p className="text-xs text-slate-500 font-medium">No photos yet. Snap one with your camera or upload from gallery.</p>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
            {photos.map((p) => (
              <div key={p.id} className="group relative rounded-2xl overflow-hidden aspect-square clean-card border border-slate-200 bg-white shadow-xs">
                <img src={p.url} alt={p.caption} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-80" />
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setPhotoModal({ open: true, editing: p })} className="p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70 cursor-pointer" title="Edit">
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => confirmDelete(p.caption || 'photo') && onDeletePhoto(p.id)}
                    className="p-1.5 rounded-lg bg-black/50 text-white hover:bg-rose-600 cursor-pointer"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between text-xs text-white z-10">
                  <span className="text-[11px] font-bold truncate">{p.uploadedByName}</span>
                  <button onClick={() => onLikePhoto(p.id)} className="flex items-center gap-1 text-pink-300 hover:text-pink-100 bg-black/40 backdrop-blur-xs px-2 py-0.5 rounded-full cursor-pointer">
                    <Heart className="w-3 h-3 fill-pink-500" />
                    <span className="text-[10px] font-extrabold">{p.likesCount}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Places */}
      {subTab === 'places' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-900 font-display">Recommended Places & Actual Rates</h3>
            <button
              onClick={() => setPlaceModal({ open: true, editing: null })}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Place
            </button>
          </div>

          {recommendations.length === 0 && (
            <div className="clean-card rounded-2xl p-6 text-center border border-dashed border-slate-300 bg-white">
              <p className="text-xs text-slate-500 font-medium">No places yet. Add must-visit spots with real fares.</p>
            </div>
          )}

          <div className="space-y-3">
            {recommendations.map((rec) => (
              <div key={rec.id} className="clean-card rounded-2xl p-4 border border-slate-200 bg-white hover:border-indigo-300 flex flex-col sm:flex-row gap-4 shadow-2xs">
                <img src={rec.imageUrl} alt={rec.title} className="w-full sm:w-28 h-28 rounded-xl object-cover flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-extrabold text-slate-900 text-sm">{rec.title}</h4>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                        ₹{rec.estimatedFareOrCost.toLocaleString('en-IN')}
                      </span>
                      <button onClick={() => setPlaceModal({ open: true, editing: rec })} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer" title="Edit">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => confirmDelete(rec.title) && onDeletePlace(rec.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <span className="text-xs text-indigo-600 font-bold flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    <span>{rec.cityName}</span>
                  </span>
                  <p className="text-xs text-slate-600 line-clamp-2">{rec.description}</p>
                  {rec.tips && (
                    <p className="text-[11px] text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-100 font-medium">💡 <strong>Tip:</strong> {rec.tips}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="clean-surface max-w-sm w-full rounded-3xl p-6 border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <h4 className="text-sm font-extrabold text-slate-900 truncate">{previewDoc.title}</h4>
              <button onClick={() => setPreviewDoc(null)} className="p-1 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            {previewDoc.previewUrl && (
              <img src={previewDoc.previewUrl} alt={previewDoc.title} className="w-full h-48 object-cover rounded-2xl mb-3.5 border border-slate-100" />
            )}
            <div className="text-xs text-slate-600 space-y-1.5 mb-4 bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
              <p className="flex items-center justify-between gap-2">
                <span><strong>PNR / Reference:</strong> <span className="font-mono text-indigo-700 font-bold">{previewDoc.referenceNumber || '—'}</span></span>
                {previewDoc.referenceNumber && (
                  <button onClick={() => copyText('preview-' + previewDoc.id, previewDoc.referenceNumber)} className="flex items-center gap-1 text-indigo-600 font-bold cursor-pointer">
                    {copiedRef === 'preview-' + previewDoc.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedRef === 'preview-' + previewDoc.id ? 'Copied' : 'Copy'}</span>
                  </button>
                )}
              </p>
              <p><strong>Notes:</strong> {previewDoc.notes || '—'}</p>
            </div>
            <button onClick={() => setPreviewDoc(null)} className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 transition-colors cursor-pointer">
              Close
            </button>
          </div>
        </div>
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
          onSave={(photo) => {
            if (photoModal.editing) onUpdatePhoto(photo);
            else onAddPhoto(photo);
            setPhotoModal({ open: false, editing: null });
          }}
        />
      )}
      {placeModal.open && (
        <PlaceFormModal
          editing={placeModal.editing}
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

/* ── Document add/edit ── */
const DOC_CATS: DocumentVaultItem['category'][] = ['ticket', 'hotel', 'id_proof', 'visa', 'insurance', 'rental', 'other'];
function DocumentFormModal({ trip, editing, onClose, onSave }: { trip: Trip; editing: DocumentVaultItem | null; onClose: () => void; onSave: (d: DocumentVaultItem) => void }) {
  const [title, setTitle] = useState(editing?.title || '');
  const [category, setCategory] = useState<DocumentVaultItem['category']>(editing?.category || 'ticket');
  const [referenceNumber, setReferenceNumber] = useState(editing?.referenceNumber || '');
  const [notes, setNotes] = useState(editing?.notes || '');
  const [previewUrl, setPreviewUrl] = useState(editing?.previewUrl || editing?.fileUrl || '');
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    const url = await fileToDataUrl(f);
    setPreviewUrl(url);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { alert('Add a title'); return; }
    onSave({
      id: editing?.id || `doc_${Date.now()}`,
      tripId: editing?.tripId || trip.id,
      title: title.trim(),
      category,
      fileType: previewUrl.startsWith('data:application/pdf') ? 'pdf' : previewUrl ? 'image' : 'link',
      fileUrl: previewUrl,
      previewUrl,
      referenceNumber: referenceNumber.trim(),
      notes: notes.trim(),
      uploadedAt: editing?.uploadedAt || new Date().toISOString().split('T')[0],
      uploadedByMemberId: editing?.uploadedByMemberId || trip.members.find((m) => m.isCurrentUser)?.id || trip.members[0]?.id || 'm1',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
      <form onSubmit={submit} className="bg-white max-w-md w-full rounded-3xl p-6 space-y-3 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h4 className="font-extrabold text-slate-900">{editing ? 'Edit Ticket / Document' : 'Add Ticket / Document'}</h4>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. IndiGo Boarding Pass (4 pax)" className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-semibold" />
        <div className="grid grid-cols-2 gap-2">
          <select value={category} onChange={(e) => setCategory(e.target.value as any)} className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-bold">
            {DOC_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder="PNR / Ref no." className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-mono font-bold" />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold cursor-pointer">
            <Upload className="w-3.5 h-3.5" /> Upload file
          </button>
          <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
          <input value={previewUrl.startsWith('data:') ? '' : previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} placeholder="…or paste image URL" className="flex-1 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs" />
        </div>
        {previewUrl && !previewUrl.startsWith('data:application') && <img src={previewUrl} alt="" className="w-full h-36 object-cover rounded-xl border" />}
        {previewUrl.startsWith('data:') && <p className="text-[11px] text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2 font-bold">✓ File attached (stored offline in this browser)</p>}
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (seat nos, gate, check-in…)" rows={2} className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs" />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-500 cursor-pointer">Cancel</button>
          <button type="submit" className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold cursor-pointer">{editing ? 'Save Changes' : 'Add to Vault'}</button>
        </div>
      </form>
    </div>
  );
}

/* ── Photo add/edit with camera ── */
function PhotoFormModal({ trip, editing, onClose, onSave }: { trip: Trip; editing: SharedPhoto | null; onClose: () => void; onSave: (p: SharedPhoto) => void }) {
  const [url, setUrl] = useState(editing?.url || '');
  const [caption, setCaption] = useState(editing?.caption || '');
  const [locationTag, setLocationTag] = useState(editing?.locationTag || '');
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    setUrl(await fileToDataUrl(f));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) { alert('Add a photo first (camera, upload or URL)'); return; }
    const me = trip.members.find((m) => m.isCurrentUser) || trip.members[0];
    onSave({
      id: editing?.id || `photo_${Date.now()}`,
      tripId: editing?.tripId || trip.id,
      url,
      caption: caption || 'Trip moment 📸',
      locationTag,
      uploadedByMemberId: editing?.uploadedByMemberId || me.id,
      uploadedByName: editing?.uploadedByName || me.name,
      uploadedAt: editing?.uploadedAt || new Date().toISOString(),
      likesCount: editing?.likesCount ?? 0,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
      <form onSubmit={submit} className="bg-white max-w-md w-full rounded-3xl p-6 space-y-3 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h4 className="font-extrabold text-slate-900">{editing ? 'Edit Photo' : 'Add Trip Photo'}</h4>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        {url && <img src={url} alt="" className="w-full h-44 object-cover rounded-2xl border" />}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => cameraRef.current?.click()} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer">
            <Camera className="w-4 h-4" /> Take Photo
          </button>
          <button type="button" onClick={() => galleryRef.current?.click()} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold cursor-pointer">
            <ImagePlus className="w-4 h-4" /> Upload
          </button>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
        <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
        <input value={url.startsWith('data:') ? '' : url} onChange={(e) => setUrl(e.target.value)} placeholder="…or paste image URL" className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs" />
        <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption" className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs" />
        <input value={locationTag} onChange={(e) => setLocationTag(e.target.value)} placeholder="Location tag" className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs" />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-500 cursor-pointer">Cancel</button>
          <button type="submit" className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold cursor-pointer">{editing ? 'Save Changes' : 'Share Photo'}</button>
        </div>
      </form>
    </div>
  );
}

/* ── Place add/edit ── */
const PLACE_CATS: PlaceRecommendation['category'][] = ['must_visit', 'food_cafe', 'stay', 'hidden_gem', 'adventure'];
function PlaceFormModal({ editing, onClose, onSave }: { editing: PlaceRecommendation | null; onClose: () => void; onSave: (p: PlaceRecommendation) => void }) {
  const [title, setTitle] = useState(editing?.title || '');
  const [cityName, setCityName] = useState(editing?.cityName || '');
  const [category, setCategory] = useState<PlaceRecommendation['category']>(editing?.category || 'must_visit');
  const [cost, setCost] = useState<number | ''>(editing?.estimatedFareOrCost ?? '');
  const [costType, setCostType] = useState(editing?.costType || 'per_person');
  const [desc, setDesc] = useState(editing?.description || '');
  const [tips, setTips] = useState(editing?.tips || '');
  const [imageUrl, setImageUrl] = useState(editing?.imageUrl || '');
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !cityName.trim()) { alert('Add title + city'); return; }
    onSave({
      id: editing?.id || `rec_${Date.now()}`,
      title: title.trim(),
      cityName: cityName.trim(),
      category,
      description: desc,
      estimatedFareOrCost: Number(cost) || 0,
      costType: costType as any,
      rating: editing?.rating || 4.5,
      imageUrl: imageUrl || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
      tips,
      authorName: editing?.authorName || 'You',
      authorAvatar: editing?.authorAvatar || '',
      verifiedByTrip: true,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
      <form onSubmit={submit} className="bg-white max-w-md w-full rounded-3xl p-6 space-y-3 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h4 className="font-extrabold text-slate-900">{editing ? 'Edit Place & Fare' : 'Add Place & Fare'}</h4>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Place name *" className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-bold" />
        <div className="grid grid-cols-2 gap-2">
          <input value={cityName} onChange={(e) => setCityName(e.target.value)} placeholder="City *" className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs" />
          <select value={category} onChange={(e) => setCategory(e.target.value as any)} className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-bold">
            {PLACE_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" value={cost} onChange={(e) => setCost(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Fare ₹" className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-bold" />
          <select value={costType} onChange={(e) => setCostType(e.target.value as any)} className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs">
            <option value="per_person">per person</option>
            <option value="per_night">per night</option>
            <option value="entry_fee">entry fee</option>
            <option value="meal_for_two">meal for two</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-bold cursor-pointer">Upload img</button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImageUrl(await fileToDataUrl(f)); }} />
          <input value={imageUrl.startsWith('data:') ? '' : imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="…or image URL" className="flex-1 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs" />
        </div>
        {imageUrl && <img src={imageUrl} alt="" className="w-full h-32 object-cover rounded-xl border" />}
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" rows={2} className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs" />
        <input value={tips} onChange={(e) => setTips(e.target.value)} placeholder="Tip (optional)" className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs" />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-bold text-slate-500 cursor-pointer">Cancel</button>
          <button type="submit" className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold cursor-pointer">{editing ? 'Save Changes' : 'Add Place'}</button>
        </div>
      </form>
    </div>
  );
}
