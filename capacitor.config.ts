import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kivora.app',
  appName: 'Kivora',
  webDir: 'out',
  bundledWebRuntime: false,
  server: {
    hostname: 'kivora.local',
    androidScheme: 'https',
  },
};

export default config;
