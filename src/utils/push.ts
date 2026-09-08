import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase, ensureCloudUser } from './supabaseClient';

/**
 * Closed-app reach: FCM device tokens per trip + push via free Worker.
 * Set PUSH_WORKER_URL after deploying worker/ (else pushes stay local-only).
 */

export let PUSH_WORKER_URL = '';

export function setPushWorkerUrl(url: string): void {
  PUSH_WORKER_URL = url;
}

export async function registerPushToken(tripId: string): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== 'granted') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') return null;
    const token: string = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('TOKEN_TIMEOUT')), 15000);
      PushNotifications.addListener('registration', (t) => {
        clearTimeout(timer);
        resolve(t.value);
      });
      PushNotifications.addListener('registrationError', (e) => {
        clearTimeout(timer);
        reject(new Error(String((e as { error?: unknown }).error || 'REG_FAILED')));
      });
      void PushNotifications.register();
    });
    const user = await ensureCloudUser();
    await supabase.from('push_tokens').upsert({
      id: `${tripId}_${user.uid}`,
      tripId,
      uid: user.uid,
      token,
    });
    return token;
  } catch {
    return null;
  }
}

export interface PushPayload {
  tripId: string;
  kind: 'voice' | 'siren' | 'chat';
  title: string;
  body: string;
  voiceUrl?: string;
  voicePath?: string;
  senderUid?: string;
}

/** Fire-and-forget push to squad (open apps also get it via realtime anyway). */
export async function sendPush(payload: PushPayload): Promise<boolean> {
  if (!PUSH_WORKER_URL) {
    console.warn('push worker URL not set — open-app realtime still delivers');
    return false;
  }
  try {
    const res = await fetch(PUSH_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}
