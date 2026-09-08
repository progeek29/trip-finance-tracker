import React, { useState } from 'react';
import { X, Copy, Check, MoreHorizontal } from 'lucide-react';

interface ShareDialogProps {
  title?: string;
  tripTitle?: string;
  inviteCode?: string;
  url?: string;
  text?: string;
  onClose: () => void;
}

/**
 * Google "Share public link" Modal
 * Exact design replica of Google's public link sharing interface:
 * - Dark Google Surface (#1e1f20)
 * - Information disclaimer box
 * - Dark pill URL bar with internal "Copy link" action
 * - Circular social share icons: Facebook, Gmail, X, Reddit, WhatsApp
 */
export const ShareDialog: React.FC<ShareDialogProps> = ({
  title = 'Share public link',
  tripTitle = 'Trip',
  inviteCode,
  url,
  text,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  // Construct the canonical share link
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://wandersync.app';
  const shareUrl = url || (inviteCode ? `${origin}/?join=${inviteCode}` : origin);

  // Full invite message — copied to clipboard so pasting anywhere gives the complete message
  const fullInviteMessage =
    text ||
    `Join "${tripTitle}" on WanderSync!\n\nTap link to join: ${shareUrl}${inviteCode ? `\n(Invite code: ${inviteCode})` : ''}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullInviteMessage);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = fullInviteMessage;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const canNativeShare =
    typeof navigator !== 'undefined' &&
    !!(navigator as unknown as { share?: unknown }).share;

  const handleNativeShare = async () => {
    try {
      await (navigator as unknown as { share: (d: { title: string; text: string; url: string }) => Promise<void> }).share({
        title: `Join "${tripTitle}" on WanderSync`,
        text: fullInviteMessage,
        url: shareUrl,
      });
      onClose();
    } catch {
      /* user dismissed sheet */
    }
  };

  // Social share URLs
  const encUrl = encodeURIComponent(shareUrl);
  const encTrip = encodeURIComponent(tripTitle);
  const encCode = encodeURIComponent(inviteCode || '');
  const encMsg = encodeURIComponent(fullInviteMessage);

  const socialChannels = [
    {
      name: 'Facebook',
      bg: 'bg-[#1877F2]',
      color: 'text-white',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encUrl}`,
      icon: (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
    },
    {
      name: 'Gmail',
      bg: 'bg-[#2b2c30] border border-white/10',
      color: 'text-white',
      href: `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(`Join my trip: ${tripTitle}`)}&body=${encMsg}`,
      icon: (
        <svg viewBox="0 0 24 24" width="22" height="22">
          <path fill="#4285F4" d="M22 6.5V18c0 1.1-.9 2-2 2h-2V9.8l-6 4.5-6-4.5V20H4c-1.1 0-2-.9-2-2V6.5c0-.8.6-1.5 1.4-1.5.3 0 .7.1 1 .4L12 11.2l7.6-5.8c.3-.3.7-.4 1-.4.8 0 1.4.7 1.4 1.5z" />
          <path fill="#EA4335" d="M20.6 5c-.4-.4-1-.5-1.6-.1L12 10.2 4.9 4.9C4.4 4.5 3.7 4.6 3.3 5c-.2.2-.3.5-.3.8v.7l9 6.8 9-6.8v-.7c0-.3-.1-.6-.4-.8z" />
          <path fill="#FBBC05" d="M2 6.5L12 14l10-7.5V6c0-.8-.6-1.5-1.4-1.5-.3 0-.7.1-1 .4L12 10.2 4.4 4.9c-.3-.3-.7-.4-1-.4C2.6 4.5 2 5.2 2 6v.5z" />
          <path fill="#34A853" d="M4 20h2V9.8L2 6.8V18c0 1.1.9 2 2 2z" />
        </svg>
      ),
    },
    {
      name: 'X',
      bg: 'bg-[#000000] border border-white/15',
      color: 'text-white',
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(`Join my trip "${tripTitle}" on WanderSync! ✈️`)}&url=${encUrl}`,
      icon: (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
    },
    {
      name: 'Reddit',
      bg: 'bg-[#FF4500]',
      color: 'text-white',
      href: `https://www.reddit.com/submit?url=${encUrl}&title=${encodeURIComponent(`Join "${tripTitle}" on WanderSync`)}`,
      icon: (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.702zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.197-2.512-.73a.326.326 0 0 0-.232-.095z" />
        </svg>
      ),
    },
    {
      name: 'WhatsApp',
      bg: 'bg-[#25D366]',
      color: 'text-white',
      href: `https://api.whatsapp.com/send?text=${encMsg}`,
      icon: (
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M17.472 14.382c-.301-.15-1.78-.878-2.056-.979-.276-.101-.476-.15-.677.15-.201.301-.778.979-.954 1.18-.176.201-.351.226-.652.076-.301-.151-1.27-.468-2.418-1.493-.894-.799-1.497-1.786-1.673-2.087-.176-.301-.019-.464.132-.614.136-.135.301-.351.452-.527.15-.175.201-.301.301-.502.101-.201.05-.376-.025-.526-.075-.151-.677-1.633-.928-2.234-.244-.585-.492-.505-.677-.515-.175-.009-.376-.01-.577-.01-.201 0-.526.075-.802.376-.276.301-1.053 1.029-1.053 2.511 0 1.482 1.079 2.912 1.23 3.113.15.201 2.123 3.242 5.143 4.547.719.31 1.28.496 1.718.635.722.23 1.378.197 1.898.12.579-.087 1.78-.727 2.03-1.429.251-.702.251-1.304.176-1.429-.075-.125-.276-.201-.577-.351zM12.04 21.78a9.73 9.73 0 0 1-4.966-1.356l-.356-.211-3.693.968.985-3.6-.231-.368A9.733 9.733 0 0 1 2.308 12.04C2.308 6.671 6.671 2.308 12.04 2.308c2.6 0 5.045 1.013 6.883 2.852a9.69 9.69 0 0 1 2.852 6.88c0 5.37-4.363 9.74-9.735 9.74zm0-17.78C7.59 4 3.974 7.616 3.974 12.066c0 1.54.436 3.037 1.261 4.335l.195.305-.584 2.133 2.185-.573.295.175a8.04 8.04 0 0 0 4.212 1.189c4.475 0 8.09-3.616 8.09-8.065 0-2.158-.84-4.187-2.366-5.713A8.046 8.046 0 0 0 12.04 4z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Dark backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Google-style Dark Modal Card */}
      <div className="relative bg-[#1e1f20] text-white rounded-3xl border border-[#333538] shadow-2xl p-6 sm:p-7 w-full max-w-[460px] space-y-5 animate-in fade-in zoom-in-95 duration-150">
        {/* Header with Title & Close button */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white tracking-tight font-display">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Disclaimer / info card */}
        <div className="bg-[#28292c] rounded-2xl p-4 text-[13px] text-slate-300 leading-relaxed border border-white/5">
          This public link shares this trip, which may include personal itinerary and expense details.
        </div>

        {/* Link input bar + Copy link button */}
        <div className="bg-[#131314] rounded-full border border-white/15 p-1.5 pl-4 flex items-center justify-between gap-2 shadow-inner">
          <span className="text-[13px] text-slate-300 truncate font-normal select-all flex-1 min-w-0 pr-1">
            {shareUrl}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className={`px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all flex-shrink-0 shadow-sm border border-white/10 ${
              copied
                ? 'bg-emerald-600 text-white border-emerald-500 scale-102'
                : 'bg-[#2b2c30] hover:bg-[#383a3f] active:scale-95 text-white'
            }`}
          >
            {copied ? <Check size={14} className="stroke-[2.5]" /> : <Copy size={14} />}
            <span>{copied ? 'Copied link' : 'Copy link'}</span>
          </button>
        </div>

        {/* Social channels row: Facebook, Gmail, X, Reddit, WhatsApp */}
        <div className="pt-2">
          <div className="grid grid-cols-5 gap-2">
            {socialChannels.map((c) => (
              <a
                key={c.name}
                href={c.href}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center group cursor-pointer"
              >
                <div
                  className={`w-12 h-12 rounded-full ${c.bg} ${c.color} flex items-center justify-center transition-all duration-150 transform group-hover:scale-108 group-active:scale-95 shadow-md`}
                >
                  {c.icon}
                </div>
                <span className="text-[11px] text-slate-300 group-hover:text-white font-medium mt-2 text-center truncate block transition-colors">
                  {c.name}
                </span>
              </a>
            ))}
          </div>
        </div>

        {/* Optional Native Share fallback for system apps (Telegram, Bluetooth, AirDrop, etc.) */}
        {canNativeShare && (
          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={handleNativeShare}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer py-1 px-3 rounded-xl hover:bg-white/5"
            >
              <MoreHorizontal size={14} />
              <span>More sharing options...</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
