"use client";

import type { ReactNode } from "react";

import { QueryError } from "@/components/query-error";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAirworthiness } from "@/hooks/use-fleet";
import type { Aircraft } from "@/lib/api/fleet";
import { formatDate, formatHours, formatNumber } from "@/lib/format";

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-xl group-data-[size=sm]/card:text-xl">{children}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function Airworthiness({ aircraftId }: { aircraftId: number }) {
  const airworthiness = useAirworthiness(aircraftId);
  if (airworthiness.isPending) return <Skeleton className="h-24 w-full" />;
  if (airworthiness.isError) {
    return <QueryError error={airworthiness.error} onRetry={() => airworthiness.refetch()} />;
  }
  const { airworthy, state, components } = airworthiness.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{airworthy ? "Airworthy" : "Not airworthy"}</CardTitle>
        <CardDescription>
          Based on the life limits of {components.length} installed{" "}
          {components.length === 1 ? "component" : "components"}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <StatusBadge state={state} />
      </CardContent>
    </Card>
  );
}

export function AircraftOverview({ aircraft }: { aircraft: Aircraft }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Flight hours">{formatHours(aircraft.flight_hours)}</Stat>
        <Stat label="Cycles">{formatNumber(aircraft.cycles, 0)}</Stat>
        <Stat label="In service since">
          {aircraft.in_service_date ? formatDate(aircraft.in_service_date) : "—"}
        </Stat>
      </div>
      <Airworthiness aircraftId={aircraft.id} />
    </div>
  );
}
