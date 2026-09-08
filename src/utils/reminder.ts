import { TransitReminder } from '../types';

/** Guess transit type from a ticket title (flight/train/bus/cab/stay) */
export function inferTransitType(title: string): TransitReminder['type'] {
  const t = title.toLowerCase();
  if (/train|rail|irctc|vande|express|shatabdi|metro/.test(t)) return 'train';
  if (/bus|redbus|zingbus|volvo|sleeper/.test(t)) return 'bus';
  if (/cab|taxi|ola|uber|transfer/.test(t)) return 'cab';
  if (/hotel|villa|resort|check.?in|stay|cottage|hut/.test(t)) return 'hotel_checkin';
  return 'flight';
}

/** Autofetch a clean PNR/booking code from a ticket reference like "PNR: R7KP9Q" */
export function extractPnr(ref: string): string {
  if (!ref) return '';
  const cleaned = ref.replace(/^PNR\s*:?\s*/i, '').trim();
  const m = cleaned.match(/[A-Z0-9][A-Z0-9-]{3,}/i);
  return (m ? m[0] : cleaned).toUpperCase();
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** "in 3 days" / "in 5 hrs" / "due now" for a reminder datetime */
export function reminderCountdown(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const diff = t - Date.now();
  if (diff <= 0) return 'due now';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `in ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `in ${hrs} hr${hrs > 1 ? 's' : ''}`;
  const days = Math.floor(hrs / 24);
  return `in ${days} day${days > 1 ? 's' : ''}`;
}
