import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.studyharbor.app',
  appName: 'StudyHarbor',
  webDir: 'out',
  bundledWebRuntime: false,
  server: {
    hostname: 'studyharbor.local',
    androidScheme: 'https',
  },
};

export default config;
