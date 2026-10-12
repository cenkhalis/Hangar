import { describe, expect, it } from "vitest";

import {
  decimalString,
  localDateTime,
  requiredText,
  thresholdPercent,
  toApiDateTime,
  toLocalInputValue,
} from "./validation";

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe("decimalString (DecimalField max_digits=10, decimal_places=2)", () => {
  const hours = decimalString();

  it.each(["2.5", "2.50", "50", "99999999.99", " 7 "])("accepts %j", (value) => {
    expect(ok(hours, value)).toBe(true);
  });

  it.each([
    ["", "Required"],
    ["abc", "Enter a number"],
    ["-1", "Enter a number"],
    ["1e3", "Enter a number"],
    ["2.555", "At most 2 decimal places"],
    ["123456789", "At most 8 digits before the decimal point"],
    ["0", "Must be greater than 0"],
    ["0.00", "Must be greater than 0"],
  ])("rejects %j (%s)", (value, message) => {
    const result = hours.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toContain(message);
  });

  it("keeps the original string so no float rounding reaches the API", () => {
    expect(hours.parse("2.50")).toBe("2.50");
  });
});

describe("whole numbers (cycles and calendar days)", () => {
  const cycles = decimalString({ wholeNumber: true });

  it.each(["300", "300.0", "300.00"])("accepts %j", (value) => {
    expect(ok(cycles, value)).toBe(true);
  });

  it.each(["2.5", "30.01"])("rejects %j", (value) => {
    expect(cycles.safeParse(value).error?.issues.map((i) => i.message)).toContain(
      "Must be a whole number",
    );
  });
});

describe("thresholdPercent", () => {
  it.each([
    ["0.01", true],
    ["10", true],
    ["99.99", true],
    ["0", false],
    ["100", false],
    ["150", false],
  ])("%s -> %s", (value, expected) => {
    expect(ok(thresholdPercent(), value)).toBe(expected);
  });
});

describe("requiredText", () => {
  it("trims and requires content", () => {
    expect(requiredText().parse("  J. Doe ")).toBe("J. Doe");
    expect(ok(requiredText(), "   ")).toBe(false);
    expect(ok(requiredText(5), "toolong")).toBe(false);
  });
});

describe("localDateTime", () => {
  const now = () => new Date(2026, 5, 1, 12, 0);
  const performedAt = localDateTime({ notInFuture: true, now });

  it("accepts past and present values", () => {
    expect(ok(performedAt, "2026-06-01T12:00")).toBe(true);
    expect(ok(performedAt, "2026-05-31T08:30")).toBe(true);
  });

  it("rejects future, empty and malformed values", () => {
    expect(performedAt.safeParse("2026-06-01T12:01").error?.issues[0].message).toBe(
      "Cannot be in the future",
    );
    expect(ok(performedAt, "")).toBe(false);
    expect(ok(performedAt, "yesterday")).toBe(false);
  });

  it("allows future values when not restricted", () => {
    expect(ok(localDateTime({ now }), "2030-01-01T00:00")).toBe(true);
  });
});

describe("datetime conversion", () => {
  it("round-trips through the browser zone and UTC", () => {
    const local = toLocalInputValue(new Date(2026, 9, 12, 8, 14, 59));

    expect(local).toBe("2026-10-12T08:14");
    expect(new Date(toApiDateTime(local)).getTime()).toBe(new Date(2026, 9, 12, 8, 14).getTime());
    expect(toApiDateTime(local)).toMatch(/Z$/);
  });
});

describe("toLocalInputValue with seconds", () => {
  it("adds seconds for second-precision inputs", () => {
    expect(toLocalInputValue(new Date(2026, 9, 12, 8, 14, 5), { seconds: true })).toBe(
      "2026-10-12T08:14:05",
    );
  });
});
