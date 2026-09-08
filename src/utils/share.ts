import { Share } from '@capacitor/share';
import { isNativeApp } from './nativeBridge';

/**
 * System share sheet everywhere (Android-style: Copy on top,
 * Bluetooth + all apps below) — never hard-jumps into WhatsApp.
 */
export async function systemShare(title: string, text: string): Promise<'shared' | 'copied'> {
  // 1. Native sheet (installed app) — the real Android share dialog
  if (isNativeApp()) {
    try {
      await Share.share({ title, text, dialogTitle: title });
      return 'shared';
    } catch {
      // dismissed or failed → fall through to copy
    }
  }
  // 2. Web Share sheet (mobile browsers, modern desktop)
  try {
    const nav = navigator as unknown as {
      share?: (d: { title: string; text: string }) => Promise<void>;
      canShare?: (d: { text: string }) => boolean;
    };
    if (nav.share && (!nav.canShare || nav.canShare({ text }))) {
      await nav.share({ title, text });
      return 'shared';
    }
    throw new Error('NO_WEB_SHARE');
  } catch {
    // 3. Last resort: copy to clipboard (caller may toast it)
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    return 'copied';
  }
}
