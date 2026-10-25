"use client";

import { useTransition } from "react";
import { LoaderCircle, LogOut } from "lucide-react";
import { unregisterDevice } from "@/app/actions/account";
import { signOut } from "@/app/actions/auth";
import { storedPushToken, storePushToken } from "@/lib/native";
import { buttonClass } from "./ui/button";

/** Déconnexion : détache d'abord le téléphone pour ne plus recevoir les notifications de ce compte. */
export function SignOutButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label="Se déconnecter"
      title="Se déconnecter"
      disabled={pending}
      className={buttonClass("ghost", "sm", "px-2")}
      onClick={() =>
        start(async () => {
          const token = storedPushToken();
          if (token) {
            await unregisterDevice(token).catch(() => {});
            storePushToken(null);
          }
          await signOut();
        })
      }
    >
      {pending ? <LoaderCircle className="size-4 animate-spin" /> : <LogOut className="size-4" />}
    </button>
  );
}
