"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./state";

const reviewSchema = z.object({
  teacher_id: z.uuid(),
  rating: z.coerce.number().int().min(1, "Choisissez une note").max(5),
  comment: z.string().trim().max(1000).default(""),
});

export async function saveReview(_: FormState, formData: FormData): Promise<FormState> {
  const viewer = await requireViewer();
  if (viewer.profile.role !== "student") return { error: "Seuls les élèves peuvent laisser un avis." };

  const parsed = reviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { teacher_id, rating, comment } = parsed.data;
  const { data: existing } = await supabase
    .from("reviews")
    .select("id")
    .eq("teacher_id", teacher_id)
    .eq("student_id", viewer.id)
    .maybeSingle();
  // Seuls la note et le commentaire sont modifiables sur un avis existant.
  const { error } = existing
    ? await supabase.from("reviews").update({ rating, comment }).eq("id", existing.id)
    : await supabase.from("reviews").insert({ teacher_id, rating, comment, student_id: viewer.id });
  if (error) return { error: "Vous pourrez laisser un avis après un cours accepté." };

  revalidatePath(`/enseignants/${parsed.data.teacher_id}`);
  return { success: "Merci pour votre avis !" };
}
