import "server-only";
import { createClient } from "./supabase/server";
import type { Viewer } from "./data";
import type { Lesson, MatchRequest, Message } from "./types";

type Person = { full_name: string; city: string | null };

export type Conversation = MatchRequest & {
  student: Person | null;
  teacher: Person | null;
  other: { id: string; name: string };
  last_message: Message | null;
};

const PEOPLE =
  "student:profiles!match_requests_student_id_fkey(full_name, city), teacher:profiles!match_requests_teacher_id_fkey(full_name, city)";

function withOther(viewer: Viewer, r: MatchRequest & { student: Person | null; teacher: Person | null }) {
  const isTeacher = viewer.id === r.teacher_id;
  return {
    id: isTeacher ? r.student_id : r.teacher_id,
    name: (isTeacher ? r.student?.full_name : r.teacher?.full_name) || (isTeacher ? "Élève" : "Enseignant"),
  };
}

/** Conversations = demandes acceptées, triées par dernier message. */
export async function listConversations(viewer: Viewer): Promise<Conversation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("match_requests")
    .select(`*, ${PEOPLE}`)
    .eq("status", "accepted")
    .or(`student_id.eq.${viewer.id},teacher_id.eq.${viewer.id}`)
    .order("updated_at", { ascending: false })
    .overrideTypes<(MatchRequest & { student: Person | null; teacher: Person | null })[], { merge: false }>();
  const requests = data ?? [];
  if (requests.length === 0) return [];

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .in(
      "request_id",
      requests.map((r) => r.id),
    )
    .order("created_at", { ascending: false })
    .limit(500)
    .overrideTypes<Message[], { merge: false }>();
  const last = new Map<string, Message>();
  for (const m of messages ?? []) if (!last.has(m.request_id)) last.set(m.request_id, m);

  return requests
    .map((r) => ({ ...r, other: withOther(viewer, r), last_message: last.get(r.id) ?? null }))
    .sort((a, b) => (b.last_message?.created_at ?? b.created_at).localeCompare(a.last_message?.created_at ?? a.created_at));
}

export async function getConversation(viewer: Viewer, requestId: string) {
  const supabase = await createClient();
  const { data: request } = await supabase
    .from("match_requests")
    .select(`*, ${PEOPLE}`)
    .eq("id", requestId)
    .eq("status", "accepted")
    .maybeSingle<MatchRequest & { student: Person | null; teacher: Person | null }>();
  if (!request || ![request.student_id, request.teacher_id].includes(viewer.id)) return null;

  const [{ data: messages }, { data: lessons }] = await Promise.all([
    supabase
      .from("messages")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false })
      .limit(200)
      .overrideTypes<Message[], { merge: false }>(),
    supabase
      .from("lessons")
      .select("*")
      .eq("request_id", requestId)
      .neq("status", "cancelled")
      .gte("ends_at", new Date().toISOString())
      .order("starts_at")
      .overrideTypes<Lesson[], { merge: false }>(),
  ]);

  return {
    request,
    other: withOther(viewer, request),
    messages: (messages ?? []).reverse(),
    lessons: lessons ?? [],
  };
}

export type LessonWithPeople = Lesson & {
  teacher: { full_name: string } | null;
  student: { full_name: string } | null;
};

const LESSON_PEOPLE =
  "*, teacher:profiles!lessons_teacher_id_fkey(full_name), student:profiles!lessons_student_id_fkey(full_name)";

/** Cours (proposés ou confirmés) du visiteur entre deux instants. */
export async function listLessons(viewer: Viewer, from: Date, to: Date) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lessons")
    .select(LESSON_PEOPLE)
    .or(`student_id.eq.${viewer.id},teacher_id.eq.${viewer.id}`)
    .neq("status", "cancelled")
    .lt("starts_at", to.toISOString())
    .gt("ends_at", from.toISOString())
    .order("starts_at")
    .overrideTypes<LessonWithPeople[], { merge: false }>();
  return data ?? [];
}

/** Propositions de cours à venir, en attente de la réponse du visiteur. */
export async function listLessonsToConfirm(viewer: Viewer) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lessons")
    .select(LESSON_PEOPLE)
    .or(`student_id.eq.${viewer.id},teacher_id.eq.${viewer.id}`)
    .eq("status", "proposed")
    .neq("proposed_by", viewer.id)
    .gt("starts_at", new Date().toISOString())
    .order("starts_at")
    .overrideTypes<LessonWithPeople[], { merge: false }>();
  return data ?? [];
}

export function otherName(viewer: Viewer, lesson: LessonWithPeople) {
  return viewer.id === lesson.teacher_id
    ? lesson.student?.full_name || "Élève"
    : lesson.teacher?.full_name || "Enseignant";
}
