import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio } from 'lucide-react';
import { useVoicePush } from './useVoicePush';

interface TalkButtonProps {
  tripId: string;
  byName: string;
}

const WAVE_BARS = [10, 18, 26, 14, 22, 12, 20, 16, 24, 11, 19, 13];

/** Walkie-talkie PTT: indigo trigger idle, dark luxury cockpit while recording. */
export const TalkButton: React.FC<TalkButtonProps> = ({ tripId, byName }) => {
  const { recording, elapsed, status, toggle, maxSecs } = useVoicePush(tripId, byName);

  const mm = Math.floor(elapsed / 60);
  const ss = String(elapsed % 60).padStart(2, '0');
  void maxSecs;

  return (
    <div className="w-full">
      <AnimatePresence mode="wait" initial={false}>
        {!recording ? (
          <motion.button
            key="ptt-trigger"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.18 }}
            onClick={toggle}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-gradient-to-r from-[#6366f1] to-[#4f46e5] text-white font-semibold text-base shadow-[0_10px_25px_rgba(79,70,229,0.25)] hover:shadow-[0_12px_30px_rgba(79,70,229,0.35)] active:scale-[0.99] transition-all duration-200 cursor-pointer focus:outline-none"
          >
            <Radio size={20} strokeWidth={2.5} />
            <span className="tracking-wide">Walkie-Talkie</span>
          </motion.button>
        ) : (
          <motion.div
            key="ptt-cockpit"
            initial={{ scale: 0.96, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 10 }}
            transition={{ duration: 0.18 }}
            className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-gray-950 text-white border border-gray-800 shadow-[0_20px_40px_rgba(0,0,0,0.25)]"
          >
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              <span className="font-mono text-sm font-semibold tracking-wider text-gray-300 tabular-nums">
                {mm}:{ss}
              </span>
            </div>
            <div className="flex items-center gap-1 h-6 flex-1 justify-center" aria-hidden>
              {WAVE_BARS.map((h, i) => (
                <motion.span
                  key={i}
                  animate={{ height: [8, h, 8] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.04, ease: 'easeInOut' }}
                  className="w-[3px] rounded-full bg-gradient-to-t from-[#6366f1] to-[#a5b4fc]"
                />
              ))}
            </div>
            <button
              onClick={toggle}
              className="flex-shrink-0 px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-xs font-bold uppercase tracking-widest text-white transition-all cursor-pointer focus:outline-none"
            >
              Tap to Send
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {status && <p className="text-[11px] text-slate-500 font-medium text-center mt-1.5">{status}</p>}
    </div>
  );
};
