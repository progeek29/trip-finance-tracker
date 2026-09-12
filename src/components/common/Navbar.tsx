import React, { useEffect, useState } from 'react';
import { Compass, Wallet, ListChecks, Plus, ArrowLeft, MessageCircle, Bell } from 'lucide-react';
import { Logo } from './Logo';

export type CleanTab = 'trip' | 'todo' | 'expenses' | 'chat' | 'split' | 'vault';

interface NavbarProps {
  activeTab: CleanTab;
  onTabChange: (tab: CleanTab) => void;
  onOpenQuickAdd: () => void;
  totalSpent: number;
  totalBudget: number;
  tripTitle?: string;
  onBackToTrips?: () => void;
  unreadCount?: number;
  onBellClick?: () => void;
  /** Bumps on every new notification → bell jiggles red + vibrates (same size). */
  bellPulse?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  onOpenQuickAdd,
  totalSpent,
  totalBudget,
  tripTitle,
  onBackToTrips,
  unreadCount,
  onBellClick,
  bellPulse = 0,
}) => {
  const tabs = [
    { id: 'trip' as CleanTab, label: 'Trip', icon: Compass },
    { id: 'todo' as CleanTab, label: 'Todo', icon: ListChecks },
    { id: 'expenses' as CleanTab, label: 'Expenses', icon: Wallet },
    { id: 'chat' as CleanTab, label: 'Chat', icon: MessageCircle },
    // VAULT DISABLED (temp) — data + views intact, button hidden. Re-add:
    // { id: 'vault' as CleanTab, label: 'Vault', icon: FolderOpen },
  ];

  const spentPct = totalBudget > 0 ? Math.min(100, Math.round((totalSpent / totalBudget) * 100)) : 0;

  // New notification → bell jiggles red ~2s + vibrates (size never changes)
  const [ringing, setRinging] = useState(false);
  useEffect(() => {
    if (!bellPulse) return;
    setRinging(true);
    try {
      navigator.vibrate?.([70, 50, 70]);
    } catch { /* vibrate unsupported */ }
    const t = window.setTimeout(() => setRinging(false), 2000);
    return () => window.clearTimeout(t);
  }, [bellPulse]);

  return (
    <>
      {/* Top Clean White Header */}
      <header className="sticky top-0 z-40 w-full bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-sm flex-shrink-0">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          {/* Left: Back button or brand */}
          <div className="flex items-center gap-2.5 min-w-0">
            {onBackToTrips && (
              <button
                id="back-to-trips-btn"
                onClick={onBackToTrips}
                className="flex items-center justify-center p-1 text-slate-700 hover:text-indigo-600 transition-colors flex-shrink-0 cursor-pointer"
                title="Back to trip"
              >
                <ArrowLeft size={20} strokeWidth={2} />
              </button>
            )}

            {/* Brand + trip name */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex-shrink-0">
                <Logo size={32} />
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
              onClick={onBellClick}
              className="relative w-8 h-8 flex items-center justify-center text-slate-600 hover:text-indigo-600 transition-colors cursor-pointer"
              title="Notifications"
            >
              <span className={`inline-flex ${ringing ? 'bell-jiggle' : ''}`}>
                <Bell size={19} />
              </span>
              {(unreadCount || 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-rose-600 text-white text-[9px] font-extrabold flex items-center justify-center">
                  {(unreadCount || 0) > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={onOpenQuickAdd}
              className="flex items-center gap-1 px-3 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold shadow-sm shadow-indigo-200 transition-all transform active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Spend</span>
            </button>
          </div>
        </div>
      </header>

      {activeTab !== 'chat' && (
        /* Airbnb-style bottom bar: white, top border, icon-over-label, indigo active */
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 shadow-[0_-8px_30px_rgba(0,0,0,0.03)] [transform:translateZ(0)]">
          <nav className="max-w-3xl mx-auto px-4 pt-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex justify-around items-center">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className="flex flex-col items-center justify-center bg-transparent border-0 gap-0.5 flex-1 py-0.5 transition-all duration-200 ease-out active:scale-95 focus:outline-none cursor-pointer"
                >
                  <Icon
                    size={20}
                    strokeWidth={2}
                    className={`transition-colors duration-200 ${isActive ? 'text-[#4f46e5]' : 'text-gray-400'}`}
                  />
                  <span
                    className={`text-[9px] leading-tight tracking-tight transition-colors duration-200 ${
                      isActive ? 'text-[#4f46e5] font-bold' : 'text-gray-500 font-medium'
                    }`}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
};
