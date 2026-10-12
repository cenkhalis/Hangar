"use client";

import { DataTable } from "@/components/data-table";
import { flightColumns } from "@/components/flights/flight-columns";
import { useFlights } from "@/hooks/use-flights";
import { useUrlState } from "@/hooks/use-url-state";

export function AircraftFlights({ aircraftId }: { aircraftId: number }) {
  const { page, setPage } = useUrlState();
  const flights = useFlights({ page, aircraft: aircraftId });

  return (
    <DataTable
      label="Flights"
      columns={flightColumns.forAircraft}
      data={flights.data?.results}
      isPending={flights.isPending}
      error={flights.error}
      onRetry={() => flights.refetch()}
      emptyMessage="No flights recorded for this aircraft."
      pagination={flights.data && { page, count: flights.data.count, onPageChange: setPage }}
    />
  );
}
