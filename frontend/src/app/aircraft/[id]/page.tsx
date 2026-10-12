import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AircraftDetail } from "@/components/fleet/aircraft-detail";
import { Skeleton } from "@/components/ui/skeleton";

export default function AircraftDetailPage({ params }: PageProps<"/aircraft/[id]">) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      {/* Params are runtime data under Cache Components, so they resolve inside Suspense. */}
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        {params.then(({ id }) => {
          if (!/^\d+$/.test(id)) notFound();
          return <AircraftDetail id={Number(id)} />;
        })}
      </Suspense>
    </div>
  );
}
