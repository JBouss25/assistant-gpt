"use client";

// Lecture réactive du localStorage via useSyncExternalStore (pas de setState dans un effet,
// pas d'écart d'hydratation : côté serveur la valeur vaut toujours null).
import { useSyncExternalStore } from "react";

const EVENT = "orientation-storage";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible (navigation privée…) : la valeur n'est pas mémorisée */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useStorageValue(key: string): string | null {
  return useSyncExternalStore(subscribe, () => readStorage(key), () => null);
}

/** Vrai une fois l'application hydratée côté client. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
