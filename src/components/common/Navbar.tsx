import React from 'react';
import { Compass, Wallet, Newspaper, Plus, ArrowLeft, Bell, MapPin, Users } from 'lucide-react';
import { Logo } from './Logo';
import { ImpersonateBanner } from '../admin/ImpersonateBanner';

export type CleanTab = 'trip' | 'todo' | 'expenses' | 'chat' | 'split' | 'vault';

interface NavbarProps {
  activeTab: CleanTab;
  onTabChange: (tab: CleanTab) => void;
  onOpenQuickAdd: () => void;
  totalSpent: number;
  totalBudget: number;
  tripTitle?: string;
  onBackToTrips?: () => void;
  /** Bottom-bar Discover → always lands on the Discover feed (not just "back"). */
  onGoDiscover?: () => void;
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
  onGoDiscover,
  unreadCount,
  onBellClick,
  bellPulse = 0,
}) => {
  const tabs = [
    { id: 'trip' as CleanTab, label: 'Trip', icon: MapPin },
    { id: 'todo' as CleanTab, label: 'Timeline', icon: Newspaper },
    { id: 'expenses' as CleanTab, label: 'Expenses', icon: Wallet },
    // Trip-internal Squadroom chat — VISIBLE (group per trip stays).
    // Landing-page global chat hub stays hidden (TripLandingView) until chat P2.
    { id: 'chat' as CleanTab, label: 'Chat', icon: Users },
    // VAULT DISABLED (temp) — data + views intact, button hidden. Re-add:
    // { id: 'vault' as CleanTab, label: 'Vault', icon: FolderOpen },
  ];

  const spentPct = totalBudget > 0 ? Math.min(100, Math.round((totalSpent / totalBudget) * 100)) : 0;

  // Bell is static — red dot only when unreadCount > 0. Opening panel clears it.
  void bellPulse;

  return (
    <>
      <ImpersonateBanner />
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
              <span className="inline-flex">
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

      {activeTab !== 'chat' && (() => {
        // Order: Discover · Trip · [+] (moment composer) · Timeline · Expenses · Chat
        const byId = (id: CleanTab) => tabs.find((t) => t.id === id)!;
        const item = (tab: { id: CleanTab; label: string; icon: typeof Compass }) => ({
          id: tab.id,
          label: tab.label,
          Icon: tab.icon,
          active: activeTab === tab.id,
          onClick: () => onTabChange(tab.id),
        });
        return (
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200/80 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] [transform:translateZ(0)]">
            <nav className="max-w-3xl mx-auto px-4 pt-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex justify-around items-center">
              {(onGoDiscover || onBackToTrips) && (
                <button
                  key="home"
                  onClick={onGoDiscover || onBackToTrips}
                  aria-label="Discover"
                  title="Discover"
                  className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 transition-colors cursor-pointer"
                >
                  <Compass size={22} strokeWidth={1.8} className="text-slate-400" />
                  <span className="text-[10px] leading-tight text-slate-400 font-medium">
                    Discover
                  </span>
                </button>
              )}
              {[item(byId('trip'))].map(({ id, label, Icon, active, onClick }) => (
                <button
                  key={id}
                  onClick={onClick}
                  aria-label={label}
                  title={label}
                  className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 transition-colors cursor-pointer"
                >
                  <Icon
                    size={22}
                    strokeWidth={active ? 2.2 : 1.8}
                    className={active ? 'text-indigo-600' : 'text-slate-400'}
                  />
                  <span className={`text-[10px] leading-tight ${active ? 'text-indigo-600 font-bold' : 'text-slate-400 font-medium'}`}>
                    {label}
                  </span>
                </button>
              ))}
              {[item(byId('todo')), item(byId('expenses')), item(byId('chat'))].map(({ id, label, Icon, active, onClick }) => (
                <button
                  key={id}
                  onClick={onClick}
                  aria-label={label}
                  title={label}
                  className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 transition-colors cursor-pointer"
                >
                  <Icon
                    size={22}
                    strokeWidth={active ? 2.2 : 1.8}
                    className={active ? 'text-indigo-600' : 'text-slate-400'}
                  />
                  <span className={`text-[10px] leading-tight ${active ? 'text-indigo-600 font-bold' : 'text-slate-400 font-medium'}`}>
                    {label}
                  </span>
                </button>
              ))}
            </nav>
          </div>
        );
      })()}
    </>
  );
};
