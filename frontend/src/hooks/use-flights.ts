import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type FlightFilters,
  type FlightLogFilters,
  getFlight,
  getFlightLog,
  listFlightLogs,
  listFlights,
  reprocessFlightLog,
} from "@/lib/api/flights";
import { queryKeys } from "@/lib/query-keys";

export function useFlights(filters: FlightFilters) {
  return useQuery({
    queryKey: queryKeys.flights.list(filters),
    queryFn: () => listFlights(filters),
    placeholderData: keepPreviousData,
  });
}

export function useFlight(id: number) {
  return useQuery({ queryKey: queryKeys.flights.detail(id), queryFn: () => getFlight(id) });
}

export function useFlightLogs(filters: FlightLogFilters) {
  return useQuery({
    queryKey: queryKeys.flights.logs(filters),
    queryFn: () => listFlightLogs(filters),
    placeholderData: keepPreviousData,
  });
}

export function useFlightLog(id: number) {
  return useQuery({ queryKey: queryKeys.flights.log(id), queryFn: () => getFlightLog(id) });
}

/**
 * A processed log creates a flight and adds aircraft usage, which moves maintenance due status;
 * refresh flights, logs, fleet and maintenance data.
 */
export function useReprocessFlightLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => reprocessFlightLog(id),
    onSuccess: () =>
      Promise.all(
        [queryKeys.flights.all, queryKeys.fleet.all, queryKeys.maintenance.all].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
}
