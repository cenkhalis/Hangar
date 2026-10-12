import createClient from "openapi-fetch";

import type { components, paths } from "./schema";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Typed client generated from contracts/openapi/hangar.yaml (`make schema`). */
export const api = createClient<paths>({
  baseUrl: API_URL,
  headers: { Accept: "application/json" },
  // Resolve fetch per request so test interceptors (MSW) installed after import still apply.
  fetch: (request) => globalThis.fetch(request),
});

export type Schemas = components["schemas"];

export type FieldErrors = Record<string, string[]>;

/** Error codes produced by the client itself rather than by backend domain errors. */
export type ClientErrorCode =
  | "network_error"
  | "validation_error"
  | "not_found"
  | "conflict"
  | "server_error"
  | "http_error";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    /** Backend domain error code (e.g. `duplicate_open_task`) or a ClientErrorCode. */
    public readonly code: string,
    message: string,
    public readonly fieldErrors: FieldErrors = {},
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Messages that belong to the request as a whole rather than one field. */
  get nonFieldErrors(): string[] {
    return this.fieldErrors.non_field_errors ?? [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Flatten DRF validation errors (`{field: [msg]}`, nested objects, lists) into dotted paths. */
export function flattenFieldErrors(body: unknown, prefix = ""): FieldErrors {
  const result: FieldErrors = {};
  const add = (key: string, message: string) => {
    (result[key || "non_field_errors"] ??= []).push(message);
  };
  if (typeof body === "string") {
    add(prefix, body);
  } else if (Array.isArray(body)) {
    body.forEach((item, index) => {
      if (typeof item === "string") add(prefix, item);
      else Object.assign(result, flattenFieldErrors(item, prefix ? `${prefix}.${index}` : `${index}`));
    });
  } else if (isRecord(body)) {
    for (const [key, value] of Object.entries(body)) {
      const path = key === "non_field_errors" ? prefix : prefix ? `${prefix}.${key}` : key;
      for (const [nestedKey, messages] of Object.entries(flattenFieldErrors(value, path))) {
        (result[nestedKey] ??= []).push(...messages);
      }
    }
  }
  return result;
}

/** Translate an error response into an ApiError. */
export function toApiError(status: number, body: unknown): ApiError {
  if (isRecord(body) && typeof body.code === "string" && typeof body.detail === "string") {
    return new ApiError(status, body.code, body.detail);
  }
  const detail = isRecord(body) && typeof body.detail === "string" ? body.detail : undefined;
  if (status === 400 && !detail) {
    const fieldErrors = flattenFieldErrors(body);
    const first = Object.values(fieldErrors)[0]?.[0] ?? "The request is invalid.";
    return new ApiError(status, "validation_error", first, fieldErrors);
  }
  if (status === 404) return new ApiError(status, "not_found", detail ?? "Not found.");
  if (status === 409) return new ApiError(status, "conflict", detail ?? "Conflict.");
  if (status >= 500) return new ApiError(status, "server_error", "The server encountered an error.");
  return new ApiError(status, "http_error", detail ?? `Request failed with status ${status}.`);
}

type FetchResult<T> = { data?: T; error?: unknown; response: Response };

/** Await an openapi-fetch call, returning its data or throwing an ApiError. */
export async function unwrap<T>(call: Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>;
  try {
    result = await call;
  } catch (cause) {
    throw new ApiError(0, "network_error", cause instanceof Error ? cause.message : "Network error");
  }
  if (!result.response.ok) {
    throw toApiError(result.response.status, result.error);
  }
  return result.data as T;
}
