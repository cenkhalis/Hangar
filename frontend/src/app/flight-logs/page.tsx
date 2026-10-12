import type { Metadata } from "next";
import { Suspense } from "react";

import { FlightLogList } from "@/components/flights/flight-log-list";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Flight logs · HANGAR" };

export default function FlightLogsPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Flight logs"
        description="Every log received from the ingest service, including rejected ones."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <FlightLogList />
      </Suspense>
    </div>
  );
}
