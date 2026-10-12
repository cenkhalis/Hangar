import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { DueBoard } from "@/components/maintenance/due-board";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Maintenance · HANGAR" };

export default function MaintenancePage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Maintenance"
        description="Inspection tasks due across the fleet, most severe first."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <DueBoard />
      </Suspense>
    </div>
  );
}
