import { parisParts } from "./time";
import type { LessonReport } from "./types";

/** Calculs de progression (purs, testés) à partir des comptes-rendus et des cours. */

export type LessonLite = { starts_at: string; ends_at: string; duration_minutes: number; status: string };

export type SubjectSeries = {
  subject: string;
  points: { date: string; grade: number; topics: string }[];
  last: number;
  /** Écart entre la dernière note et la première de la série. */
  delta: number;
};

export type ProgressStats = {
  reportCount: number;
  /** Moyenne des 3 dernières notes (toutes matières). */
  recentAverage: number | null;
  /** Moyenne des 3 dernières moins celle des 3 précédentes. */
  trend: number | null;
  engagementAverage: number | null;
  hoursDone: number;
  hoursByMonth: { month: string; label: string; hours: number }[];
  bySubject: SubjectSeries[];
  nextLesson: LessonLite | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });

/** Les `count` derniers mois, du plus ancien au plus récent, au format "YYYY-MM" (heure de Paris). */
export function lastMonths(now: Date, count: number) {
  const [y, m] = parisParts(now).date.split("-").map(Number) as [number, number];
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (count - 1 - i), 15));
    const key = d.toISOString().slice(0, 7);
    return { month: key, label: monthFmt.format(d).replace(".", "") };
  });
}

export function computeProgress(reports: LessonReport[], lessons: LessonLite[], now = new Date()): ProgressStats {
  const sorted = [...reports].sort((a, b) => a.lesson_date.localeCompare(b.lesson_date));
  const grades = sorted.map((r) => Number(r.grade));

  const last3 = grades.slice(-3);
  const prev3 = grades.slice(-6, -3);
  const recent = mean(last3);
  const previous = mean(prev3);

  const bySubjectMap = new Map<string, SubjectSeries["points"]>();
  for (const r of sorted) {
    const list = bySubjectMap.get(r.subject) ?? [];
    list.push({ date: r.lesson_date, grade: Number(r.grade), topics: r.topics });
    bySubjectMap.set(r.subject, list);
  }
  const bySubject = [...bySubjectMap.entries()]
    .map(([subject, points]) => ({
      subject,
      points,
      last: points.at(-1)!.grade,
      delta: round1(points.at(-1)!.grade - points[0]!.grade),
    }))
    .sort((a, b) => b.points.length - a.points.length || a.subject.localeCompare(b.subject));

  const done = lessons.filter((l) => l.status === "confirmed" && Date.parse(l.ends_at) <= now.getTime());
  const months = lastMonths(now, 6);
  const minutesByMonth = new Map<string, number>();
  for (const l of done) {
    const key = parisParts(new Date(l.starts_at)).date.slice(0, 7);
    minutesByMonth.set(key, (minutesByMonth.get(key) ?? 0) + l.duration_minutes);
  }

  const upcoming = lessons
    .filter((l) => l.status === "confirmed" && Date.parse(l.starts_at) > now.getTime())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return {
    reportCount: sorted.length,
    recentAverage: recent === null ? null : round1(recent),
    trend: recent !== null && previous !== null ? round1(recent - previous) : null,
    engagementAverage: sorted.length ? round1(mean(sorted.map((r) => r.engagement))!) : null,
    hoursDone: round1(done.reduce((sum, l) => sum + l.duration_minutes, 0) / 60),
    hoursByMonth: months.map((m) => ({ ...m, hours: round1((minutesByMonth.get(m.month) ?? 0) / 60) })),
    bySubject,
    nextLesson: upcoming[0] ?? null,
  };
}
