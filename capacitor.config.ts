import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wandersync.tripapp',
  appName: 'WanderSync',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
};

export default config;
