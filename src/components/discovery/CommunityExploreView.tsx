import React, { useState } from 'react';
import { PlaceRecommendation, Trip } from '../../types';
import { 
  Compass, 
  MapPin, 
  Star, 
  DollarSign, 
  Clock, 
  Lightbulb, 
  CheckCircle2, 
  Plus, 
  Search, 
  Share2,
  Utensils,
  Hotel,
  Compass as CompassIcon,
  Sparkles
} from 'lucide-react';
import { Badge } from '../common/Badge';

interface CommunityExploreViewProps {
  recommendations: PlaceRecommendation[];
  trip: Trip;
  onAddRecommendation: (rec: PlaceRecommendation) => void;
}

export const CommunityExploreView: React.FC<CommunityExploreViewProps> = ({
  recommendations,
  trip,
  onAddRecommendation,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  // New recommendation form
  const [newTitle, setNewTitle] = useState('');
  const [newCity, setNewCity] = useState('North Goa');
  const [newCategory, setNewCategory] = useState<PlaceRecommendation['category']>('must_visit');
  const [newDesc, setNewDesc] = useState('');
  const [newFare, setNewFare] = useState<number | ''>('');
  const [newCostType, setNewCostType] = useState<PlaceRecommendation['costType']>('meal_for_two');
  const [newRating, setNewRating] = useState<number>(5);
  const [newImage, setNewImage] = useState('');
  const [newTips, setNewTips] = useState('');
  const [newTime, setNewTime] = useState('');

  const filtered = recommendations.filter((rec) => {
    if (selectedCategory !== 'all' && rec.category !== selectedCategory) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchTitle = rec.title.toLowerCase().includes(q);
      const matchCity = rec.cityName.toLowerCase().includes(q);
      const matchDesc = rec.description.toLowerCase().includes(q);
      if (!matchTitle && !matchCity && !matchDesc) return false;
    }
    return true;
  });

  const getCostTypeLabel = (costType: PlaceRecommendation['costType']) => {
    switch (costType) {
      case 'per_person': return 'per person';
      case 'per_night': return 'per night';
      case 'entry_fee': return 'entry ticket';
      case 'meal_for_two': return 'meal for 2';
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newFare) return;

    const currentMember = trip.members.find(m => m.isCurrentUser) || trip.members[0];
    const created: PlaceRecommendation = {
      id: 'rec_' + Date.now(),
      title: newTitle,
      cityName: newCity,
      category: newCategory,
      description: newDesc,
      estimatedFareOrCost: Number(newFare),
      costType: newCostType,
      rating: newRating,
      imageUrl: newImage || 'https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?auto=format&fit=crop&w=600&q=80',
      tips: newTips,
      bestTimeToVisit: newTime || 'Sunset / Evening',
      authorName: currentMember.name,
      authorAvatar: currentMember.avatar,
      verifiedByTrip: true,
    };

    onAddRecommendation(created);
    setShowAddModal(false);
    setNewTitle('');
    setNewDesc('');
    setNewFare('');
    setNewTips('');
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="glass-card rounded-3xl p-6 sm:p-8 border border-white/10 bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-950 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-xl">
            <Badge variant="purple" size="md">
              <Compass className="w-3.5 h-3.5 text-purple-400" />
              <span>Public Travel & Budget Guide</span>
            </Badge>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-white font-display">
              Must-Visit Places, Stays & Actual Fares
            </h2>

            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
              Explore verified recommendations, transparent expenses, food costs, and activity rates published from real travel itineraries.
            </p>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-2 py-3 px-5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 transition-all self-start md:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>+ Share Place & Fare Tip</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {['all', 'must_visit', 'food_cafe', 'stay', 'adventure'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium capitalize transition-all ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white'
              }`}
            >
              {cat === 'all' ? 'All Places' : cat.replace('_', ' & ')}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search places, shacks, stays..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 pr-3 py-1.5 rounded-xl glass-input text-xs w-56"
          />
        </div>
      </div>

      {/* Recommendations Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        {filtered.map((rec) => (
          <div
            key={rec.id}
            className="glass-card rounded-3xl overflow-hidden border border-white/10 flex flex-col md:flex-row hover:border-indigo-500/40 transition-all shadow-xl group"
          >
            {/* Image Thumbnail (Left) */}
            <div className="md:w-52 h-48 md:h-auto relative flex-shrink-0 bg-slate-950 overflow-hidden">
              <img
                src={rec.imageUrl}
                alt={rec.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute top-3 left-3">
                <span className="px-2.5 py-1 rounded-full bg-slate-950/80 backdrop-blur-md text-[10px] font-bold text-indigo-300 border border-white/10 uppercase">
                  {rec.category.replace('_', ' ')}
                </span>
              </div>
            </div>

            {/* Content (Right) */}
            <div className="p-5 flex flex-col justify-between flex-1 space-y-3">
              <div>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <h3 className="font-bold text-white text-base font-display">{rec.title}</h3>
                    <span className="flex items-center gap-1 text-xs text-pink-400 mt-0.5">
                      <MapPin className="w-3 h-3" />
                      <span>{rec.cityName}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 text-xs font-bold">
                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                    <span>{rec.rating}</span>
                  </div>
                </div>

                <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                  {rec.description}
                </p>

                {rec.tips && (
                  <div className="mt-2 text-xs text-slate-300 bg-slate-900/60 p-2 rounded-xl border border-white/5 flex items-start gap-1.5">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                    <span><strong>Tip:</strong> {rec.tips}</span>
                  </div>
                )}
              </div>

              {/* Bottom Fare & Verified Badge */}
              <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">Actual Cost / Fare</span>
                  <div className="text-base font-extrabold text-emerald-400 font-display">
                    ₹{rec.estimatedFareOrCost.toLocaleString('en-IN')}{' '}
                    <span className="text-[11px] font-normal text-slate-400">({getCostTypeLabel(rec.costType)})</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-right">
                  <img
                    src={rec.authorAvatar}
                    alt={rec.authorName}
                    className="w-6 h-6 rounded-full object-cover border border-white/10"
                  />
                  <div>
                    <span className="text-[10px] text-slate-400 block">Verified by</span>
                    <span className="text-xs font-medium text-slate-200">{rec.authorName}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Recommendation Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
          <div className="glass-panel max-w-lg w-full rounded-3xl p-6 sm:p-8 border border-white/10 bg-slate-900 shadow-2xl my-8">
            <h3 className="text-lg font-bold text-white mb-1 font-display">Share Place & Fare Recommendation</h3>
            <p className="text-xs text-slate-400 mb-4">Help other travelers discover great spots with transparent pricing.</p>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Place / Stay / Activity Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Thalassa Greek Taverna, Curlies Sunset Shack"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full rounded-xl glass-input px-3.5 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">City / Location *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Siolim, North Goa"
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    className="w-full rounded-xl glass-input px-3.5 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as any)}
                    className="w-full rounded-xl glass-input px-3 py-2 text-xs bg-slate-900"
                  >
                    <option value="must_visit">Must Visit Spot</option>
                    <option value="food_cafe">Food & Cafe</option>
                    <option value="stay">Stay / Hotel / Villa</option>
                    <option value="adventure">Adventure & Watersports</option>
                    <option value="hidden_gem">Hidden Gem</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Estimated Fare / Cost (₹) *</label>
                  <input
                    type="number"
                    required
                    placeholder="1800"
                    value={newFare}
                    onChange={(e) => setNewFare(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full rounded-xl glass-input px-3.5 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Cost Basis</label>
                  <select
                    value={newCostType}
                    onChange={(e) => setNewCostType(e.target.value as any)}
                    className="w-full rounded-xl glass-input px-3 py-2 text-xs bg-slate-900"
                  >
                    <option value="meal_for_two">Meal for Two</option>
                    <option value="per_person">Per Person</option>
                    <option value="per_night">Per Night</option>
                    <option value="entry_fee">Entry Fee</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="What makes this place special?"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full rounded-xl glass-input p-3 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Insider Tip / Best Time</label>
                <input
                  type="text"
                  placeholder="e.g. Reserve 2 days ahead for sunset sea deck table"
                  value={newTips}
                  onChange={(e) => setNewTips(e.target.value)}
                  className="w-full rounded-xl glass-input px-3.5 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Cover Image URL</label>
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/..."
                  value={newImage}
                  onChange={(e) => setNewImage(e.target.value)}
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
                  Publish Recommendation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
