import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/client";

import { applyFieldErrors } from "./forms";

type Values = { performed_at: string; performed_by: string };
const FIELDS = ["performed_at", "performed_by"] as const;

describe("applyFieldErrors", () => {
  it("attaches every validation error to its field", () => {
    const setError = vi.fn();
    const error = new ApiError(400, "validation_error", "Bad", {
      performed_at: ["Cannot be in the future.", "Second message."],
    });

    expect(applyFieldErrors<Values>(error, setError, FIELDS)).toBe(true);
    expect(setError).toHaveBeenCalledWith("performed_at", {
      type: "server",
      message: "Cannot be in the future. Second message.",
    });
  });

  it("reports errors for fields the form does not show", () => {
    const setError = vi.fn();
    const error = new ApiError(400, "validation_error", "Bad", {
      performed_by: ["Required."],
      non_field_errors: ["Something else."],
    });

    expect(applyFieldErrors<Values>(error, setError, FIELDS)).toBe(false);
    expect(setError).toHaveBeenCalledOnce();
  });

  it("leaves domain errors to the form", () => {
    const setError = vi.fn();
    const error = new ApiError(400, "task_not_in_program", "Not in program");

    expect(applyFieldErrors<Values>(error, setError, FIELDS)).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });
});
