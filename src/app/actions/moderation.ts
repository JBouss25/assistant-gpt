"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { LEGAL } from "@/lib/legal";
import { requireViewer } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./state";

/** Interlocuteur de l'utilisateur dans une demande (null si non participant). */
async function counterpart(requestId: string) {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { data } = await supabase
    .from("match_requests")
    .select("student_id, teacher_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!data) return null;
  return { viewer, supabase, otherId: data.student_id === viewer.id ? data.teacher_id : data.student_id };
}

const idSchema = z.uuid();

export async function blockUser(formData: FormData) {
  const requestId = idSchema.safeParse(formData.get("request_id"));
  if (!requestId.success) return;
  const ctx = await counterpart(requestId.data);
  if (!ctx) return;
  await ctx.supabase.from("blocks").insert({ blocker_id: ctx.viewer.id, blocked_id: ctx.otherId });
  revalidatePath(`/messages/${requestId.data}`);
}

export async function unblockUser(formData: FormData) {
  const requestId = idSchema.safeParse(formData.get("request_id"));
  if (!requestId.success) return;
  const ctx = await counterpart(requestId.data);
  if (!ctx) return;
  await ctx.supabase.from("blocks").delete().eq("blocker_id", ctx.viewer.id).eq("blocked_id", ctx.otherId);
  revalidatePath(`/messages/${requestId.data}`);
}

const reportSchema = z.object({
  request_id: z.uuid(),
  reason: z.string().trim().min(10, "Décrivez le problème en quelques mots (10 caractères minimum).").max(1000),
});

export async function reportUser(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = reportSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const ctx = await counterpart(parsed.data.request_id);
  if (!ctx) return { error: "Conversation introuvable." };

  const { error } = await ctx.supabase.from("reports").insert({
    reporter_id: ctx.viewer.id,
    reported_id: ctx.otherId,
    request_id: parsed.data.request_id,
    reason: parsed.data.reason,
  });
  if (error) return { error: "Le signalement n'a pas pu être envoyé." };
  return {
    success: `Merci, notre équipe va examiner ce signalement sous 24 h. En cas d'urgence : ${LEGAL.contactEmail}.`,
  };
}
