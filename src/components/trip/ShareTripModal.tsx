import React, { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { Logo } from '../common/Logo';
import { shareMessage } from '../../utils/invites';

interface ShareTripModalProps {
  code: string;
  tripTitle: string;
  onClose: () => void;
}

/** After Share: big code + copy + WhatsApp invite. */
export const ShareTripModal: React.FC<ShareTripModalProps> = ({ code, tripTitle, onClose }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const waText = encodeURIComponent(shareMessage(tripTitle, code));
  const waLink = `https://wa.me/?text=${waText}`;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 w-[320px] text-center space-y-4">
        <button onClick={onClose} className="absolute right-3 top-3 p-1 rounded-full text-slate-400 hover:text-slate-600 cursor-pointer" title="Close">
          <X size={16} />
        </button>
        <div className="flex justify-center">
          <Logo size={40} />
        </div>
        <div>
          <p className="text-xs text-slate-500 font-medium">Invite code for</p>
          <p className="text-sm font-extrabold text-slate-900 truncate">{tripTitle}</p>
        </div>
        <button
          onClick={copy}
          className="w-full py-3 rounded-2xl bg-indigo-50 border-2 border-dashed border-indigo-300 text-2xl font-extrabold tracking-[0.3em] text-indigo-700 hover:bg-indigo-100 cursor-pointer flex items-center justify-center gap-2"
          title="Tap to copy"
        >
          {code}
          {copied ? <Check size={18} className="text-emerald-600" /> : <Copy size={16} className="text-indigo-400" />}
        </button>
        <a
          href={waLink}
          target="_blank"
          rel="noreferrer"
          className="block w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
        >
          Share on WhatsApp
        </a>
        <p className="text-[11px] text-slate-400 font-medium">Friend taps Join on their phone and enters this code.</p>
      </div>
    </div>
  );
};
