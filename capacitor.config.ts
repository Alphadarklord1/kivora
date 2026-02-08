import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.studypilot.app',
  appName: 'StudyPilot',
  webDir: 'out',
  bundledWebRuntime: false,
  server: {
    hostname: 'studypilot.local',
    androidScheme: 'https',
  },
};

export default config;
