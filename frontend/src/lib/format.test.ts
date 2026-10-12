import { describe, expect, it } from "vitest";

import {
  formatCoordinates,
  formatDistance,
  formatPercent,
  formatSpeed,
  formatDate,
  formatDateTime,
  formatDuration,
  formatHours,
  formatNumber,
  formatRelativeDays,
  formatRemaining,
  formatUsage,
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

describe("usage formatters", () => {
  it.each([
    ["flight_hours", "12.50", "12.5 h"],
    ["cycles", "1", "1 cycle"],
    ["cycles", "1500", "1,500 cycles"],
    ["calendar_days", "30.00", "30 days"],
    ["calendar_days", "1", "1 day"],
  ])("formatUsage(%s, %s) = %s", (unit, value, expected) => {
    expect(formatUsage(unit, value)).toBe(expected);
  });

  it.each([
    ["flight_hours", "12.50", "12.5 h left"],
    ["calendar_days", "0.00", "Due now"],
    ["cycles", "-3", "3 cycles over"],
    ["calendar_days", "-1", "1 day over"],
  ])("formatRemaining(%s, %s) = %s", (unit, value, expected) => {
    expect(formatRemaining(unit, value)).toBe(expected);
  });
});

describe("telemetry formatters", () => {
  it.each([
    [850, "850 m"],
    [9213.7, "9.2 km"],
    [12000, "12 km"],
  ])("formatDistance(%d) = %s", (meters, expected) => {
    expect(formatDistance(meters)).toBe(expected);
  });

  it("formats speed and percentages", () => {
    expect(formatSpeed(17.25)).toBe("17.3 m/s");
    expect(formatPercent(66.5)).toBe("66.5 %");
  });

  it("formats coordinates with hemispheres", () => {
    expect(formatCoordinates(41.0151, 28.9795)).toBe("41.01510° N, 28.97950° E");
    expect(formatCoordinates(-33.8688, -70.6693)).toBe("33.86880° S, 70.66930° W");
  });
});
