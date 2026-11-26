"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { homeFor, parseUser, USER_STORAGE_KEY, type Role, type SessionUser } from "./api";
import { useHydrated, useStorageValue } from "./store";

/** Utilisateur connecté (null avant hydratation ou si déconnecté). */
export function useSessionUser(): SessionUser | null {
  const raw = useStorageValue(USER_STORAGE_KEY);
  return useMemo(() => parseUser(raw), [raw]);
}

/** Garde de route côté client : redirige vers l'accueil si non connecté ou rôle non autorisé.
 *  La vraie protection est côté API (chaque endpoint vérifie rôle, établissement et consentement). */
export function useSession(roles?: Role[]): SessionUser | null {
  const router = useRouter();
  const hydrated = useHydrated();
  const user = useSessionUser();
  const allowed = !!user && (!roles || roles.includes(user.role));
  const rolesKey = roles?.join(",") ?? "";
  useEffect(() => {
    if (!hydrated) return;
    if (!user) router.replace("/");
    else if (!allowed) router.replace(homeFor(user.role));
  }, [hydrated, user, allowed, router, rolesKey]);
  return allowed ? user : null;
}
