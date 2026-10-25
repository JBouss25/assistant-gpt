"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getOwnStudentProfile, getTeacher, requireViewer } from "@/lib/data";
import { scoreTeacher } from "@/lib/matching";
import { notifyUser } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./state";

const requestSchema = z.object({
  teacher_id: z.uuid(),
  subject: z.string().trim().min(1, "Choisissez une matière"),
  message: z.string().trim().min(20, "Décrivez votre besoin en 20 caractères minimum").max(2000),
});

export async function createRequest(_: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  if (viewer.profile.role !== "student") return { error: "Seuls les élèves peuvent envoyer une demande." };

  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const [teacher, student] = await Promise.all([
    getTeacher(parsed.data.teacher_id),
    getOwnStudentProfile(viewer.id),
  ]);
  if (!teacher) return { error: "Enseignant introuvable." };
  if (!teacher.subjects.includes(parsed.data.subject)) return { error: "Matière non proposée par cet enseignant." };

  const score = student ? (scoreTeacher({ ...student, city: viewer.profile.city }, teacher)?.score ?? 0) : 0;

  const supabase = await createClient();
  const { error } = await supabase.from("match_requests").insert({
    student_id: viewer.id,
    teacher_id: teacher.id,
    subject: parsed.data.subject,
    message: parsed.data.message,
    score,
  });
  if (error) {
    if (error.code === "23505") return { error: "Une demande est déjà en attente pour cette matière." };
    return { error: "Impossible d'envoyer la demande." };
  }

  after(() =>
    notifyUser(teacher.id, {
      title: "Nouvelle demande de cours",
      body: `${viewer.profile.full_name || "Un élève"} souhaite des cours de ${parsed.data.subject}.`,
      url: "/tableau-de-bord",
    }),
  );
  revalidatePath(`/enseignants/${teacher.id}`);
  revalidatePath("/tableau-de-bord");
  return { success: "Demande envoyée ! L'enseignant va vous répondre rapidement." };
}

const statusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["accepted", "declined", "cancelled"]),
});

export async function updateRequestStatus(formData: FormData) {
  const viewer = await requireViewer();
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  // Les transitions autorisées sont vérifiées en base (trigger guard_request_update).
  const supabase = await createClient();
  const { data: request } = await supabase
    .from("match_requests")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .select("id, student_id, subject, status")
    .maybeSingle();
  if (request?.status === "accepted") {
    after(() =>
      notifyUser(request.student_id, {
        title: "Demande acceptée 🎉",
        body: `${viewer.profile.full_name || "Votre enseignant"} a accepté votre demande en ${request.subject}. Écrivez-lui pour organiser un premier cours.`,
        url: `/messages/${request.id}`,
      }),
    );
  }
  revalidatePath("/tableau-de-bord");
}
