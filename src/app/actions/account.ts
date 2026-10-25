"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./state";

const deviceSchema = z.object({
  token: z.string().min(10).max(4096),
  platform: z.enum(["ios", "android"]),
});

/** Associe le téléphone (jeton FCM) au compte connecté. */
export async function registerDevice(token: string, platform: string) {
  await requireViewer();
  const parsed = deviceSchema.safeParse({ token, platform });
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase.rpc("register_device", { p_token: parsed.data.token, p_platform: parsed.data.platform });
}

/** Détache le téléphone du compte (appelé avant la déconnexion). */
export async function unregisterDevice(token: string) {
  await requireViewer();
  const supabase = await createClient();
  await supabase.from("device_tokens").delete().eq("token", token);
}

export async function deleteAccount(_: FormState, formData: FormData): Promise<FormState> {
  await requireViewer();
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "SUPPRIMER") {
    return { error: "Tapez SUPPRIMER pour confirmer." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_own_account");
  if (error) return { error: "La suppression a échoué. Réessayez ou contactez le support." };
  await supabase.auth.signOut();
  redirect("/?compte=supprime");
}
