"use client";

import { columnHelper, DataTable } from "@/components/data-table";
import { useFlights } from "@/hooks/use-flights";
import { useUrlState } from "@/hooks/use-url-state";
import type { Flight } from "@/lib/api/flights";
import { formatDateTime, formatDuration, formatNumber } from "@/lib/format";

const helper = columnHelper<Flight>();

const columns = helper.columns([
  helper.accessor("departure_at", {
    header: "Departure",
    cell: (info) => formatDateTime(info.getValue()),
  }),
  helper.accessor("duration_seconds", {
    header: "Duration",
    cell: (info) => formatDuration(info.getValue()),
  }),
  helper.accessor("distance_m", {
    header: "Distance",
    cell: (info) => `${formatNumber(info.getValue() / 1000, 1)} km`,
  }),
  helper.accessor("max_altitude_m", {
    header: "Max altitude",
    cell: (info) => `${formatNumber(info.getValue(), 0)} m`,
  }),
  helper.accessor("max_speed_mps", {
    header: "Max speed",
    cell: (info) => `${formatNumber(info.getValue(), 1)} m/s`,
  }),
  helper.display({
    id: "battery",
    header: "Battery used",
    cell: ({ row }) =>
      `${formatNumber(row.original.battery_start_pct - row.original.battery_end_pct, 1)} %`,
  }),
  helper.accessor("cycles", { header: "Cycles" }),
]);

export function AircraftFlights({ aircraftId }: { aircraftId: number }) {
  const { page, setPage } = useUrlState();
  const flights = useFlights({ page, aircraft: aircraftId });

  return (
    <DataTable
      label="Flights"
      columns={columns}
      data={flights.data?.results}
      isPending={flights.isPending}
      error={flights.error}
      onRetry={() => flights.refetch()}
      emptyMessage="No flights recorded for this aircraft."
      pagination={flights.data && { page, count: flights.data.count, onPageChange: setPage }}
    />
  );
}
