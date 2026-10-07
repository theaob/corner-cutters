import type { CapacitorConfig } from '@capacitor/cli';

// The Android and iOS apps: the same web build (dist/) in a WebView, played offline.
const config: CapacitorConfig = {
  appId: 'io.github.theaob.cornercutters',
  appName: 'Corner Cutters',
  webDir: 'dist',
  backgroundColor: '#0e0d16',
  android: {
    // the game has its own on-screen controls: no pinch-zoom or text selection to get in the way
    allowMixedContent: false,
    captureInput: false,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    // the page lays itself out under the notch and home bar (viewport-fit=cover, env(safe-area-inset-*))
    contentInset: 'never',
    scrollEnabled: false,
  },
};

export default config;
