import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/client";

import { shouldRetry } from "./providers";

describe("shouldRetry", () => {
  it("retries network and server errors up to the limit", () => {
    const network = new ApiError(0, "network_error", "offline");
    const server = new ApiError(503, "server_error", "down");

    expect(shouldRetry(0, network)).toBe(true);
    expect(shouldRetry(1, server)).toBe(true);
    expect(shouldRetry(2, server)).toBe(false);
  });

  it("does not retry client errors", () => {
    expect(shouldRetry(0, new ApiError(404, "not_found", "gone"))).toBe(false);
    expect(shouldRetry(0, new ApiError(400, "validation_error", "bad"))).toBe(false);
  });
});
