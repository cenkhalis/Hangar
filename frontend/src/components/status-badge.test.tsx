import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge, type StatusState } from "./status-badge";

describe("StatusBadge", () => {
  it.each<[StatusState, string]>([
    ["ok", "OK"],
    ["due_soon", "Due soon"],
    ["overdue", "Overdue"],
    ["expired", "Expired"],
    ["not_started", "Not started"],
    ["untracked", "Untracked"],
  ])("renders %s with a text label and icon", (state, label) => {
    const { container } = render(<StatusBadge state={state} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(container.querySelector(`[data-state="${state}"] svg`)).toHaveAttribute("aria-hidden");
  });
});
