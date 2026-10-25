import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Coque native Mentora (Android / iOS).
 * L'appli charge le site déployé sur Vercel : une mise à jour du site
 * met à jour l'appli sans repasser par les stores.
 *
 * MOBILE_APP_URL : URL du site (prod par défaut, ou http://10.0.2.2:3000 pour tester
 * sur l'émulateur Android avec `npm run dev`).
 */
const url = process.env.MOBILE_APP_URL ?? "https://mentora.vercel.app";
const isLocal = url.startsWith("http://");

const config: CapacitorConfig = {
  appId: "fr.mentora.app",
  appName: "Mentora",
  webDir: "mobile/www",
  server: {
    url,
    cleartext: isLocal,
    errorPath: "offline.html",
  },
  backgroundColor: "#fbfaf4",
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#67783a",
      showSpinner: false,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#fbfaf4",
      overlaysWebView: false,
    },
    FirebaseMessaging: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: "never",
    limitsNavigationsToAppBoundDomains: false,
  },
  experimental: {
    ios: {
      // Évite un conflit d'identité de paquet SwiftPM avec Firebase.
      spm: { packageOptions: { "@capacitor-firebase/messaging": { symlink: true } } },
    },
  },
};

export default config;
