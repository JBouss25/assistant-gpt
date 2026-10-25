import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { Level, Mode } from "./constants";
import { rankTeachers, type MatchResult } from "./matching";
import { createClient } from "./supabase/server";
import { isSupabaseConfigured } from "./supabase/env";
import type { MatchRequest, Profile, Review, StudentProfile, TeacherCard, TeacherProfile } from "./types";

/** Colonnes lisibles de student_profiles (le code parent est réservé à l'élève). */
export const STUDENT_COLUMNS = "id, level, grade, subjects, goals, budget_max, mode, availability";

const TEACHER_SELECT = "*, profile:profiles!inner(full_name, city, avatar_url)";

export type Viewer = { id: string; email: string; profile: Profile };

/** Utilisateur courant (mémoïsé pour la requête), ou null. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  // Toujours lu à la requête, même sans Supabase configuré (évite un pré-rendu figé).
  await connection();
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, full_name, city, avatar_url, onboarded")
    .eq("id", claims.sub)
    .maybeSingle<Profile>();
  if (!profile) return null;

  return { id: claims.sub, email: String(claims.email ?? ""), profile };
});

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/connexion");
  return viewer;
}

export async function getOwnTeacherProfile(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("teacher_profiles").select("*").eq("id", id).maybeSingle<TeacherProfile>();
  return data;
}

export async function getOwnStudentProfile(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("student_profiles")
    .select(STUDENT_COLUMNS)
    .eq("id", id)
    .maybeSingle<StudentProfile>();
  return data;
}

export async function getTeacher(id: string) {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("teacher_profiles").select(TEACHER_SELECT).eq("id", id).maybeSingle<TeacherCard>();
  return data;
}

export type TeacherFilters = {
  q?: string;
  subject?: string;
  level?: Level;
  mode?: Mode;
  maxRate?: number;
};

export async function listTeachers(filters: TeacherFilters, limit = 48) {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  let query = supabase.from("teacher_profiles").select(TEACHER_SELECT).eq("is_published", true);

  if (filters.subject) query = query.contains("subjects", [filters.subject]);
  if (filters.level) query = query.contains("levels", [filters.level]);
  if (filters.mode && filters.mode !== "both") query = query.in("mode", [filters.mode, "both"]);
  if (filters.maxRate) query = query.lte("hourly_rate", filters.maxRate);
  if (filters.q) {
    const q = filters.q.replace(/[%,()]/g, " ").trim();
    if (q) query = query.or(`headline.ilike.%${q}%,bio.ilike.%${q}%`);
  }

  const { data } = await query
    .order("rating_avg", { ascending: false })
    .order("rating_count", { ascending: false })
    .limit(limit)
    .overrideTypes<TeacherCard[], { merge: false }>();
  return data ?? [];
}

/** Meilleurs enseignants pour un élève, classés par l'algorithme de matching. */
export async function getMatchesFor(student: StudentProfile, city: string | null): Promise<MatchResult[]> {
  const supabase = await createClient();
  let query = supabase
    .from("teacher_profiles")
    .select(TEACHER_SELECT)
    .eq("is_published", true)
    .contains("levels", [student.level]);
  if (student.subjects.length > 0) query = query.overlaps("subjects", student.subjects);

  const { data } = await query.limit(200).overrideTypes<TeacherCard[], { merge: false }>();
  return rankTeachers({ ...student, city }, data ?? []);
}

export type RequestWithPeople = MatchRequest & {
  student: { full_name: string; city: string | null } | null;
  teacher: { full_name: string; city: string | null } | null;
  student_profile?: Pick<StudentProfile, "level" | "grade" | "goals"> | null;
};

export async function listRequests(viewer: Viewer): Promise<RequestWithPeople[]> {
  const supabase = await createClient();
  const column = viewer.profile.role === "teacher" ? "teacher_id" : "student_id";
  const { data } = await supabase
    .from("match_requests")
    .select(
      "*, student:profiles!match_requests_student_id_fkey(full_name, city), teacher:profiles!match_requests_teacher_id_fkey(full_name, city)",
    )
    .eq(column, viewer.id)
    .order("created_at", { ascending: false })
    .overrideTypes<RequestWithPeople[], { merge: false }>();
  const requests = data ?? [];

  if (viewer.profile.role === "teacher" && requests.length > 0) {
    const ids = [...new Set(requests.map((r) => r.student_id))];
    const { data: students } = await supabase
      .from("student_profiles")
      .select("id, level, grade, goals")
      .in("id", ids)
      .overrideTypes<(Pick<StudentProfile, "level" | "grade" | "goals"> & { id: string })[], { merge: false }>();
    const byId = new Map((students ?? []).map((s) => [s.id, s]));
    for (const r of requests) r.student_profile = byId.get(r.student_id) ?? null;
  }
  return requests;
}

export type ReviewWithAuthor = Review & { student: { full_name: string } | null };

export async function listReviews(teacherId: string) {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("reviews")
    .select("*, student:profiles!reviews_student_id_fkey(full_name)")
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: false })
    .limit(20)
    .overrideTypes<ReviewWithAuthor[], { merge: false }>();
  return data ?? [];
}

/** Relation entre le visiteur et un enseignant : demandes existantes, droit de laisser un avis. */
export async function getRelationWith(viewer: Viewer, teacherId: string) {
  const supabase = await createClient();
  const [{ data: requests }, { data: review }] = await Promise.all([
    supabase
      .from("match_requests")
      .select("id, subject, status")
      .eq("student_id", viewer.id)
      .eq("teacher_id", teacherId)
      .overrideTypes<Pick<MatchRequest, "id" | "subject" | "status">[], { merge: false }>(),
    supabase
      .from("reviews")
      .select("id, rating, comment")
      .eq("student_id", viewer.id)
      .eq("teacher_id", teacherId)
      .maybeSingle<Pick<Review, "id" | "rating" | "comment">>(),
  ]);
  return {
    requests: requests ?? [],
    canReview: (requests ?? []).some((r) => r.status === "accepted"),
    review: review ?? null,
  };
}
