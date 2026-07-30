import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The native shell.
 *
 * Pisga stays a PWA — this wrapper exists for one reason: Apple Health and
 * Health Connect have no cloud API and no web API. Health data lives on the
 * device and only a native app the user granted permission to can read it, so
 * V2 (sensor verification) is unreachable from the browser no matter what we
 * build. Everything else in the app is the same code, served from the same
 * build output.
 *
 * Health Connect is also where Samsung Health writes its data, so the Android
 * side covers Samsung without a Samsung-specific SDK.
 */
const config: CapacitorConfig = {
  appId: 'app.pisga.mobile',
  appName: 'פסגה',
  webDir: 'dist',
  // The shell loads the built assets from disk, not from a server, so the app
  // opens without a network round trip and the existing service worker keeps
  // doing the caching it already does.
  android: {
    // Health Connect requires targeting a recent SDK; Capacitor 7 defaults are
    // current. Declared here so it is visible rather than buried in Gradle.
    allowMixedContent: false,
  },
}

export default config
