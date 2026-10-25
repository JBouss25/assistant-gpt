import "server-only";
import type { Level } from "./constants";
import type { Viewer } from "./data";
import { computeProgress, type LessonLite } from "./progress-stats";
import { createClient } from "./supabase/server";
import type { Lesson, LessonReport } from "./types";

export type FollowedStudent = {
  id: string;
  name: string;
  level: Level | null;
  grade: string;
};

/** Élèves suivis : enfants (parent) ou élèves acceptés (enseignant). */
export async function listFollowedStudents(viewer: Viewer): Promise<FollowedStudent[]> {
  const supabase = await createClient();
  let ids: string[] = [];

  if (viewer.profile.role === "parent") {
    const { data } = await supabase.from("parent_links").select("student_id").eq("parent_id", viewer.id);
    ids = (data ?? []).map((r) => r.student_id as string);
  } else if (viewer.profile.role === "teacher") {
    const { data } = await supabase
      .from("match_requests")
      .select("student_id")
      .eq("teacher_id", viewer.id)
      .eq("status", "accepted");
    ids = [...new Set((data ?? []).map((r) => r.student_id as string))];
  } else {
    ids = [viewer.id];
  }
  if (ids.length === 0) return [];

  const [{ data: people }, { data: school }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").in("id", ids),
    supabase.from("student_profiles").select("id, level, grade").in("id", ids),
  ]);
  const schoolById = new Map((school ?? []).map((s) => [s.id as string, s]));
  return (people ?? [])
    .map((p) => {
      const s = schoolById.get(p.id as string);
      return {
        id: p.id as string,
        name: (p.full_name as string) || "Élève",
        level: (s?.level as Level | undefined) ?? null,
        grade: (s?.grade as string | undefined) ?? "",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type ReportWithTeacher = LessonReport & { teacher: { full_name: string } | null };

/** Progression d'un élève, si le visiteur y a droit (lui-même, un parent, un de ses enseignants). */
export async function getStudentProgress(viewer: Viewer, studentId: string) {
  const followed = await listFollowedStudents(viewer);
  const student = followed.find((s) => s.id === studentId);
  if (!student) return null;

  const supabase = await createClient();
  const [{ data: reports }, { data: lessons }] = await Promise.all([
    supabase
      .from("lesson_reports")
      .select("*, teacher:profiles!lesson_reports_teacher_id_fkey(full_name)")
      .eq("student_id", studentId)
      .order("lesson_date", { ascending: false })
      .limit(200)
      .overrideTypes<ReportWithTeacher[], { merge: false }>(),
    supabase
      .from("lessons")
      .select("starts_at, ends_at, duration_minutes, status")
      .eq("student_id", studentId)
      .neq("status", "cancelled")
      .order("starts_at")
      .limit(500)
      .overrideTypes<LessonLite[], { merge: false }>(),
  ]);

  return {
    student,
    reports: reports ?? [],
    stats: computeProgress(reports ?? [], lessons ?? []),
  };
}

export type PendingReport = Pick<Lesson, "id" | "subject" | "starts_at" | "ends_at" | "duration_minutes"> & {
  student: { full_name: string } | null;
};

/** Cours terminés de l'enseignant qui attendent encore leur compte-rendu (60 derniers jours). */
export async function listPendingReports(viewer: Viewer): Promise<PendingReport[]> {
  if (viewer.profile.role !== "teacher") return [];
  const supabase = await createClient();
  const since = new Date(Date.now() - 60 * 864e5).toISOString();
  const { data: lessons } = await supabase
    .from("lessons")
    .select("id, subject, starts_at, ends_at, duration_minutes, student:profiles!lessons_student_id_fkey(full_name)")
    .eq("teacher_id", viewer.id)
    .eq("status", "confirmed")
    .lte("ends_at", new Date().toISOString())
    .gte("starts_at", since)
    .order("starts_at", { ascending: false })
    .overrideTypes<PendingReport[], { merge: false }>();
  if (!lessons?.length) return [];

  const { data: done } = await supabase
    .from("lesson_reports")
    .select("lesson_id")
    .in(
      "lesson_id",
      lessons.map((l) => l.id),
    );
  const reported = new Set((done ?? []).map((r) => r.lesson_id as string));
  return lessons.filter((l) => !reported.has(l.id));
}

/** Code à transmettre aux parents (élève uniquement). */
export async function getMyParentCode() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_parent_code");
  return (data as string | null) ?? null;
}

/** Parents reliés au compte de l'élève connecté. */
export async function listMyParents(viewer: Viewer) {
  const supabase = await createClient();
  const { data: links } = await supabase.from("parent_links").select("parent_id").eq("student_id", viewer.id);
  const ids = (links ?? []).map((l) => l.parent_id as string);
  if (!ids.length) return [];
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
  return (data ?? []).map((p) => ({ id: p.id as string, name: (p.full_name as string) || "Parent" }));
}
