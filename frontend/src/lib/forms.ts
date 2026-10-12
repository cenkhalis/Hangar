import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import { ApiError } from "@/lib/api/client";

/**
 * Attach DRF validation errors to the form fields that show them. Returns false when something is
 * left for a form-level message: a domain error, a non-field error, or a field the form lacks.
 */
export function applyFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): boolean {
  if (!(error instanceof ApiError) || error.code !== "validation_error") return false;
  let complete = true;
  for (const [key, messages] of Object.entries(error.fieldErrors)) {
    if ((fields as readonly string[]).includes(key)) {
      setError(key as Path<T>, { type: "server", message: messages.join(" ") });
    } else {
      complete = false;
    }
  }
  return complete;
}
