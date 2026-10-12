import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { isActive } from "@/lib/navigation";

import { NavLinks } from "./nav-links";

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

describe("isActive", () => {
  it.each([
    ["/", "/", true],
    ["/fleet", "/", false],
    ["/fleet", "/fleet", true],
    ["/fleet/aircraft/3", "/fleet", true],
    ["/fleetwide", "/fleet", false],
  ])("isActive(%s, %s) = %s", (path, href, expected) => {
    expect(isActive(path, href)).toBe(expected);
  });
});

describe("NavLinks", () => {
  it("marks the current page", () => {
    pathname.current = "/";

    render(<NavLinks />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  });
});
