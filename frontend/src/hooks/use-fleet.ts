import { keepPreviousData, useQuery } from "@tanstack/react-query";

import {
  type AircraftFilters,
  getAircraft,
  getAirworthiness,
  listAircraft,
  listAllAircraftModels,
  listAllComponentTypes,
} from "@/lib/api/fleet";
import { queryKeys } from "@/lib/query-keys";

/** Reference data changes rarely; keep it for the session. */
const REFERENCE_STALE_TIME = 5 * 60_000;

export function useAircraftList(filters: AircraftFilters) {
  return useQuery({
    queryKey: queryKeys.fleet.aircraftList(filters),
    queryFn: () => listAircraft(filters),
    placeholderData: keepPreviousData,
  });
}

export function useAircraft(id: number) {
  return useQuery({ queryKey: queryKeys.fleet.aircraft(id), queryFn: () => getAircraft(id) });
}

export function useAirworthiness(id: number) {
  return useQuery({
    queryKey: queryKeys.fleet.airworthiness(id),
    queryFn: () => getAirworthiness(id),
  });
}

export function useAircraftModels() {
  return useQuery({
    queryKey: queryKeys.fleet.models,
    queryFn: listAllAircraftModels,
    staleTime: REFERENCE_STALE_TIME,
  });
}

export function useComponentTypes() {
  return useQuery({
    queryKey: queryKeys.fleet.componentTypes,
    queryFn: listAllComponentTypes,
    staleTime: REFERENCE_STALE_TIME,
  });
}
