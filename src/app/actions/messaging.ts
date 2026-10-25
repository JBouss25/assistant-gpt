"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { notifyUser } from "@/lib/push";
import { DURATIONS, durationLabel, formatDay, formatTime, isIsoDate, parisToUtc, START_TIMES } from "@/lib/time";
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

  after(async () => {
    const { data: req } = await supabase
      .from("match_requests")
      .select("student_id, teacher_id")
      .eq("id", data.request_id)
      .maybeSingle();
    if (!req) return;
    await notifyUser(req.student_id === viewer.id ? req.teacher_id : req.student_id, {
      title: viewer.profile.full_name || "Nouveau message",
      body: data.body,
      url: `/messages/${data.request_id}`,
    });
  });
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
  const viewer = await requireViewer();
  const parsed = lessonSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { request_id, date, time, duration, note } = parsed.data;
  const startsAt = parisToUtc(date, time);
  if (startsAt.getTime() < Date.now() + 60 * 60 * 1000) {
    return { error: "Proposez un créneau au moins une heure à l'avance." };
  }

  const supabase = await createClient();
  const { data: lesson, error } = await supabase
    .from("lessons")
    .insert({ request_id, starts_at: startsAt.toISOString(), duration_minutes: duration, note })
    .select("teacher_id, student_id, subject, starts_at, duration_minutes")
    .single();
  if (error) {
    // Les messages levés par les triggers (chevauchement…) sont déjà rédigés pour l'utilisateur.
    if (error.code === "P0001") return { error: `${error.message}.` };
    return { error: "Impossible de proposer ce cours." };
  }

  after(() =>
    notifyUser(lesson.teacher_id === viewer.id ? lesson.student_id : lesson.teacher_id, {
      title: "Nouveau cours proposé",
      body: `${viewer.profile.full_name || "Mentora"} propose ${lesson.subject} le ${formatDay(lesson.starts_at)} à ${formatTime(lesson.starts_at)} (${durationLabel(lesson.duration_minutes)}).`,
      url: `/calendrier?semaine=${date}`,
    }),
  );
  revalidatePath("/calendrier");
  revalidatePath(`/messages/${request_id}`);
  return { success: "Cours proposé ! Il apparaîtra comme confirmé dès que l'autre personne l'aura accepté." };
}

const statusSchema = z.object({ id: z.uuid(), status: z.enum(["confirmed", "cancelled"]) });

export async function updateLessonStatus(formData: FormData) {
  const viewer = await requireViewer();
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  // Règles de transition vérifiées en base (trigger guard_lesson_update).
  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from("lessons")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .select("teacher_id, student_id, subject, starts_at, status")
    .maybeSingle();
  if (lesson) {
    const confirmed = lesson.status === "confirmed";
    after(() =>
      notifyUser(lesson.teacher_id === viewer.id ? lesson.student_id : lesson.teacher_id, {
        title: confirmed ? "Cours confirmé ✅" : "Cours annulé",
        body: `${lesson.subject}, ${formatDay(lesson.starts_at)} à ${formatTime(lesson.starts_at)}${confirmed ? "" : ` — annulé par ${viewer.profile.full_name || "l'autre participant"}`}.`,
        url: "/calendrier",
      }),
    );
  }
  revalidatePath("/calendrier");
  revalidatePath("/messages", "layout");
}
