import React, { useState } from 'react';
import { Compass, Wallet, Users, FolderOpen, Plus, Smartphone, X, Wifi, ArrowLeft, Globe } from 'lucide-react';

export type CleanTab = 'trip' | 'expenses' | 'split' | 'vault';

interface NavbarProps {
  activeTab: CleanTab;
  onTabChange: (tab: CleanTab) => void;
  onOpenQuickAdd: () => void;
  totalSpent: number;
  totalBudget: number;
  tripTitle?: string;
  onBackToTrips?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  onOpenQuickAdd,
  totalSpent,
  totalBudget,
  tripTitle,
  onBackToTrips,
}) => {
  const [isPhoneModalOpen, setIsPhoneModalOpen] = useState(false);
  const phoneUrl = `http://192.168.1.12:5173`;

  const tabs = [
    { id: 'trip' as CleanTab, label: 'Trip', icon: Compass },
    { id: 'expenses' as CleanTab, label: 'Expenses', icon: Wallet },
    { id: 'split' as CleanTab, label: 'Splitwise', icon: Users },
    { id: 'vault' as CleanTab, label: 'Vault', icon: FolderOpen },
  ];

  const spentPct = totalBudget > 0 ? Math.min(100, Math.round((totalSpent / totalBudget) * 100)) : 0;

  return (
    <>
      {/* Top Clean White Header */}
      <header className="sticky top-0 z-40 w-full bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          {/* Left: Back button or brand */}
          <div className="flex items-center gap-2.5 min-w-0">
            {onBackToTrips && (
              <button
                id="back-to-trips-btn"
                onClick={onBackToTrips}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition-colors flex-shrink-0"
                title="All Trips"
              >
                <ArrowLeft size={14} />
                <Globe size={13} className="text-indigo-500" />
              </button>
            )}

            {/* Brand + trip name */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white font-extrabold text-sm shadow-md shadow-indigo-200 flex-shrink-0">
                W
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-extrabold text-slate-900 text-sm tracking-tight font-display truncate max-w-[140px] sm:max-w-none">
                    {tripTitle ?? 'WanderSync'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <p className="text-[11px] text-slate-500 font-medium">
                    <span className="font-bold text-slate-700">₹{totalSpent.toLocaleString('en-IN')}</span>
                    {' '}of ₹{totalBudget.toLocaleString('en-IN')}
                  </p>
                  {/* Mini budget bar */}
                  <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                    <div
                      className={`h-full rounded-full ${spentPct > 85 ? 'bg-red-400' : spentPct > 65 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                      style={{ width: `${spentPct}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setIsPhoneModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 transition-colors"
              title="Open and test live on your mobile phone"
            >
              <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">Test on Phone</span>
            </button>

            <button
              onClick={onOpenQuickAdd}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm shadow-indigo-200 transition-all transform active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Log Spend</span>
            </button>
          </div>
        </div>
      </header>

      {/* Floating Bottom Navigation Pill Dock */}
      <div className="fixed bottom-5 left-0 right-0 z-40 flex justify-center px-4 pointer-events-none">
        <nav className="floating-dock pointer-events-auto rounded-2xl p-1.5 flex items-center gap-1 max-w-sm w-full justify-around shadow-xl">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 px-3 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.75]'}`} />
                <span className="text-[11px] sm:text-xs">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Phone Test QR Modal */}
      {isPhoneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="clean-surface max-w-sm w-full rounded-3xl p-6 border border-slate-200 bg-white text-center shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-emerald-600" />
                <h4 className="text-sm font-extrabold text-slate-900">Test Live on Phone</h4>
              </div>
              <button onClick={() => setIsPhoneModalOpen(false)} className="p-1 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Make sure your phone is on the same Wi-Fi, then scan this QR code with your camera:
            </p>

            <div className="bg-slate-50 p-3.5 rounded-2xl inline-block border border-slate-200">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(phoneUrl)}`}
                alt="Phone Link QR"
                className="w-44 h-44 mx-auto rounded-xl"
              />
            </div>

            <div className="bg-indigo-50 border border-indigo-100 p-2.5 rounded-xl">
              <span className="text-[10px] text-slate-500 block uppercase font-bold">Or enter in mobile browser:</span>
              <a href={phoneUrl} target="_blank" rel="noreferrer" className="text-xs font-mono font-extrabold text-indigo-700 hover:underline">
                {phoneUrl}
              </a>
            </div>

            <button
              onClick={() => setIsPhoneModalOpen(false)}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
};
