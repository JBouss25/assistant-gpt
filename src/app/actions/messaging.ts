"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { DURATIONS, isIsoDate, parisToUtc, START_TIMES } from "@/lib/time";
import type { Message } from "@/lib/types";
import type { FormState } from "./state";

const messageSchema = z.object({
  requestId: z.uuid(),
  body: z.string().trim().min(1, "Message vide").max(4000, "Message trop long (4 000 caractères max.)"),
});

export async function sendMessage(
  requestId: string,
  body: string,
): Promise<{ message?: Message; error?: string }> {
  const viewer = await requireViewer();
  const parsed = messageSchema.safeParse({ requestId, body });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .insert({ request_id: parsed.data.requestId, sender_id: viewer.id, body: parsed.data.body })
    .select("*")
    .single<Message>();
  if (error || !data) return { error: "Message non envoyé. Réessayez." };

  revalidatePath("/messages");
  return { message: data };
}

const lessonSchema = z.object({
  request_id: z.uuid("Choisissez un élève ou un enseignant"),
  date: z.string().refine(isIsoDate, "Date invalide"),
  time: z.string().refine((t) => START_TIMES.includes(t), "Heure invalide"),
  duration: z.coerce
    .number()
    .refine((d) => DURATIONS.some((x) => x.value === d), "Un cours dure entre 1 h 30 et 2 h"),
  note: z.string().trim().max(500).default(""),
});

export async function proposeLesson(_: FormState, formData: FormData): Promise<FormState> {
  await requireViewer();
  const parsed = lessonSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { request_id, date, time, duration, note } = parsed.data;
  const startsAt = parisToUtc(date, time);
  if (startsAt.getTime() < Date.now() + 60 * 60 * 1000) {
    return { error: "Proposez un créneau au moins une heure à l'avance." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("lessons")
    .insert({ request_id, starts_at: startsAt.toISOString(), duration_minutes: duration, note });
  if (error) {
    // Les messages levés par les triggers (chevauchement…) sont déjà rédigés pour l'utilisateur.
    if (error.code === "P0001") return { error: `${error.message}.` };
    return { error: "Impossible de proposer ce cours." };
  }

  revalidatePath("/calendrier");
  revalidatePath(`/messages/${request_id}`);
  return { success: "Cours proposé ! Il apparaîtra comme confirmé dès que l'autre personne l'aura accepté." };
}

const statusSchema = z.object({ id: z.uuid(), status: z.enum(["confirmed", "cancelled"]) });

export async function updateLessonStatus(formData: FormData) {
  await requireViewer();
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  // Règles de transition vérifiées en base (trigger guard_lesson_update).
  const supabase = await createClient();
  await supabase.from("lessons").update({ status: parsed.data.status }).eq("id", parsed.data.id);
  revalidatePath("/calendrier");
  revalidatePath("/messages", "layout");
}
