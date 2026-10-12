import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Pagination } from "./pagination";

describe("Pagination", () => {
  it("disables Previous on the first page", () => {
    render(<Pagination page={1} count={120} onPageChange={() => {}} />);

    expect(screen.getByRole("button", { name: /Previous/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Next/ })).toBeEnabled();
  });

  it("disables Next on the last page", () => {
    render(<Pagination page={3} count={120} onPageChange={() => {}} />);

    expect(screen.getByRole("button", { name: /Next/ })).toBeDisabled();
  });

  it("treats a single partial page as one page", () => {
    render(<Pagination page={1} count={1} onPageChange={() => {}} />);

    expect(screen.getByText("1 result")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next/ })).toBeDisabled();
  });
});
