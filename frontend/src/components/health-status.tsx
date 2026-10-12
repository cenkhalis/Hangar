"use client";

import { Button } from "@/components/ui/button";
import { useHealth } from "@/hooks/use-health";

export function HealthStatus() {
  const { data, isPending, isError, isFetching, refetch } = useHealth();

  let label: string;
  if (isPending) {
    label = "Checking backend…";
  } else if (isError || data.status !== "ok") {
    label = "Backend unavailable";
  } else {
    label = "Backend online";
  }

  return (
    <div className="flex items-center gap-4">
      <p role="status">{label}</p>
      <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
        Retry
      </Button>
    </div>
  );
}
