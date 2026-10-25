"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { LEVELS, SLOTS, SUBJECTS } from "@/lib/constants";
import { requireViewer } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./state";

const levelEnum = z.enum(LEVELS.map((l) => l.value) as [string, ...string[]]);
const modeEnum = z.enum(["online", "in_person", "both"]);
const subjectList = z
  .array(z.enum(SUBJECTS))
  .min(1, "Choisissez au moins une matière")
  .max(SUBJECTS.length);
const slotList = z.array(z.string().refine((s) => SLOTS.includes(s))).max(SLOTS.length);

const common = {
  full_name: z.string().trim().min(2, "Indiquez votre nom").max(80),
  city: z.string().trim().max(80).optional().default(""),
};

const studentSchema = z.object({
  ...common,
  level: levelEnum,
  grade: z.string().trim().max(60).default(""),
  subjects: subjectList,
  goals: z.string().trim().max(1000).default(""),
  budget_max: z.coerce.number().int().min(5, "Budget minimum : 5 €").max(500),
  mode: modeEnum,
  availability: slotList,
});

const teacherSchema = z.object({
  ...common,
  headline: z.string().trim().min(10, "Votre accroche doit faire au moins 10 caractères").max(120),
  bio: z.string().trim().min(50, "Présentez-vous en 50 caractères minimum").max(3000),
  subjects: subjectList,
  levels: z.array(levelEnum).min(1, "Choisissez au moins un niveau"),
  hourly_rate: z.coerce.number().int().min(5, "Tarif minimum : 5 €").max(500),
  mode: modeEnum,
  years_experience: z.coerce.number().int().min(0).max(60),
  diplomas: z.string().trim().max(500).default(""),
  availability: slotList,
  is_published: z.boolean(),
});

function read(formData: FormData) {
  return {
    ...Object.fromEntries(formData),
    subjects: formData.getAll("subjects"),
    levels: formData.getAll("levels"),
    availability: formData.getAll("availability"),
    is_published: formData.get("is_published") === "on",
  };
}

async function saveIdentity(viewerId: string, full_name: string, city: string) {
  const supabase = await createClient();
  return supabase.from("profiles").update({ full_name, city: city || null, onboarded: true }).eq("id", viewerId);
}

export async function saveStudentProfile(_: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  if (viewer.profile.role !== "student") return { error: "Action réservée aux élèves." };

  const parsed = studentSchema.safeParse(read(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { full_name, city, ...student } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("student_profiles").upsert({ id: viewer.id, ...student });
  if (error) return { error: "Impossible d'enregistrer votre profil." };
  const { error: idError } = await saveIdentity(viewer.id, full_name, city);
  if (idError) return { error: "Impossible d'enregistrer votre profil." };

  revalidatePath("/", "layout");
  if (formData.get("intent") === "onboarding") redirect("/tableau-de-bord");
  return { success: "Profil mis à jour." };
}

export async function saveTeacherProfile(_: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  if (viewer.profile.role !== "teacher") return { error: "Action réservée aux enseignants." };

  const parsed = teacherSchema.safeParse(read(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { full_name, city, ...teacher } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("teacher_profiles").upsert({ id: viewer.id, ...teacher });
  if (error) return { error: "Impossible d'enregistrer votre profil." };
  const { error: idError } = await saveIdentity(viewer.id, full_name, city);
  if (idError) return { error: "Impossible d'enregistrer votre profil." };

  revalidatePath("/", "layout");
  if (formData.get("intent") === "onboarding") redirect("/tableau-de-bord");
  return { success: "Profil mis à jour." };
}
