"use client";

import { AircraftComponents } from "@/components/fleet/aircraft-components";
import { AircraftFlights } from "@/components/fleet/aircraft-flights";
import { AircraftOverview } from "@/components/fleet/aircraft-overview";
import { AircraftStatusBadge } from "@/components/fleet/aircraft-status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { AircraftMaintenance } from "@/components/maintenance/aircraft-maintenance";
import { QueryError } from "@/components/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAircraft } from "@/hooks/use-fleet";
import { useUrlState } from "@/hooks/use-url-state";

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "components", label: "Components" },
  { value: "flights", label: "Flights" },
  { value: "maintenance", label: "Maintenance" },
] as const;

type Tab = (typeof TABS)[number]["value"];

const DEFAULT_TAB: Tab = "overview";

function parseTab(value: string | null): Tab {
  return TABS.find((tab) => tab.value === value)?.value ?? DEFAULT_TAB;
}

/** Aircraft header with tabs kept in `?tab=`; uses `useSearchParams`, so render it in Suspense. */
export function AircraftDetail({ id }: { id: number }) {
  const { params, setParams } = useUrlState();
  const tab = parseTab(params.get("tab"));
  const aircraft = useAircraft(id);

  if (aircraft.isPending) return <Skeleton className="h-96 w-full" />;
  if (aircraft.isError) {
    return <QueryError error={aircraft.error} onRetry={() => aircraft.refetch()} />;
  }

  const { data } = aircraft;
  return (
    <>
      <PageHeader
        title={data.serial_number}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {data.model_name}
            {data.registration && <span>· {data.registration}</span>}
            <AircraftStatusBadge status={data.status} />
          </span>
        }
      />
      <Tabs
        value={tab}
        // Switching tabs drops the other tab's page number (see mergeSearchParams).
        onValueChange={(value) => setParams({ tab: value === DEFAULT_TAB ? null : value })}
      >
        <TabsList>
          {TABS.map(({ value, label }) => (
            <TabsTrigger key={value} value={value}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview" className="pt-4">
          <AircraftOverview aircraft={data} />
        </TabsContent>
        <TabsContent value="components" className="pt-4">
          <AircraftComponents aircraftId={id} />
        </TabsContent>
        <TabsContent value="flights" className="pt-4">
          <AircraftFlights aircraftId={id} />
        </TabsContent>
        <TabsContent value="maintenance" className="pt-4">
          <AircraftMaintenance aircraft={data} />
        </TabsContent>
      </Tabs>
    </>
  );
}
