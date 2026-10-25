import type { Mode } from "./constants";
import type { StudentProfile, TeacherCard } from "./types";

/**
 * Algorithme de matching élève ↔ enseignant.
 *
 * Score sur 100, réparti ainsi :
 *   - matières couvertes   40
 *   - niveau enseigné      20
 *   - disponibilités       15
 *   - budget               10
 *   - modalité (+ ville)   10
 *   - réputation            5
 *
 * Le niveau et au moins une matière commune sont éliminatoires.
 * Chaque critère produit une raison lisible, affichée à l'élève
 * ("Pourquoi ce match ?") pour rendre la recommandation transparente.
 */

export type MatchStudent = Pick<
  StudentProfile,
  "level" | "subjects" | "budget_max" | "mode" | "availability"
> & { city?: string | null };

export type MatchResult = {
  teacher: TeacherCard;
  score: number;
  reasons: string[];
};

export const WEIGHTS = {
  subjects: 40,
  level: 20,
  availability: 15,
  budget: 10,
  mode: 10,
  rating: 5,
} as const;

function normalize(s: string | null | undefined) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

export function modesCompatible(a: Mode, b: Mode) {
  return a === "both" || b === "both" || a === b;
}

/** Note bayésienne : évite qu'un seul avis 5/5 écrase un enseignant très bien noté sur 40 avis. */
export function bayesianRating(avg: number, count: number, prior = 4, weight = 3) {
  return (avg * count + prior * weight) / (count + weight);
}

export function scoreTeacher(student: MatchStudent, teacher: TeacherCard): MatchResult | null {
  const reasons: string[] = [];

  // Niveau (éliminatoire)
  if (!teacher.levels.includes(student.level)) return null;
  let score = WEIGHTS.level;

  // Matières (éliminatoire si aucune en commun)
  const wanted = student.subjects.length > 0 ? student.subjects : teacher.subjects;
  const common = wanted.filter((s) => teacher.subjects.includes(s));
  if (common.length === 0) return null;
  score += WEIGHTS.subjects * (common.length / wanted.length);
  reasons.push(
    common.length === wanted.length && wanted.length > 1
      ? "Enseigne toutes vos matières"
      : `Enseigne ${common.join(", ")}`,
  );

  // Modalité
  const sameCity =
    normalize(student.city) !== "" && normalize(student.city) === normalize(teacher.profile.city);
  if (modesCompatible(student.mode, teacher.mode)) {
    const needsPlace = student.mode === "in_person";
    if (needsPlace && !sameCity && teacher.profile.city && student.city) {
      score += WEIGHTS.mode / 2;
    } else {
      score += WEIGHTS.mode;
      if (sameCity && student.mode !== "online") reasons.push(`Disponible à ${teacher.profile.city}`);
    }
  }

  // Budget : plein score sous le budget, décroissance linéaire jusqu'à +50 %.
  const rate = teacher.hourly_rate;
  const budget = Math.max(student.budget_max, 1);
  if (rate <= budget) {
    score += WEIGHTS.budget;
    reasons.push(`Dans votre budget (${rate} €/h)`);
  } else {
    const over = (rate - budget) / budget;
    score += WEIGHTS.budget * Math.max(0, 1 - over / 0.5);
  }

  // Disponibilités : part des créneaux de l'élève couverts par l'enseignant.
  if (student.availability.length === 0) {
    score += WEIGHTS.availability / 2;
  } else {
    const shared = student.availability.filter((s) => teacher.availability.includes(s)).length;
    score += WEIGHTS.availability * (shared / student.availability.length);
    if (shared > 0) reasons.push(`${shared} créneau${shared > 1 ? "x" : ""} en commun`);
  }

  // Réputation
  const rating = bayesianRating(Number(teacher.rating_avg), teacher.rating_count);
  score += WEIGHTS.rating * (rating / 5);
  if (teacher.rating_count >= 3 && teacher.rating_avg >= 4.5) {
    reasons.push(`Très bien noté (${Number(teacher.rating_avg).toFixed(1)}/5)`);
  }
  if (teacher.years_experience >= 5) reasons.push(`${teacher.years_experience} ans d'expérience`);

  return { teacher, score: Math.round(Math.min(100, score)), reasons };
}

export function rankTeachers(student: MatchStudent, teachers: TeacherCard[], limit = 12): MatchResult[] {
  return teachers
    .map((t) => scoreTeacher(student, t))
    .filter((r): r is MatchResult => r !== null)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.teacher.rating_count - a.teacher.rating_count ||
        a.teacher.hourly_rate - b.teacher.hourly_rate,
    )
    .slice(0, limit);
}
