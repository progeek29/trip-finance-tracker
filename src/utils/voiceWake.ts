import { Capacitor, registerPlugin } from '@capacitor/core';
import { apiBaseUrl, apiHostRoot } from './supabaseClient';

/**
 * Closed-app voice bridge (native VoiceWake plugin + server clip store).
 * - Sender uploads each burst (fire-and-forget); server fans out FCM offline-only.
 * - Notification tap stashes tripId natively; app consumes it once on launch.
 */

interface VoiceWakePlugin {
  getPendingVoiceTrip: () => Promise<{ tripId: string }>;
  getPendingVoice: () => Promise<{ tripId: string; clipId: string }>;
  getLastNativePlayed: () => Promise<{ clipId: string; at: number }>;
}

const VoiceWake = registerPlugin<VoiceWakePlugin>('VoiceWake');

/** Consume the notification-tap voice (trip + clip) once (null on web / nothing pending). */
export async function consumePendingVoice(): Promise<{ tripId: string; clipId: string } | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const r = await VoiceWake.getPendingVoice();
    return r && r.tripId ? { tripId: r.tripId, clipId: r.clipId || '' } : null;
  } catch {
    return null;
  }
}

/** Clip the native player finished (to skip JS replay after tap-to-open). */
export async function lastNativePlayed(): Promise<{ clipId: string; at: number } | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const r = await VoiceWake.getLastNativePlayed();
    return r && r.clipId ? { clipId: r.clipId, at: Number(r.at) || 0 } : null;
  } catch {
    return null;
  }
}

/** Fetch one clip by its full server URL (foreground FCM fallback). */
export async function fetchVoiceClipByUrl(
  clipUrl: string
): Promise<{ voiceUrl: string; senderName: string } | null> {
  try {
    const res = await fetch(clipUrl);
    const j = await res.json();
    if (j && j.data && j.data.voiceUrl) {
      return { voiceUrl: String(j.data.voiceUrl), senderName: String(j.data.senderName || 'Someone') };
    }
    return null;
  } catch {
    return null;
  }
}

/** Upload burst for offline members. Never throws — socket already served online. */
export function uploadVoiceClip(
  tripId: string,
  clipId: string,
  voiceUrl: string,
  senderUid: string | undefined,
  senderName: string,
  apiBase: string
): void {
  try {
    void fetch(`${apiBaseUrl()}/voice-clips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clipId, tripId, voiceUrl, senderUid, senderName, apiBase }),
    }).catch(() => undefined);
  } catch {
    /* offline — socket already delivered to online members */
  }
}

/** Latest unexpired clip for a trip (tap-to-open fallback play). */
export async function fetchLatestVoiceClip(
  tripId: string,
  since: number
): Promise<{ clipId: string; voiceUrl: string; senderName: string; at: number } | null> {
  try {
    const res = await fetch(
      `${apiBaseUrl()}/voice-clips/latest?tripId=${encodeURIComponent(tripId)}&since=${since}`
    );
    const j = await res.json();
    if (j && j.data && j.data.voiceUrl) {
      return {
        clipId: String(j.data.clipId || ''),
        voiceUrl: String(j.data.voiceUrl),
        senderName: String(j.data.senderName || 'Someone'),
        at: Number(j.data.at) || 0,
      };
    }
    return null;
  } catch {
    return null;
  }
}
