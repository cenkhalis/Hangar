import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatHours,
  formatNumber,
  formatRelativeDays,
  localDateString,
} from "./format";

describe("formatters", () => {
  it.each([
    ["12.50", "12.5 h"],
    ["0.00", "0 h"],
    ["1234.567", "1,234.57 h"],
  ])("formatHours(%s) = %s", (value, expected) => {
    expect(formatHours(value)).toBe(expected);
  });

  it("formatNumber respects fraction digits", () => {
    expect(formatNumber("41.0151234", 4)).toBe("41.0151");
  });

  it.each([
    [0, "0 s"],
    [45, "45 s"],
    [27 * 60 + 54, "27 min 54 s"],
    [3600 + 5 * 60 + 30, "1 h 05 min"],
    [-5, "0 s"],
  ])("formatDuration(%i) = %s", (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it("formats date-times in the requested zone", () => {
    expect(formatDateTime("2026-10-12T08:14:03Z", "UTC")).toBe("12 Oct 2026, 08:14");
    expect(formatDateTime("2026-10-12T08:14:03Z", "Europe/Istanbul")).toBe("12 Oct 2026, 11:14");
  });

  it("formats date-only values without shifting the day", () => {
    expect(formatDate("2026-06-30")).toBe("30 Jun 2026");
  });

  it.each([
    ["2026-06-01", "today"],
    ["2026-06-02", "tomorrow"],
    ["2026-06-04", "in 3 days"],
    ["2026-05-30", "2 days ago"],
  ])("formatRelativeDays(%s) = %s", (date, expected) => {
    expect(formatRelativeDays(date, "2026-06-01")).toBe(expected);
  });

  it("localDateString uses the local calendar date", () => {
    expect(localDateString(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});
