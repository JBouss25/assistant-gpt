import { describe, expect, it } from "vitest";
import { addDays, durationLabel, isIsoDate, parisParts, parisToUtc, START_TIMES, weekStart } from "./time";

describe("parisToUtc", () => {
  it("handles winter time (UTC+1)", () => {
    expect(parisToUtc("2026-12-02", "14:30").toISOString()).toBe("2026-12-02T13:30:00.000Z");
  });
  it("handles summer time (UTC+2)", () => {
    expect(parisToUtc("2026-07-01", "09:00").toISOString()).toBe("2026-07-01T07:00:00.000Z");
  });
  it("handles the day of the October switch", () => {
    expect(parisToUtc("2026-10-25", "10:00").toISOString()).toBe("2026-10-25T09:00:00.000Z");
  });
  it("round-trips through parisParts", () => {
    expect(parisParts(parisToUtc("2026-03-29", "18:30"))).toEqual({ date: "2026-03-29", hour: 18, minute: 30 });
  });
});

describe("calendar dates", () => {
  it("finds the Monday of a week", () => {
    expect(weekStart("2026-10-25")).toBe("2026-10-19"); // dimanche
    expect(weekStart("2026-10-19")).toBe("2026-10-19"); // lundi
    expect(weekStart("2027-01-01")).toBe("2026-12-28");
  });
  it("adds days across months", () => {
    expect(addDays("2026-10-30", 7)).toBe("2026-11-06");
  });
  it("validates ISO dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("hier")).toBe(false);
  });
});

describe("lesson options", () => {
  it("labels durations", () => {
    expect(durationLabel(90)).toBe("1 h 30");
    expect(durationLabel(120)).toBe("2 h");
  });
  it("lets the latest 2 h lesson end by 23 h", () => {
    expect(START_TIMES[0]).toBe("08:00");
    expect(START_TIMES.at(-1)).toBe("21:00");
  });
});
