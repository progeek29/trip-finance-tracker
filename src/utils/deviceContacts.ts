import { NativeContacts, isNativeApp } from './nativeBridge';

export interface DeviceContact {
  name: string;
  phone: string;
}

export type ContactSource = 'native' | 'web';

/**
 * Phone contacts, best source first:
 * 1. Android app → native reader (OS permission popup)
 * 2. Browser → Web Contact Picker (Android Chrome)
 * Throws when neither works — caller shows manual fallback.
 */
export async function fetchDeviceContacts(): Promise<{ source: ContactSource; contacts: DeviceContact[] }> {
  if (isNativeApp()) {
    const res = await NativeContacts.getContacts();
    const list = (res.contacts || []).filter((c) => c.name && c.phone);
    if (list.length === 0) throw new Error('EMPTY');
    return { source: 'native', contacts: list };
  }
  const nav = navigator as unknown as { contacts?: { select: (f: string[], o: { multiple: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]> } };
  if (nav.contacts?.select) {
    const picked = await nav.contacts.select(['name', 'tel'], { multiple: true });
    const list: DeviceContact[] = picked
      .filter((c) => c.name?.length)
      .map((c) => ({ name: c.name![0], phone: c.tel?.[0] || '' }));
    if (list.length === 0) throw new Error('EMPTY');
    return { source: 'web', contacts: list };
  }
  throw new Error('UNSUPPORTED');
}
