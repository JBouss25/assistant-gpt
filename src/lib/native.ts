"use client";

import { Capacitor } from "@capacitor/core";

/** Vrai dans l'appli Android / iOS (coque Capacitor), faux dans un navigateur. */
export const isNativeApp = () => Capacitor.isNativePlatform();
export const nativePlatform = () => Capacitor.getPlatform() as "ios" | "android" | "web";

const TOKEN_KEY = "mentora.push-token";

export function storedPushToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storePushToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // stockage indisponible : sans conséquence
  }
}
