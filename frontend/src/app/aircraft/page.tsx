import type { Metadata } from "next";
import { Suspense } from "react";

import { AircraftList } from "@/components/fleet/aircraft-list";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Aircraft · HANGAR" };

export default function AircraftPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Aircraft"
        description="Fleet inventory, usage and maintenance state. Records are managed in Django admin."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <AircraftList />
      </Suspense>
    </div>
  );
}
