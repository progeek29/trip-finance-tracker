import React from 'react';
import { Bell, Receipt, AtSign, MessageCircle, MapPin, Radio } from 'lucide-react';
import type { FeedItem } from '../../utils/notifications';

interface NotifFeedPanelProps {
  feed: FeedItem[];
  unreadCount: number;
  /** Names used to blue-highlight @handles inside bodies (trip members). */
  memberNames: string[];
  onClose: () => void;
  onOpenItem: (item: FeedItem) => void;
  onMarkAllRead: () => void;
}

const META: Record<FeedItem['category'], { icon: React.ReactNode; box: string }> = {
  transaction: {
    icon: <Receipt size={12} />,
    box: 'bg-emerald-50 border-emerald-200 text-emerald-600',
  },
  mention: {
    icon: <AtSign size={12} />,
    box: 'bg-indigo-50 border-indigo-200 text-indigo-600',
  },
  message: {
    icon: <MessageCircle size={12} />,
    box: 'bg-slate-100 border-slate-200 text-slate-500',
  },
  location: {
    icon: <MapPin size={12} />,
    box: 'bg-teal-50 border-teal-200 text-teal-600',
  },
  siren: {
    icon: <Bell size={12} />,
    box: 'bg-violet-50 border-violet-200 text-violet-600',
  },
  voice: {
    icon: <Radio size={12} />,
    box: 'bg-indigo-50 border-indigo-200 text-indigo-600',
  },
};

/** Unified notifications panel — one design everywhere (trip header bell +
 *  landing header bell open this exact panel). Full-width header, same fonts. */
export const NotifFeedPanel: React.FC<NotifFeedPanelProps> = ({
  feed,
  unreadCount,
  memberNames,
  onClose,
  onOpenItem,
  onMarkAllRead,
}) => {
  const renderBody = (f: FeedItem) => {
    // Handles (@squad / @Member) + trip name (join lines) blue — baaki plain.
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const handles = [
      'squad',
      ...memberNames.map((m) => m.replace(/\(You\)/g, '').trim()).filter(Boolean),
    ].sort((a, b) => b.length - a.length).map((n) => `@${esc(n)}`);
    if (f.tripHighlight) handles.push(esc(f.tripHighlight));
    if (handles.length === 0) return <span>{f.messageBody}</span>;
    const parts = f.messageBody.split(new RegExp(`(${handles.join('|')})(?!\\w)`, 'gi'));
    return parts.map((seg, i) =>
      i % 2 === 1 ? (
        <span key={i} className="text-indigo-600 font-bold">{seg}</span>
      ) : (
        <span key={i}>{seg}</span>
      )
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col panel-enter">
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white/95 backdrop-blur">
        <button onClick={onClose} aria-label="Back" title="Back" className="p-1.5 -ml-1 rounded-full text-slate-700 hover:text-indigo-600 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <span className="relative w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
          <Bell size={18} className="text-white" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 border-2 border-white text-white text-[9px] font-extrabold flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-extrabold text-slate-900 leading-tight">Notifications</h4>
          <p className="text-[11px] text-slate-500 font-medium leading-tight">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={onMarkAllRead}
            className="flex-shrink-0 px-3 h-8 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold transition-colors cursor-pointer"
          >
            Mark all read
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto bg-white overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        {unreadCount > 0 && (
          <p className="px-4 pt-2 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-rose-600 sticky top-0 bg-white">
            Unread — {unreadCount}
          </p>
        )}
        {feed.map((f) => {
          const meta = META[f.category];
          const inner = (
            <>
              {f.isUnread && <span className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 flex-shrink-0" />}
              <span className={`w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 ${meta.box}`}>
                {meta.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-slate-600 truncate">
                  <strong className="font-extrabold text-slate-900">{f.actor}</strong>{' '}{renderBody(f)}{' '}
                  {f.highlightData && (
                    <span className={`inline-block px-1.5 py-px rounded-md text-[10px] font-extrabold ${f.category === 'transaction' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                      {f.highlightData}
                    </span>
                  )}
                </span>
                {f.previewText && (f.category === 'message' || f.category === 'mention') && (
                  <span className="block text-[11px] text-slate-500 truncate">"{f.previewText}"</span>
                )}
                <span className="block text-[10px] text-slate-400 font-medium">{f.relativeTime}</span>
              </span>
            </>
          );
          return f.opensChat ? (
            <button
              key={f.id}
              onClick={() => onOpenItem(f)}
              className={`w-full text-left px-4 py-2.5 border-b border-slate-50 hover:bg-indigo-50/50 cursor-pointer flex items-start gap-2 ${f.isUnread ? 'bg-indigo-50/40' : ''}`}
            >
              {inner}
            </button>
          ) : (
            <div
              key={f.id}
              className={`w-full text-left px-4 py-2.5 border-b border-slate-50 flex items-start gap-2 ${f.isUnread ? 'bg-indigo-50/40' : ''}`}
            >
              {inner}
            </div>
          );
        })}
        {feed.length === 0 && (
          <p className="text-[11px] text-slate-400 text-center py-6">No notifications yet.</p>
        )}
        {feed.length >= 30 && (
          <p className="text-[10px] text-slate-400 text-center py-3 font-medium">Showing latest 30 — scroll up for more</p>
        )}
      </div>
    </div>
  );
};
