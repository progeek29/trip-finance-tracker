import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/** True inside the installed Android app (WebView), false in browser. */
export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

interface ContactsPlugin {
  getContacts(): Promise<{ contacts: { name: string; phone: string }[] }>;
}

interface SmsReaderPlugin {
  requestSmsPermission(): Promise<{ granted: boolean }>;
  addListener(
    eventName: 'smsReceived',
    listener: (data: { sender: string; body: string }) => void
  ): Promise<PluginListenerHandle>;
}

export const NativeContacts = registerPlugin<ContactsPlugin>('Contacts');
export const NativeSms = registerPlugin<SmsReaderPlugin>('SmsReader');
