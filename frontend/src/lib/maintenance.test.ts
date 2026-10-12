import { describe, expect, it } from "vitest";

import { dueItem, interval } from "@/test/fixtures";

import { dueStateByAircraft, formatDuePoint, worstDueState } from "./maintenance";

describe("worstDueState", () => {
  it.each([
    [[], undefined],
    [["ok"], "ok"],
    [["ok", "overdue", "due_soon"], "overdue"],
    [["untracked", "not_started"], "not_started"],
    [["due_soon", "ok"], "due_soon"],
  ] as const)("worstDueState(%j) = %s", (states, expected) => {
    expect(worstDueState(states)).toBe(expected);
  });
});

describe("dueStateByAircraft", () => {
  it("keeps the most severe state per aircraft", () => {
    const result = dueStateByAircraft([
      dueItem({ aircraft: 1, state: "due_soon" }),
      dueItem({ aircraft: 1, state: "overdue" }),
      dueItem({ aircraft: 1, state: "due_soon" }),
      dueItem({ aircraft: 2, state: "due_soon" }),
    ]);

    expect(result).toEqual(
      new Map([
        [1, "overdue"],
        [2, "due_soon"],
      ]),
    );
  });
});

describe("formatDuePoint", () => {
  it("formats a calendar due date", () => {
    expect(
      formatDuePoint(
        interval({ interval_type: "calendar_days", due_date: "2026-11-30", due_at_aircraft_hours: null }),
      ),
    ).toBe("30 Nov 2026");
  });

  it("formats an aircraft hours reading", () => {
    expect(formatDuePoint(interval({ due_at_aircraft_hours: "133.00" }))).toBe("at 133 h");
  });

  it("formats an aircraft cycles reading", () => {
    expect(
      formatDuePoint(
        interval({
          interval_type: "cycles",
          due_at_aircraft_hours: null,
          due_at_aircraft_cycles: "1500",
        }),
      ),
    ).toBe("at 1,500 cycles");
  });

  it("returns null when an interval has not started", () => {
    expect(formatDuePoint(interval({ due_at_aircraft_hours: null }))).toBeNull();
  });
});
