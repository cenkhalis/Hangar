import { describe, expect, it, vi } from "vitest";

import { fetchAllPages, pageCount } from "./pagination";

describe("pageCount", () => {
  it.each([
    [0, 1],
    [1, 1],
    [50, 1],
    [51, 2],
    [120, 3],
  ])("pageCount(%i) = %i", (count, expected) => {
    expect(pageCount(count)).toBe(expected);
  });
});

describe("fetchAllPages", () => {
  it("follows next links and concatenates results in order", async () => {
    const fetchPage = vi.fn(async (page: number) =>
      page === 1 ? { results: [1, 2], next: "?page=2" } : { results: [3], next: null },
    );

    expect(await fetchAllPages(fetchPage)).toEqual([1, 2, 3]);
    expect(fetchPage.mock.calls).toEqual([[1], [2]]);
  });
});
