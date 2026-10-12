"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { QueryError } from "@/components/query-error";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFlight } from "@/hooks/use-flights";
import {
  formatCoordinates,
  formatDateTime,
  formatDistance,
  formatDuration,
  formatNumber,
  formatPercent,
  formatSpeed,
} from "@/lib/format";

function Metric({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-xl">{value}</CardTitle>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </CardHeader>
    </Card>
  );
}

/** Telemetry summary of one flight; the backend keeps summaries, not time series. */
export function FlightDetail({ id }: { id: number }) {
  const flight = useFlight(id);

  if (flight.isPending) return <Skeleton className="h-96 w-full" />;
  if (flight.isError) return <QueryError error={flight.error} onRetry={() => flight.refetch()} />;

  const f = flight.data;
  return (
    <>
      <PageHeader
        title={`Flight ${formatDateTime(f.departure_at)}`}
        description={
          <>
            <Link href={`/aircraft/${f.aircraft}`} className="hover:underline">
              {f.aircraft_serial}
            </Link>{" "}
            · landed {formatDateTime(f.arrival_at)}
          </>
        }
        actions={
          <Link
            href={`/flight-logs/${f.log}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            View source log
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Duration" value={formatDuration(f.duration_seconds)} />
        <Metric label="Distance" value={formatDistance(f.distance_m)} />
        <Metric label="Max altitude" value={`${formatNumber(f.max_altitude_m, 1)} m`} />
        <Metric label="Max speed" value={formatSpeed(f.max_speed_mps)} />
        <Metric
          label="Battery used"
          value={formatPercent(f.battery_start_pct - f.battery_end_pct)}
          detail={`${formatPercent(f.battery_start_pct)} → ${formatPercent(f.battery_end_pct)}`}
        />
        <Metric label="Cycles" value={f.cycles} />
        <Metric label="Telemetry samples" value={formatNumber(f.sample_count, 0)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Route</CardTitle>
          <CardDescription>Start and end positions reported by the flight log.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-6">
            <dt className="text-muted-foreground">Start</dt>
            <dd className="font-mono">{formatCoordinates(f.start_lat, f.start_lon)}</dd>
            <dt className="text-muted-foreground">End</dt>
            <dd className="font-mono">{formatCoordinates(f.end_lat, f.end_lon)}</dd>
          </dl>
        </CardContent>
      </Card>
    </>
  );
}
