import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ApiError } from "./client";
import { describeError, ERROR_MESSAGES } from "./errors";

const registry = JSON.parse(
  // Vitest runs from frontend/; the registry is exported by the backend (`make schema`).
  readFileSync(resolve(process.cwd(), "../contracts/errors/domain-errors.json"), "utf8"),
) as { codes: Record<string, string[]> };

describe("ERROR_MESSAGES", () => {
  it("has wording for every backend domain error code", () => {
    const missing = Object.keys(registry.codes).filter((code) => !(code in ERROR_MESSAGES));

    expect(missing, "Add messages for new backend error codes").toEqual([]);
  });
});

describe("describeError", () => {
  it("combines the title, backend detail and hint", () => {
    const error = new ApiError(400, "duplicate_open_task", "Task A is already pending on work order 7.");

    expect(describeError(error)).toEqual({
      title: "Task already on an open work order",
      description:
        "Task A is already pending on work order 7. Complete or cancel that work order first.",
    });
  });

  it("uses non-field errors as the description for validation errors", () => {
    const error = new ApiError(400, "validation_error", "first", {
      value: ["Must be positive."],
      non_field_errors: ["Counters are read-only."],
    });

    expect(describeError(error)).toEqual({
      title: "Please check the highlighted fields",
      description: "Counters are read-only.",
    });
  });

  it("falls back for unknown codes and non-API errors", () => {
    expect(describeError(new ApiError(418, "teapot", "Short and stout")).title).toBe("Request failed");
    expect(describeError(new Error("boom"))).toEqual({
      title: "Something went wrong",
      description: "Error: boom",
    });
  });
});
