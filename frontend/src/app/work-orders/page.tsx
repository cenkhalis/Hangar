import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { WorkOrderList } from "@/components/maintenance/work-order-list";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Work orders · HANGAR" };

export default function WorkOrdersPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader title="Work orders" description="Planned maintenance and its sign-offs." />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <WorkOrderList />
      </Suspense>
    </div>
  );
}
