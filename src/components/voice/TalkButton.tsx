import React from 'react';
import { Radio } from 'lucide-react';
import { useVoicePush } from './useVoicePush';

interface TalkButtonProps {
  tripId: string;
  byName: string;
}

/** Walkie-talkie PTT on the Trip tab: tap to talk, tap to send. */
export const TalkButton: React.FC<TalkButtonProps> = ({ tripId, byName }) => {
  const { recording, elapsed, status, toggle, maxSecs } = useVoicePush(tripId, byName);

  const mm = Math.floor(elapsed / 60);
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="space-y-1.5">
      <button
        onClick={toggle}
        className={`w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-sm font-extrabold transition-all cursor-pointer shadow-md ${
          recording
            ? 'bg-rose-600 text-white animate-pulse shadow-rose-200'
            : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white shadow-indigo-200'
        }`}
      >
        <span className={`w-9 h-9 rounded-full flex items-center justify-center ${recording ? 'bg-white/20' : 'bg-white/15'}`}>
          <Radio size={20} />
        </span>
        <span>{recording ? `Talking… ${mm}:${ss} — tap to send` : 'Walkie-Talkie'}</span>
      </button>
      <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
        <div
          className={`h-1 rounded-full transition-all ${recording ? 'bg-rose-500' : 'bg-indigo-300'}`}
          style={{ width: recording ? `${Math.min(100, (elapsed / maxSecs) * 100)}%` : '0%' }}
        />
      </div>
      {status && <p className="text-[11px] text-slate-500 font-medium text-center">{status}</p>}
    </div>
  );
};
