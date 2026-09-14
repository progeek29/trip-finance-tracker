import React, { useMemo, useState } from 'react';
import { Search, X, Send, Phone, Video } from 'lucide-react';
import type { Trip } from '../../types';
import { ChatView } from './ChatView';
import { appendThreadMessage, loadThread, ui } from './chatStore';

interface ChatThreadPageProps {
  trip?: Trip;
  threadId: string;
  title: string;
  subtitle: string;
  myName: string;
  myUid?: string | null;
  onHeaderClick?: () => void;
  onDummyAction: (msg: string) => void;
}

/**
 * Chat thread page: real trip chat embeds ChatView; 1:1 and custom
 * groups use an on-device thread. Every thread has message search.
 */
export const ChatThreadPage: React.FC<ChatThreadPageProps> = ({
  trip,
  threadId,
  title,
  subtitle,
  myName,
  myUid,
  onHeaderClick,
  onDummyAction,
}) => {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState(() => loadThread(threadId));

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () => (q ? messages.filter((m) => m.text.toLowerCase().includes(q)) : messages),
    [messages, q]
  );

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages(appendThreadMessage(threadId, { from: 'me', author: myName, text }));
    setDraft('');
  };

  return (
    <div className="flex flex-col min-h-0">
      {/* Header — tap opens members (groups) */}
      <button
        onClick={onHeaderClick}
        disabled={!onHeaderClick}
        className={`flex items-center gap-3 text-left ${onHeaderClick ? 'cursor-pointer' : ''}`}
      >
        <span className="w-11 h-11 rounded-full bg-indigo-600 text-white flex items-center justify-center text-base font-extrabold flex-shrink-0">
          {title.trim().charAt(0).toUpperCase() || 'C'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-sm font-bold text-slate-900 truncate">{title}</span>
          <span className="block text-[11px] text-slate-500 font-medium truncate">{subtitle}</span>
        </span>
        <span className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <span
            role="button"
            tabIndex={0}
            onClick={() => onDummyAction(`Voice call in "${title}" — coming soon`)}
            onKeyDown={(e) => e.key === 'Enter' && onDummyAction(`Voice call in "${title}" — coming soon`)}
            aria-label="Voice call"
            className={`${ui.iconBtn} text-slate-400 hover:text-emerald-600 hover:bg-emerald-50`}
          >
            <Phone size={17} />
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={() => onDummyAction(`Video call in "${title}" — coming soon`)}
            onKeyDown={(e) => e.key === 'Enter' && onDummyAction(`Video call in "${title}" — coming soon`)}
            aria-label="Video call"
            className={`${ui.iconBtn} text-slate-400 hover:text-indigo-600 hover:bg-indigo-50`}
          >
            <Video size={18} />
          </span>
        </span>
      </button>

      {/* In-chat search */}
      <div className="relative my-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search in conversation…"
          className={`${ui.input} h-10 pl-9 pr-9 text-xs`}
        />
        {query && (
          <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer">
            <X size={14} />
          </button>
        )}
      </div>

      {trip ? (
        <div className="flex flex-col min-h-0 h-[62dvh]">
          <ChatView trip={trip} myName={myName} myUid={myUid ?? null} unreadIds={[]} />
        </div>
      ) : (
        <>
          <div className="space-y-2 min-h-[40dvh] max-h-[52dvh] overflow-y-auto">
            {visible.map((m) => (
              <div key={m.id} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${m.from === 'me' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-800'}`}>
                  <p className="text-xs font-semibold leading-relaxed">{m.text}</p>
                </div>
              </div>
            ))}
            {visible.length === 0 && (
              <p className="text-[11px] text-slate-400 text-center py-8">
                {q ? `No messages match "${query}"` : 'No messages yet — say hi.'}
              </p>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Message…"
              className={ui.input}
            />
            <button onClick={send} aria-label="Send" className="w-11 h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center flex-shrink-0 transition-all active:scale-95 cursor-pointer">
              <Send size={17} />
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ChatThreadPage;
