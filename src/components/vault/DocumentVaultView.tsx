import React, { useState } from 'react';
import { DocumentVaultItem, Trip } from '../../types';
import { 
  FileText, 
  Download, 
  Eye, 
  Plus, 
  Trash2, 
  ShieldCheck, 
  Plane, 
  Hotel, 
  FileBadge, 
  Tag, 
  Search, 
  ExternalLink,
  X
} from 'lucide-react';
import { Badge } from '../common/Badge';

interface DocumentVaultViewProps {
  documents: DocumentVaultItem[];
  trip: Trip;
  onAddDocument: (doc: DocumentVaultItem) => void;
  onDeleteDocument: (docId: string) => void;
}

export const DocumentVaultView: React.FC<DocumentVaultViewProps> = ({
  documents,
  trip,
  onAddDocument,
  onDeleteDocument,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [previewDoc, setPreviewDoc] = useState<DocumentVaultItem | null>(null);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  // New doc form state
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<DocumentVaultItem['category']>('ticket');
  const [newRef, setNewRef] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newPreviewUrl, setNewPreviewUrl] = useState('');

  const filtered = documents.filter((doc) => {
    if (selectedCategory !== 'all' && doc.category !== selectedCategory) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchTitle = doc.title.toLowerCase().includes(q);
      const matchRef = doc.referenceNumber?.toLowerCase().includes(q);
      const matchTag = doc.tags?.some(t => t.toLowerCase().includes(q));
      if (!matchTitle && !matchRef && !matchTag) return false;
    }
    return true;
  });

  const getCategoryIcon = (cat: DocumentVaultItem['category']) => {
    switch (cat) {
      case 'ticket': return Plane;
      case 'hotel': return Hotel;
      case 'id_proof': return ShieldCheck;
      default: return FileText;
    }
  };

  const handleCreateDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle) return;

    const doc: DocumentVaultItem = {
      id: 'doc_' + Date.now(),
      tripId: trip.id,
      title: newTitle,
      category: newCategory,
      fileType: 'pdf',
      fileSize: '1.2 MB',
      referenceNumber: newRef,
      notes: newNotes,
      previewUrl: newPreviewUrl || 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=400&q=80',
      uploadedAt: new Date().toISOString().split('T')[0],
      uploadedByMemberId: trip.members[0].id,
      tags: [newCategory.toUpperCase(), 'Goa Trip'],
    };

    onAddDocument(doc);
    setShowAddModal(false);
    setNewTitle('');
    setNewRef('');
    setNewNotes('');
    setNewPreviewUrl('');
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white font-display">Important Documents & Ticket Vault</h2>
            <Badge variant="indigo" size="sm">
              Offline Ready ⚡
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Store boarding passes, train tickets, hotel vouchers, Aadhaar IDs, and rental passes for instant access.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all self-start md:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Upload Document</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {['all', 'ticket', 'hotel', 'id_proof'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium capitalize transition-all ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white'
              }`}
            >
              {cat === 'all' ? 'All Documents' : cat.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search tickets, PNRs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 pr-3 py-1.5 rounded-xl glass-input text-xs w-56"
          />
        </div>
      </div>

      {/* Documents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((doc) => {
          const Icon = getCategoryIcon(doc.category);
          return (
            <div
              key={doc.id}
              className="glass-card rounded-2xl p-5 border border-white/10 flex flex-col justify-between hover:border-indigo-500/30 transition-all group"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] uppercase font-bold text-slate-400">{doc.category}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-slate-400">{doc.fileSize}</span>
                    <button
                      onClick={() => onDeleteDocument(doc.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <h3 className="font-bold text-white text-sm mb-1.5 line-clamp-2">{doc.title}</h3>

                {doc.referenceNumber && (
                  <div className="text-xs font-mono font-bold text-indigo-300 bg-slate-900/60 p-2 rounded-lg border border-white/5 mb-3 inline-block">
                    {doc.referenceNumber}
                  </div>
                )}

                {doc.notes && (
                  <p className="text-xs text-slate-400 line-clamp-2 mb-3">
                    {doc.notes}
                  </p>
                )}

                {doc.tags && doc.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-4">
                    {doc.tags.map((t, idx) => (
                      <span key={idx} className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-white/5">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                <span className="text-[10px] text-slate-500">Added on {doc.uploadedAt}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPreviewDoc(doc)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-semibold border border-indigo-500/30 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Document Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="glass-panel max-w-lg w-full rounded-3xl p-6 border border-white/10 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="font-bold text-white text-base font-display">{previewDoc.title}</h3>
              <button onClick={() => setPreviewDoc(null)} className="p-1 rounded-full text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {previewDoc.previewUrl ? (
              <div className="rounded-2xl overflow-hidden mb-4 border border-white/10 bg-slate-950">
                <img src={previewDoc.previewUrl} alt={previewDoc.title} className="w-full h-64 object-cover" />
              </div>
            ) : (
              <div className="p-8 text-center bg-slate-950/60 rounded-2xl mb-4 border border-white/5">
                <FileText className="w-12 h-12 text-indigo-400 mx-auto mb-2" />
                <p className="text-xs text-slate-400">PDF Document Ready for Offline Access</p>
              </div>
            )}

            <div className="space-y-2 text-xs text-slate-300 mb-6 bg-slate-950/40 p-4 rounded-xl border border-white/5">
              {previewDoc.referenceNumber && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Reference:</span>
                  <span className="font-mono font-bold text-indigo-300">{previewDoc.referenceNumber}</span>
                </div>
              )}
              {previewDoc.notes && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Notes:</span>
                  <span className="text-slate-200">{previewDoc.notes}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">Vault Security:</span>
                <span className="text-emerald-400 font-semibold">256-bit Cached Offline</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Close
              </button>
              <button
                onClick={() => {
                  alert('Document downloaded to device cache for offline viewing!');
                  setPreviewDoc(null);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save Offline</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Document Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="glass-panel max-w-md w-full rounded-2xl p-6 border border-white/10 bg-slate-900 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4 font-display">Add Document to Vault</h3>
            <form onSubmit={handleCreateDocument} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Document Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Flight Boarding Pass, Villa Agoda Voucher"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full rounded-xl glass-input px-3.5 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as any)}
                    className="w-full rounded-xl glass-input px-3 py-2 text-xs bg-slate-900"
                  >
                    <option value="ticket">Ticket (Flight/Train/Bus)</option>
                    <option value="hotel">Hotel / Villa Voucher</option>
                    <option value="id_proof">Aadhaar / ID Card</option>
                    <option value="visa">Pass / Permit</option>
                    <option value="other">Rental / Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">PNR / Reference #</label>
                  <input
                    type="text"
                    placeholder="e.g. R7KP9Q"
                    value={newRef}
                    onChange={(e) => setNewRef(e.target.value)}
                    className="w-full rounded-xl glass-input px-3 py-2 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Image / Voucher URL</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={newPreviewUrl}
                  onChange={(e) => setNewPreviewUrl(e.target.value)}
                  className="w-full rounded-xl glass-input px-3.5 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Gate 18B, check-in 2 hrs early"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full rounded-xl glass-input px-3.5 py-2 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-600/20"
                >
                  Save to Vault
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
