import { notFound } from "next/navigation";
import { Suspense } from "react";

import { WorkOrderDetail } from "@/components/maintenance/work-order-detail";
import { Skeleton } from "@/components/ui/skeleton";

export default function WorkOrderDetailPage({ params }: PageProps<"/work-orders/[id]">) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      {/* Params are runtime data under Cache Components, so they resolve inside Suspense. */}
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        {params.then(({ id }) => {
          if (!/^\d+$/.test(id)) notFound();
          return <WorkOrderDetail id={Number(id)} />;
        })}
      </Suspense>
    </div>
  );
}
