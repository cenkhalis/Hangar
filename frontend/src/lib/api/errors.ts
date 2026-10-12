import { ApiError } from "./client";

type Message = { title: string; hint?: string };

/**
 * UI wording for every backend domain error code (contracts/errors/domain-errors.json) and for
 * client-side error codes. The backend `detail` is shown alongside, since it names the records.
 */
export const ERROR_MESSAGES: Record<string, Message> = {
  // fleet
  fleet_error: { title: "Fleet operation failed" },
  invalid_usage: { title: "Invalid usage values" },
  aircraft_retired: { title: "Aircraft is retired", hint: "Retired aircraft cannot be changed." },
  component_not_installable: { title: "Component cannot be installed" },
  component_not_installed: { title: "Component is not installed" },
  component_installed: {
    title: "Component is still installed",
    hint: "Remove it from the aircraft first.",
  },
  position_occupied: { title: "Position already occupied" },
  invalid_timestamp: { title: "Invalid date or time" },
  // flights
  flights_error: { title: "Flight log operation failed" },
  flight_log_not_rejected: { title: "Only rejected logs can be reprocessed" },
  // maintenance
  maintenance_error: { title: "Maintenance operation failed" },
  task_not_in_program: { title: "Task not available for this aircraft" },
  duplicate_open_task: {
    title: "Task already on an open work order",
    hint: "Complete or cancel that work order first.",
  },
  empty_work_order: { title: "Select at least one task" },
  work_order_not_open: {
    title: "Work order is closed",
    hint: "Reload to see its current state.",
  },
  item_not_pending: { title: "Item is no longer pending", hint: "Reload to see its current state." },
  missing_reason: { title: "A reason is required" },
  missing_performer: { title: "Performed by is required" },
  completion_already_voided: { title: "Sign-off already voided" },
  // client
  validation_error: { title: "Please check the highlighted fields" },
  not_found: { title: "Not found", hint: "It may have been deleted." },
  conflict: {
    title: "In use",
    hint: "It is referenced by other records; deactivate or retire it instead.",
  },
  server_error: { title: "Server error", hint: "Try again in a moment." },
  network_error: { title: "Cannot reach the server", hint: "Check your connection and retry." },
  http_error: { title: "Request failed" },
};

export type ErrorDescription = { title: string; description: string };

export function describeError(error: unknown): ErrorDescription {
  if (!(error instanceof ApiError)) {
    return { title: "Something went wrong", description: String(error ?? "Unknown error") };
  }
  const message = ERROR_MESSAGES[error.code] ?? ERROR_MESSAGES.http_error;
  const detail =
    error.code === "validation_error" ? error.nonFieldErrors.join(" ") : error.message;
  const description = [detail, message.hint].filter(Boolean).join(" ");
  return { title: message.title, description };
}
