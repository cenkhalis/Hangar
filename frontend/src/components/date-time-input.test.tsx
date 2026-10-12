import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DateTimeInput } from "./date-time-input";

describe("DateTimeInput", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("caps the picker at the current minute when future values are not allowed", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 12, 14, 5, 42));

    render(<DateTimeInput aria-label="Performed at" notInFuture />);

    const input = screen.getByLabelText("Performed at");
    expect(input).toHaveAttribute("type", "datetime-local");
    expect(input).toHaveAttribute("max", "2026-10-12T14:05");
  });

  it("has no upper bound by default", () => {
    render(<DateTimeInput aria-label="Opened at" />);

    expect(screen.getByLabelText("Opened at")).not.toHaveAttribute("max");
  });
});
