import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 馬祖藍眼淚預報 — Capacitor 設定
 * webDir 由 scripts/sync-web.mjs 自 ../web 複製而來，請勿直接編輯 www/。
 */
const config: CapacitorConfig = {
  appId: 'tw.com.meishi.matsubluetears',
  appName: '馬祖藍眼淚預報',
  webDir: 'www',
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#0A1628',
    preferredContentMode: 'mobile',
  },
  android: {
    backgroundColor: '#0A1628',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      launchFadeOutDuration: 400,
      backgroundColor: '#0A1628',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0A1628',
      overlaysWebView: false,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_notify',
      iconColor: '#00D4FF',
    },
  },
};

export default config;
