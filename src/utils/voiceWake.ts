import { Capacitor, registerPlugin } from '@capacitor/core';
import { apiBaseUrl, apiHostRoot } from './supabaseClient';

/**
 * Closed-app voice bridge (native VoiceWake plugin + server clip store).
 * - Sender uploads each burst (fire-and-forget); server fans out FCM offline-only.
 * - Notification tap stashes tripId natively; app consumes it once on launch.
 */

interface VoiceWakePlugin {
  getPendingVoiceTrip: () => Promise<{ tripId: string }>;
}

const VoiceWake = registerPlugin<VoiceWakePlugin>('VoiceWake');

/** Consume the notification-tap trip id once (null on web / nothing pending). */
export async function consumePendingVoiceTrip(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const r = await VoiceWake.getPendingVoiceTrip();
    return r && r.tripId ? r.tripId : null;
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
): Promise<{ voiceUrl: string; senderName: string } | null> {
  try {
    const res = await fetch(
      `${apiBaseUrl()}/voice-clips/latest?tripId=${encodeURIComponent(tripId)}&since=${since}`
    );
    const j = await res.json();
    if (j && j.data && j.data.voiceUrl) {
      return { voiceUrl: String(j.data.voiceUrl), senderName: String(j.data.senderName || 'Someone') };
    }
    return null;
  } catch {
    return null;
  }
}
