import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { apiUrl, server } from "@/test/msw";

import { api, ApiError, flattenFieldErrors, toApiError, unwrap } from "./client";

describe("toApiError", () => {
  it("maps backend domain errors by code", () => {
    const error = toApiError(400, {
      detail: "Task INSP-50H is already pending on work order 7.",
      code: "duplicate_open_task",
    });

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("duplicate_open_task");
    expect(error.message).toBe("Task INSP-50H is already pending on work order 7.");
    expect(error.status).toBe(400);
  });

  it("maps DRF validation errors to field errors", () => {
    const error = toApiError(400, {
      value: ["Cycles and days must be whole numbers."],
      non_field_errors: ["Usage counters are read-only after creation."],
    });

    expect(error.code).toBe("validation_error");
    expect(error.fieldErrors.value).toEqual(["Cycles and days must be whole numbers."]);
    expect(error.nonFieldErrors).toEqual(["Usage counters are read-only after creation."]);
  });

  it.each([
    [404, { detail: "No Aircraft matches the given query." }, "not_found"],
    [409, { detail: "This object is referenced by other records." }, "conflict"],
    [500, "<html>oops</html>", "server_error"],
    [503, { status: "unavailable" }, "server_error"],
    [405, { detail: 'Method "DELETE" not allowed.' }, "http_error"],
  ])("maps status %i to %s", (status, body, code) => {
    expect(toApiError(status, body).code).toBe(code);
  });
});

describe("flattenFieldErrors", () => {
  it("flattens nested objects and lists into dotted paths", () => {
    expect(
      flattenFieldErrors({
        telemetry: { start: { lat: ["Ensure this value is less than or equal to 90."] } },
        tasks: [{}, { id: ["Invalid pk."] }],
        items: ["This list may not be empty."],
      }),
    ).toEqual({
      "telemetry.start.lat": ["Ensure this value is less than or equal to 90."],
      "tasks.1.id": ["Invalid pk."],
      items: ["This list may not be empty."],
    });
  });

  it("treats top-level lists and strings as non-field errors", () => {
    expect(flattenFieldErrors(["Bad"])).toEqual({ non_field_errors: ["Bad"] });
    expect(flattenFieldErrors("Bad")).toEqual({ non_field_errors: ["Bad"] });
  });
});

describe("unwrap", () => {
  it("returns data for successful responses", async () => {
    server.use(
      http.get(apiUrl("/api/health/"), () =>
        HttpResponse.json({ status: "ok", checks: { database: "ok" } }),
      ),
    );

    await expect(unwrap(api.GET("/api/health/"))).resolves.toEqual({
      status: "ok",
      checks: { database: "ok" },
    });
  });

  it("throws ApiError with the backend code for error responses", async () => {
    server.use(
      http.post(apiUrl("/api/maintenance/work-orders/:id/cancel/"), () =>
        HttpResponse.json({ detail: "Work order 3 is completed.", code: "work_order_not_open" }, {
          status: 400,
        }),
      ),
    );

    const error = await unwrap(
      api.POST("/api/maintenance/work-orders/{id}/cancel/", {
        params: { path: { id: 3 } },
        body: { reason: "Not needed" },
      }),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("work_order_not_open");
  });

  it("throws a network_error ApiError when the request cannot be made", async () => {
    server.use(http.get(apiUrl("/api/health/"), () => HttpResponse.error()));

    const error = await unwrap(api.GET("/api/health/")).catch((e: unknown) => e);

    expect((error as ApiError).code).toBe("network_error");
    expect((error as ApiError).status).toBe(0);
  });
});
