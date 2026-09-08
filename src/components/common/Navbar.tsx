import React from 'react';
import { Compass, Wallet, ListChecks, FolderOpen, Plus, ArrowLeft, MessageCircle, Bell } from 'lucide-react';
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
}) => {
  const tabs = [
    { id: 'trip' as CleanTab, label: 'Trip', icon: Compass },
    { id: 'todo' as CleanTab, label: 'Todo', icon: ListChecks },
    { id: 'expenses' as CleanTab, label: 'Expenses', icon: Wallet },
    { id: 'chat' as CleanTab, label: 'Chat', icon: MessageCircle },
    { id: 'vault' as CleanTab, label: 'Vault', icon: FolderOpen },
  ];

  const spentPct = totalBudget > 0 ? Math.min(100, Math.round((totalSpent / totalBudget) * 100)) : 0;

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
                className="flex items-center justify-center w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors flex-shrink-0"
                title="All Trips"
              >
                <ArrowLeft size={15} />
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
              className="relative p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              title="Notifications"
            >
              <Bell size={19} />
              {(unreadCount || 0) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-rose-600 text-white text-[9px] font-extrabold flex items-center justify-center">
                  {(unreadCount || 0) > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={onOpenQuickAdd}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold shadow-sm shadow-indigo-200 transition-all transform active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Log Spend</span>
            </button>
          </div>
        </div>
      </header>

      {activeTab === 'chat' ? (
        /* Chat page: slim tab bar stuck to the top, input stays at the very bottom */
        <div className="sticky top-14 z-40 bg-slate-50/95 backdrop-blur-md border-b border-slate-200/80 flex-shrink-0">
          <nav className="max-w-3xl mx-auto px-4 sm:px-6 py-1.5 flex items-center gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    isActive ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      ) : (
        /* Floating Bottom Navigation Pill Dock (slim) */
        <div className="fixed bottom-3 left-0 right-0 z-40 flex justify-center px-4 pointer-events-none">
          <nav className="floating-dock pointer-events-auto rounded-2xl p-1 flex items-center gap-1 max-w-sm w-full justify-around shadow-xl">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 py-1.5 px-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.75]'}`} />
                  <span className="text-[10px] sm:text-xs">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
};
