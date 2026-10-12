import type { Metadata } from "next";
import { Suspense } from "react";

import { FlightList } from "@/components/flights/flight-list";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Flights · HANGAR" };

export default function FlightsPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title="Flights" description="Sorties recorded from processed flight logs." />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <FlightList />
      </Suspense>
    </div>
  );
}
