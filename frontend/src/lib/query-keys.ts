import type { AircraftFilters } from "@/lib/api/fleet";
import type { FlightFilters, FlightLogFilters } from "@/lib/api/flights";
import type { CompletionFilters, DueState, WorkOrderFilters } from "@/lib/api/maintenance";

/**
 * Query key factories. Each domain module adds its keys here, so invalidation after a mutation can
 * target exactly the queries it affects.
 */
export const queryKeys = {
  health: ["health"] as const,
  fleet: {
    all: ["fleet"] as const,
    aircraftList: (filters: AircraftFilters) => ["fleet", "aircraft", "list", filters] as const,
    aircraft: (id: number) => ["fleet", "aircraft", id] as const,
    allAircraft: ["fleet", "aircraft", "all"] as const,
    airworthiness: (id: number) => ["fleet", "aircraft", id, "airworthiness"] as const,
    models: ["fleet", "models"] as const,
    componentTypes: ["fleet", "component-types"] as const,
  },
  flights: {
    all: ["flights"] as const,
    list: (filters: FlightFilters) => ["flights", "list", filters] as const,
    detail: (id: number) => ["flights", "detail", id] as const,
    logs: (filters: FlightLogFilters) => ["flights", "logs", "list", filters] as const,
    log: (id: number) => ["flights", "logs", id] as const,
  },
  maintenance: {
    all: ["maintenance"] as const,
    due: (filters: { aircraft?: number[]; state?: DueState[] }) =>
      ["maintenance", "due", filters] as const,
    status: (aircraftId: number) => ["maintenance", "status", aircraftId] as const,
    completions: (filters: CompletionFilters) =>
      ["maintenance", "completions", filters] as const,
    completion: (id: number) => ["maintenance", "completions", id] as const,
    workOrders: (filters: WorkOrderFilters) =>
      ["maintenance", "work-orders", "list", filters] as const,
    workOrder: (id: number) => ["maintenance", "work-orders", id] as const,
  },
};
