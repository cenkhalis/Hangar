import Link from "next/link";

import { columnHelper } from "@/components/data-table";
import type { Flight } from "@/lib/api/flights";
import {
  formatDateTime,
  formatDistance,
  formatDuration,
  formatNumber,
  formatPercent,
  formatSpeed,
} from "@/lib/format";

const helper = columnHelper<Flight>();

const departure = helper.accessor("departure_at", {
  header: "Departure",
  cell: (info) => (
    <Link href={`/flights/${info.row.original.id}`} className="font-medium hover:underline">
      {formatDateTime(info.getValue())}
    </Link>
  ),
});

const aircraft = helper.accessor("aircraft_serial", {
  header: "Aircraft",
  cell: (info) => (
    <Link href={`/aircraft/${info.row.original.aircraft}`} className="hover:underline">
      {info.getValue()}
    </Link>
  ),
});

const telemetry = helper.columns([
  helper.accessor("duration_seconds", {
    header: "Duration",
    cell: (info) => formatDuration(info.getValue()),
  }),
  helper.accessor("distance_m", { header: "Distance", cell: (info) => formatDistance(info.getValue()) }),
  helper.accessor("max_altitude_m", {
    header: "Max altitude",
    cell: (info) => `${formatNumber(info.getValue(), 0)} m`,
  }),
  helper.accessor("max_speed_mps", { header: "Max speed", cell: (info) => formatSpeed(info.getValue()) }),
  helper.display({
    id: "battery",
    header: "Battery used",
    cell: ({ row }) => formatPercent(row.original.battery_start_pct - row.original.battery_end_pct),
  }),
  helper.accessor("cycles", { header: "Cycles" }),
]);

/** Flight summary columns; the aircraft column is left out on an aircraft's own page. */
export const flightColumns = {
  withAircraft: helper.columns([departure, aircraft, ...telemetry]),
  forAircraft: helper.columns([departure, ...telemetry]),
};
