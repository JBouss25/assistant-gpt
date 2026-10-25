import { describe, expect, it } from "vitest";
import { bayesianRating, rankTeachers, scoreTeacher, type MatchStudent } from "./matching";
import type { TeacherCard } from "./types";

function teacher(overrides: Partial<TeacherCard> = {}): TeacherCard {
  return {
    id: "t1",
    headline: "",
    bio: "",
    subjects: ["Mathématiques", "Physique-Chimie"],
    levels: ["lycee", "cpge"],
    hourly_rate: 35,
    mode: "both",
    years_experience: 3,
    diplomas: "",
    availability: ["wed_afternoon", "sat_morning"],
    rating_avg: 0,
    rating_count: 0,
    is_published: true,
    profile: { full_name: "Alice Martin", city: "Lyon", avatar_url: null },
    ...overrides,
  };
}

const student: MatchStudent = {
  level: "lycee",
  subjects: ["Mathématiques", "Physique-Chimie"],
  budget_max: 40,
  mode: "both",
  availability: ["wed_afternoon", "sat_morning"],
  city: "Lyon",
};

describe("scoreTeacher", () => {
  it("rejects a teacher who does not teach the student's level", () => {
    expect(scoreTeacher(student, teacher({ levels: ["college"] }))).toBeNull();
  });

  it("rejects a teacher with no subject in common", () => {
    expect(scoreTeacher(student, teacher({ subjects: ["Anglais"] }))).toBeNull();
  });

  it("gives a high score to an ideal match", () => {
    const r = scoreTeacher(student, teacher())!;
    expect(r.score).toBeGreaterThanOrEqual(95);
    expect(r.reasons).toContain("Enseigne toutes vos matières");
  });

  it("scores partial subject coverage lower", () => {
    const full = scoreTeacher(student, teacher())!.score;
    const half = scoreTeacher(student, teacher({ subjects: ["Mathématiques"] }))!.score;
    expect(half).toBeLessThan(full);
    expect(full - half).toBe(20);
  });

  it("penalises rates above budget and drops the budget points past +50%", () => {
    const within = scoreTeacher(student, teacher({ hourly_rate: 40 }))!.score;
    const above = scoreTeacher(student, teacher({ hourly_rate: 50 }))!.score;
    const wayAbove = scoreTeacher(student, teacher({ hourly_rate: 80 }))!.score;
    expect(above).toBeLessThan(within);
    expect(within - wayAbove).toBe(10);
  });

  it("gives no mode points when modes are incompatible", () => {
    const s = { ...student, mode: "in_person" as const };
    const ok = scoreTeacher(s, teacher({ mode: "in_person" }))!.score;
    const ko = scoreTeacher(s, teacher({ mode: "online" }))!.score;
    expect(ok - ko).toBe(10);
  });

  it("halves mode points for in-person lessons in another city", () => {
    const s = { ...student, mode: "in_person" as const };
    const sameCity = scoreTeacher(s, teacher())!.score;
    const other = scoreTeacher(s, teacher({ profile: { full_name: "B", city: "Paris", avatar_url: null } }))!.score;
    expect(sameCity - other).toBe(5);
  });

  it("matches city names regardless of accents and case", () => {
    const s = { ...student, mode: "in_person" as const, city: "saint-etienne" };
    const r = scoreTeacher(s, teacher({ profile: { full_name: "B", city: "Saint-Étienne", avatar_url: null } }))!;
    expect(r.reasons).toContain("Disponible à Saint-Étienne");
  });
});

describe("bayesianRating", () => {
  it("shrinks a single perfect review toward the prior", () => {
    expect(bayesianRating(5, 1)).toBeLessThan(bayesianRating(4.8, 40));
  });
});

describe("rankTeachers", () => {
  it("sorts by score and filters out incompatible teachers", () => {
    const ranked = rankTeachers(student, [
      teacher({ id: "cheap-partial", subjects: ["Mathématiques"], hourly_rate: 20 }),
      teacher({ id: "ideal" }),
      teacher({ id: "wrong-level", levels: ["universite"] }),
    ]);
    expect(ranked.map((r) => r.teacher.id)).toEqual(["ideal", "cheap-partial"]);
  });
});
