import { LocalNotifications } from '@capacitor/local-notifications';
import { isNativeApp } from './nativeBridge';

/** High-importance channel: heads-up flash + vibration + sound. */
export const REMINDER_CHANNEL = 'wander_trip';

export async function ensureReminderChannel(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') return false;
    await LocalNotifications.createChannel({
      id: REMINDER_CHANNEL,
      name: 'Trip Reminders',
      description: 'Ticket and expense alerts',
      importance: 5,
      vibration: true,
      visibility: 1,
    });
    return true;
  } catch {
    return false;
  }
}

export async function loudNotify(title: string, body: string, id: number, at?: Date): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title,
          body,
          channelId: REMINDER_CHANNEL,
          schedule: at ? { at, allowWhileIdle: true } : undefined,
        },
      ],
    });
  } catch { /* notifications unavailable */ }
}

export async function cancelNotify(id: number): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch { /* ignore */ }
}
