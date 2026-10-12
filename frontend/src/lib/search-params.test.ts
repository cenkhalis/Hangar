import { describe, expect, it } from "vitest";

import { mergeSearchParams, parsePage } from "./search-params";

describe("mergeSearchParams", () => {
  it("sets and replaces values", () => {
    expect(mergeSearchParams("status=active", { status: "grounded", model: 3 })).toBe(
      "status=grounded&model=3",
    );
  });

  it.each([null, undefined, ""])("removes a key set to %j", (value) => {
    expect(mergeSearchParams("status=active&model=3", { status: value })).toBe("model=3");
  });

  it("resets the page when a filter changes", () => {
    expect(mergeSearchParams("status=active&page=4", { status: "grounded" })).toBe(
      "status=grounded",
    );
  });

  it("keeps filters when only the page changes", () => {
    expect(mergeSearchParams("status=active&page=2", { page: 3 })).toBe("status=active&page=3");
  });

  it("drops page 1, which is the default", () => {
    expect(mergeSearchParams("status=active&page=2", { page: 1 })).toBe("status=active");
  });

  it("accepts URLSearchParams without mutating them", () => {
    const current = new URLSearchParams("a=1");
    expect(mergeSearchParams(current, { b: "2" })).toBe("a=1&b=2");
    expect(current.toString()).toBe("a=1");
  });
});

describe("parsePage", () => {
  it.each([
    [null, 1],
    ["", 1],
    ["3", 3],
    ["0", 1],
    ["-2", 1],
    ["2.5", 1],
    ["abc", 1],
  ])("parsePage(%j) = %i", (value, expected) => {
    expect(parsePage(value)).toBe(expected);
  });
});
