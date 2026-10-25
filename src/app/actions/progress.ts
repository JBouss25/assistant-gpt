"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { requireViewer } from "@/lib/data";
import { notifyParentsOf, notifyUser } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";
import { formatDay } from "@/lib/time";
import type { FormState } from "./state";

const parentSchema = z.object({
  full_name: z.string().trim().min(2, "Indiquez votre nom").max(80),
  city: z.string().trim().max(80).optional().default(""),
  code: z.string().trim().max(20).optional().default(""),
});

export async function saveParentProfile(_: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  if (viewer.profile.role !== "parent") return { error: "Action réservée aux parents." };
  const parsed = parentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.full_name, city: parsed.data.city || null, onboarded: true })
    .eq("id", viewer.id);
  if (error) return { error: "Impossible d'enregistrer votre profil." };

  if (parsed.data.code) {
    const { error: linkError } = await supabase.rpc("link_child", { p_code: parsed.data.code });
    if (linkError) return { error: `${linkError.message}.` };
  }
  revalidatePath("/", "layout");
  if (formData.get("intent") === "onboarding") redirect("/tableau-de-bord");
  return { success: "Profil mis à jour." };
}

export async function linkChild(_: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  if (viewer.profile.role !== "parent") return { error: "Action réservée aux parents." };
  const code = String(formData.get("code") ?? "").trim();
  if (code.length < 6) return { error: "Saisissez le code à 8 caractères affiché sur le profil de votre enfant." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("link_child", { p_code: code });
  if (error) return { error: error.code === "P0001" ? `${error.message}.` : "Impossible d'ajouter cet enfant." };
  revalidatePath("/tableau-de-bord");
  revalidatePath("/suivi");
  redirect(`/suivi/${data as string}`);
}

export async function unlinkFamily(formData: FormData) {
  const viewer = await requireViewer();
  const other = z.uuid().safeParse(formData.get("other_id"));
  if (!other.success) return;
  const supabase = await createClient();
  const query = supabase.from("parent_links").delete();
  if (viewer.profile.role === "parent") await query.eq("parent_id", viewer.id).eq("student_id", other.data);
  else await query.eq("student_id", viewer.id).eq("parent_id", other.data);
  revalidatePath("/", "layout");
}

export async function regenerateParentCode() {
  await requireViewer();
  const supabase = await createClient();
  await supabase.rpc("regenerate_parent_code");
  revalidatePath("/profil");
}

const reportSchema = z.object({
  lesson_id: z.uuid(),
  grade: z.coerce.number().min(0, "Note entre 0 et 20").max(20, "Note entre 0 et 20"),
  engagement: z.coerce.number().int().min(1, "Choisissez le niveau d'implication").max(5),
  topics: z.string().trim().min(3, "Indiquez les notions travaillées").max(500),
  homework: z.string().trim().max(500).default(""),
  comment: z.string().trim().max(1500).default(""),
});

export async function saveLessonReport(_: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  if (viewer.profile.role !== "teacher") return { error: "Action réservée aux enseignants." };
  const parsed = reportSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { lesson_id, ...fields } = parsed.data;
  const grade = Math.round(fields.grade * 2) / 2; // demi-points
  const supabase = await createClient();
  const { data: report, error } = await supabase
    .from("lesson_reports")
    .insert({ lesson_id, ...fields, grade })
    .select("student_id, subject, lesson_date")
    .single();
  if (error || !report) {
    if (error?.code === "23505") return { error: "Ce cours a déjà un compte-rendu." };
    if (error?.code === "P0001") return { error: `${error.message}.` };
    return { error: "Impossible d'enregistrer le compte-rendu." };
  }

  const payload = {
    title: `Compte-rendu · ${report.subject}`,
    body: `${viewer.profile.full_name || "L'enseignant"} a noté le cours du ${formatDay(report.lesson_date)} : ${grade}/20.`,
    url: `/suivi/${report.student_id}`,
  };
  after(async () => {
    await notifyUser(report.student_id, payload);
    await notifyParentsOf(report.student_id, payload);
  });

  // Pas de revalidation : les pages de suivi sont recalculées à chaque visite, et rafraîchir
  // le tableau de bord ferait disparaître le cours de la liste avant que la confirmation soit lue.
  return { success: "Compte-rendu enregistré. L'élève et ses parents peuvent le consulter." };
}
