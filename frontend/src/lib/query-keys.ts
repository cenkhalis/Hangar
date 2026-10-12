import type { AircraftFilters } from "@/lib/api/fleet";
import type { FlightFilters } from "@/lib/api/flights";
import type { CompletionFilters, DueState } from "@/lib/api/maintenance";

/**
 * Query key factories. Each domain module adds its keys here, so invalidation after a mutation can
 * target exactly the queries it affects.
 */
export const queryKeys = {
  health: ["health"] as const,
  fleet: {
    aircraftList: (filters: AircraftFilters) => ["fleet", "aircraft", "list", filters] as const,
    aircraft: (id: number) => ["fleet", "aircraft", id] as const,
    airworthiness: (id: number) => ["fleet", "aircraft", id, "airworthiness"] as const,
    models: ["fleet", "models"] as const,
    componentTypes: ["fleet", "component-types"] as const,
  },
  flights: {
    list: (filters: FlightFilters) => ["flights", "list", filters] as const,
  },
  maintenance: {
    all: ["maintenance"] as const,
    due: (filters: { aircraft?: number[]; state?: DueState[] }) =>
      ["maintenance", "due", filters] as const,
    status: (aircraftId: number) => ["maintenance", "status", aircraftId] as const,
    completions: (filters: CompletionFilters) =>
      ["maintenance", "completions", filters] as const,
  },
};
