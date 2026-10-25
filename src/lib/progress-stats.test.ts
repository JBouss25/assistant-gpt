import { describe, expect, it } from "vitest";
import { computeProgress, lastMonths } from "./progress-stats";
import type { LessonReport } from "./types";

const now = new Date("2026-10-25T12:00:00Z");

function report(date: string, subject: string, grade: number, engagement = 4): LessonReport {
  return {
    id: date + subject,
    lesson_id: date + subject,
    teacher_id: "t",
    student_id: "s",
    subject,
    lesson_date: `${date}T14:00:00Z`,
    grade,
    engagement,
    topics: "",
    homework: "",
    comment: "",
    created_at: date,
  };
}

describe("computeProgress", () => {
  const reports = [
    report("2026-09-02", "Mathématiques", 9),
    report("2026-09-09", "Mathématiques", 10),
    report("2026-09-16", "Physique-Chimie", 11, 3),
    report("2026-10-07", "Mathématiques", 13),
    report("2026-10-14", "Physique-Chimie", 14, 5),
    report("2026-10-21", "Mathématiques", 15),
  ];
  const lessons = [
    { starts_at: "2026-09-02T12:00:00Z", ends_at: "2026-09-02T13:30:00Z", duration_minutes: 90, status: "confirmed" },
    { starts_at: "2026-10-21T12:00:00Z", ends_at: "2026-10-21T14:00:00Z", duration_minutes: 120, status: "confirmed" },
    { starts_at: "2026-10-14T12:00:00Z", ends_at: "2026-10-14T14:00:00Z", duration_minutes: 120, status: "cancelled" },
    { starts_at: "2026-10-28T12:00:00Z", ends_at: "2026-10-28T13:30:00Z", duration_minutes: 90, status: "confirmed" },
  ];
  const stats = computeProgress(reports, lessons, now);

  it("averages the last three grades and compares with the three before", () => {
    expect(stats.recentAverage).toBe(14); // 13, 14, 15
    expect(stats.trend).toBe(4); // 14 − 10
  });

  it("groups grades by subject, most-reported first", () => {
    expect(stats.bySubject.map((s) => s.subject)).toEqual(["Mathématiques", "Physique-Chimie"]);
    expect(stats.bySubject[0]).toMatchObject({ last: 15, delta: 6 });
  });

  it("counts only finished confirmed lessons as hours done", () => {
    expect(stats.hoursDone).toBe(3.5);
    expect(stats.hoursByMonth.map((m) => m.hours)).toEqual([0, 0, 0, 0, 1.5, 2]);
  });

  it("finds the next confirmed lesson", () => {
    expect(stats.nextLesson?.starts_at).toBe("2026-10-28T12:00:00Z");
  });

  it("averages engagement", () => {
    expect(stats.engagementAverage).toBe(4);
  });

  it("handles a student with no report yet", () => {
    const empty = computeProgress([], [], now);
    expect(empty).toMatchObject({ recentAverage: null, trend: null, engagementAverage: null, hoursDone: 0, bySubject: [] });
  });
});

describe("lastMonths", () => {
  it("returns six months ending with the current one, across a year boundary", () => {
    const months = lastMonths(new Date("2027-02-10T12:00:00Z"), 6);
    expect(months.map((m) => m.month)).toEqual(["2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(months[0]!.label).toBe("sept");
  });
});
