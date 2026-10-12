import { useQuery } from "@tanstack/react-query";

import { type AircraftStatus, countAircraft } from "@/lib/api/fleet";
import { countFlightLogs, type FlightLogStatus } from "@/lib/api/flights";
import { countWorkOrders, type WorkOrderStatus } from "@/lib/api/maintenance";
import { queryKeys } from "@/lib/query-keys";

/** Each KPI is one `page_size=1` request; nothing downloads a full list. */
export function useAircraftCount(status: AircraftStatus) {
  return useQuery({
    queryKey: queryKeys.fleet.aircraftCount(status),
    queryFn: () => countAircraft(status),
  });
}

export function useWorkOrderCount(status: WorkOrderStatus) {
  return useQuery({
    queryKey: queryKeys.maintenance.workOrderCount(status),
    queryFn: () => countWorkOrders(status),
  });
}

export function useFlightLogCount(status: FlightLogStatus) {
  return useQuery({
    queryKey: queryKeys.flights.logCount(status),
    queryFn: () => countFlightLogs(status),
  });
}
