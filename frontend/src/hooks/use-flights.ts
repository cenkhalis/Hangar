import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { type FlightFilters, listFlights } from "@/lib/api/flights";
import { queryKeys } from "@/lib/query-keys";

export function useFlights(filters: FlightFilters) {
  return useQuery({
    queryKey: queryKeys.flights.list(filters),
    queryFn: () => listFlights(filters),
    placeholderData: keepPreviousData,
  });
}
