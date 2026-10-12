import { api, type Schemas, unwrap } from "./client";

export type DueState = Schemas["DueStateEnum"];
export type DueItem = Schemas["DueItem"];
export type MaintenanceReport = Schemas["MaintenanceReport"];
export type TaskStatus = Schemas["TaskStatus"];
export type IntervalStatus = Schemas["IntervalStatus"];
export type TaskCompletion = Schemas["TaskCompletion"];
export type HistoricalCompletionRequest = Schemas["HistoricalCompletionRequest"];

/** Due list; the API defaults to due_soon and overdue across the whole fleet. */
export function listDue({ aircraft, state }: { aircraft?: number[]; state?: DueState[] } = {}) {
  return unwrap(api.GET("/api/maintenance/due/", { params: { query: { aircraft, state } } }));
}

export function getMaintenanceStatus(aircraftId: number): Promise<MaintenanceReport> {
  return unwrap(
    api.GET("/api/maintenance/aircraft/{id}/status/", { params: { path: { id: aircraftId } } }),
  );
}

export type CompletionFilters = { page: number; aircraft?: number };

export function listCompletions({ page, aircraft }: CompletionFilters) {
  return unwrap(
    api.GET("/api/maintenance/completions/", { params: { query: { page, aircraft } } }),
  );
}

export function recordHistoricalCompletion(
  body: HistoricalCompletionRequest,
): Promise<TaskCompletion> {
  return unwrap(api.POST("/api/maintenance/completions/", { body }));
}

export function voidCompletion(id: number, reason: string): Promise<TaskCompletion> {
  return unwrap(
    api.POST("/api/maintenance/completions/{id}/void/", {
      params: { path: { id } },
      body: { reason },
    }),
  );
}
