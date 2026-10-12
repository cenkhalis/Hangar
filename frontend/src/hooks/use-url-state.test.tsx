import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useUrlState } from "./use-url-state";

const nav = vi.hoisted(() => ({ search: "", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/aircraft",
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

describe("useUrlState", () => {
  beforeEach(() => {
    nav.push.mockClear();
  });

  it("reads the page and filters from the URL", () => {
    nav.search = "status=active&page=3";

    const { result } = renderHook(() => useUrlState());

    expect(result.current.page).toBe(3);
    expect(result.current.params.get("status")).toBe("active");
  });

  it("navigates to the first page when a filter changes", () => {
    nav.search = "status=active&page=3";
    const { result } = renderHook(() => useUrlState());

    act(() => result.current.setParams({ status: "grounded" }));

    expect(nav.push).toHaveBeenCalledWith("/aircraft?status=grounded", { scroll: false });
  });

  it("keeps filters when changing page", () => {
    nav.search = "status=active";
    const { result } = renderHook(() => useUrlState());

    act(() => result.current.setPage(2));

    expect(nav.push).toHaveBeenCalledWith("/aircraft?status=active&page=2", { scroll: false });
  });

  it("navigates to the bare path when every filter is cleared", () => {
    nav.search = "status=active";
    const { result } = renderHook(() => useUrlState());

    act(() => result.current.setParams({ status: null }));

    expect(nav.push).toHaveBeenCalledWith("/aircraft", { scroll: false });
  });
});
