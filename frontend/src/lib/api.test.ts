import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiFetch } from "./api";

function mockFetch(response: Partial<Response>) {
  const fn = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("returns parsed JSON on success", async () => {
    const fetchMock = mockFetch({ ok: true, status: 200, json: async () => ({ hello: "world" }) });

    await expect(apiFetch("/api/thing/")).resolves.toEqual({ hello: "world" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/thing/",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });

  it("throws ApiError with status on non-2xx responses", async () => {
    mockFetch({ ok: false, status: 503 });

    const error = await apiFetch("/api/health/").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(503);
  });
});
