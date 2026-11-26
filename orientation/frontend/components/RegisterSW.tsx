"use client";

import { useEffect } from "react";

/** Service worker : cache de l'interface pour un usage hors-ligne des questionnaires.
 *  Les réponses en cours sont gardées localement puis synchronisées ; aucune donnée personnelle n'est mise en cache par le SW. */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return null;
}
