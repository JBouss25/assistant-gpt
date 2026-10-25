"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { registerDevice } from "@/app/actions/account";
import { isNativeApp, nativePlatform, storedPushToken, storePushToken } from "@/lib/native";

/** N'accepte que les chemins internes reçus dans une notification. */
const internal = (url: unknown) => (typeof url === "string" && url.startsWith("/") && !url.startsWith("//") ? url : null);

/**
 * Comportements propres à l'appli mobile. Ne fait rien dans un navigateur.
 * - barre d'état aux couleurs de Mentora
 * - bouton retour Android : page précédente, ou fermeture depuis l'accueil
 * - notifications push : permission, jeton, ouverture de la bonne page au toucher
 */
export function NativeBridge({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!isNativeApp()) return;
    const cleanups: (() => void)[] = [];

    (async () => {
      const [{ App }, { StatusBar, Style }] = await Promise.all([import("@capacitor/app"), import("@capacitor/status-bar")]);

      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
      if (nativePlatform() === "android") {
        StatusBar.setBackgroundColor({ color: dark ? "#1c1a15" : "#fbfaf4" }).catch(() => {});
      }

      const back = await App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack && window.location.pathname !== "/") window.history.back();
        else App.exitApp();
      });
      cleanups.push(() => back.remove());
    })();

    return () => cleanups.forEach((fn) => fn());
  }, []);

  useEffect(() => {
    if (!isNativeApp() || !signedIn) return;
    const cleanups: (() => void)[] = [];

    (async () => {
      const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");

      // Toucher une notification ouvre la page concernée (conversation, calendrier…).
      const tap = await FirebaseMessaging.addListener("notificationActionPerformed", (event) => {
        const url = internal((event.notification.data as Record<string, unknown> | undefined)?.url);
        if (url) router.push(url);
      });
      cleanups.push(() => tap.remove());

      let { receive } = await FirebaseMessaging.checkPermissions();
      if (receive === "prompt" || receive === "prompt-with-rationale") {
        ({ receive } = await FirebaseMessaging.requestPermissions());
      }
      if (receive !== "granted") return;

      const { token } = await FirebaseMessaging.getToken();
      if (token && token !== storedPushToken()) {
        await registerDevice(token, nativePlatform());
        storePushToken(token);
      }
      const refresh = await FirebaseMessaging.addListener("tokenReceived", async ({ token: next }) => {
        await registerDevice(next, nativePlatform());
        storePushToken(next);
      });
      cleanups.push(() => refresh.remove());
    })().catch((error) => console.warn("[push]", error));

    return () => cleanups.forEach((fn) => fn());
  }, [signedIn, router]);

  return null;
}
