import React, { useState } from 'react';
import { SharedPhoto, Trip } from '../../types';
import { 
  Camera, 
  Heart, 
  Download, 
  MapPin, 
  Plus, 
  Sparkles, 
  User, 
  Maximize2, 
  X,
  Share2
} from 'lucide-react';
import { Badge } from '../common/Badge';

interface SharedAlbumViewProps {
  photos: SharedPhoto[];
  trip: Trip;
  onAddPhoto: (photo: SharedPhoto) => void;
  onLikePhoto: (photoId: string) => void;
}

export const SharedAlbumView: React.FC<SharedAlbumViewProps> = ({
  photos,
  trip,
  onAddPhoto,
  onLikePhoto,
}) => {
  const [selectedPhoto, setSelectedPhoto] = useState<SharedPhoto | null>(null);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [newUrl, setNewUrl] = useState<string>('');
  const [newCaption, setNewCaption] = useState<string>('');
  const [newLocation, setNewLocation] = useState<string>('Goa, India');

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl) return;

    const currentMember = trip.members.find(m => m.isCurrentUser) || trip.members[0];
    const created: SharedPhoto = {
      id: 'photo_' + Date.now(),
      tripId: trip.id,
      url: newUrl,
      caption: newCaption || 'Unforgettable moment from the trip! 📸',
      locationTag: newLocation,
      uploadedByMemberId: currentMember.id,
      uploadedByName: currentMember.name,
      uploadedAt: new Date().toISOString(),
      likesCount: 1,
      isPublicHighlight: true,
    };

    onAddPhoto(created);
    setShowUploadModal(false);
    setNewUrl('');
    setNewCaption('');
  };

  const handleDownloadAll = () => {
    alert(`Starting download of ${photos.length} HD photos from ${trip.title}...`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white font-display">Live Trip Photo Album</h2>
            <Badge variant="emerald" size="sm">
              <Sparkles className="w-3 h-3 text-emerald-400" />
              <span>4-Friend Sync</span>
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time shared gallery where all 4 friends can snap, view, and download memories together.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadAll}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl glass-card text-slate-300 hover:text-white text-xs font-semibold border border-white/10 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download All ({photos.length})</span>
          </button>

          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-pink-600/20 transition-all"
          >
            <Camera className="w-4 h-4" />
            <span>+ Snap / Post Photo</span>
          </button>
        </div>
      </div>

      {/* Photo Stream Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="group relative rounded-3xl overflow-hidden glass-card border border-white/10 aspect-[4/5] bg-slate-900 shadow-xl flex flex-col justify-end"
          >
            {/* Background Image */}
            <img
              src={photo.url}
              alt={photo.caption || 'Trip Photo'}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />

            {/* Gradient Dark Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

            {/* Top Bar with Location & Fullscreen icon */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
              {photo.locationTag && (
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-950/70 backdrop-blur-md text-[10px] font-medium text-slate-200 border border-white/10">
                  <MapPin className="w-3 h-3 text-pink-400" />
                  <span>{photo.locationTag}</span>
                </span>
              )}

              <button
                onClick={() => setSelectedPhoto(photo)}
                className="w-7 h-7 rounded-full bg-slate-950/70 backdrop-blur-md flex items-center justify-center text-slate-300 hover:text-white border border-white/10 transition-colors"
                title="Expand Photo"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Bottom Caption & Photographer info */}
            <div className="relative z-10 p-4 space-y-2">
              <p className="text-xs font-semibold text-white line-clamp-2 leading-relaxed">
                {photo.caption}
              </p>

              <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs text-slate-300">
                <div className="flex items-center gap-1.5">
                  <User className="w-3 h-3 text-indigo-400" />
                  <span className="text-[11px] font-medium">{photo.uploadedByName}</span>
                </div>

                <button
                  onClick={() => onLikePhoto(photo.id)}
                  className="flex items-center gap-1 text-pink-400 hover:text-pink-300 transition-colors"
                >
                  <Heart className="w-3.5 h-3.5 fill-pink-500/30" />
                  <span className="text-[11px] font-bold">{photo.likesCount}</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox / Fullscreen Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-lg">
          <div className="relative max-w-3xl w-full glass-panel rounded-3xl overflow-hidden border border-white/10 bg-slate-900 shadow-2xl">
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-4 right-4 z-20 p-2 rounded-full bg-slate-950/80 text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <img
              src={selectedPhoto.url}
              alt={selectedPhoto.caption}
              className="w-full max-h-[70vh] object-contain bg-slate-950"
            />

            <div className="p-6 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-pink-400 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{selectedPhoto.locationTag || 'Goa'}</span>
                </span>
                <span className="text-xs text-slate-400">Captured by {selectedPhoto.uploadedByName}</span>
              </div>
              <p className="text-sm font-medium text-white">{selectedPhoto.caption}</p>
            </div>
          </div>
        </div>
      )}

      {/* Upload Photo Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="glass-panel max-w-md w-full rounded-2xl p-6 border border-white/10 bg-slate-900 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4 font-display">Post Photo to Trip Stream</h3>
            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Image URL *</label>
                <input
                  type="url"
                  required
                  placeholder="https://images.unsplash.com/..."
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="w-full rounded-xl glass-input px-3.5 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Caption / Story</label>
                <input
                  type="text"
                  placeholder="e.g. Scuba diving at Grand Island! 🤿"
                  value={newCaption}
                  onChange={(e) => setNewCaption(e.target.value)}
                  className="w-full rounded-xl glass-input px-3.5 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Location Tag</label>
                <input
                  type="text"
                  placeholder="e.g. Vagator Beach, Goa"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  className="w-full rounded-xl glass-input px-3.5 py-2 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-semibold text-xs shadow-md shadow-pink-600/20"
                >
                  Share to Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
