import { describe, expect, it } from "vitest";

import { dateRangeToApi, parseDateParam } from "./date-range";

describe("parseDateParam", () => {
  it.each([
    ["2026-10-12", "2026-10-12"],
    [null, undefined],
    ["", undefined],
    ["2026-13-45", undefined],
    ["12/10/2026", undefined],
  ])("parseDateParam(%j) = %j", (value, expected) => {
    expect(parseDateParam(value)).toBe(expected);
  });
});

describe("dateRangeToApi", () => {
  it("starts at local midnight of the first day and ends before the day after the last", () => {
    expect(dateRangeToApi("2026-10-01", "2026-10-12")).toEqual({
      departure_after: new Date(2026, 9, 1).toISOString(),
      departure_before: new Date(2026, 9, 13).toISOString(),
    });
  });

  it("rolls the end over month boundaries", () => {
    expect(dateRangeToApi(undefined, "2026-10-31")).toEqual({
      departure_before: new Date(2026, 10, 1).toISOString(),
    });
  });

  it("leaves out bounds that are not set", () => {
    expect(dateRangeToApi()).toEqual({});
  });
});
