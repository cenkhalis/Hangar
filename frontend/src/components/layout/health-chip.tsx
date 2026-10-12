"use client";

import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useHealth } from "@/hooks/use-health";
import { cn } from "@/lib/utils";

type ChipState = "checking" | "online" | "unavailable";

const LABELS: Record<ChipState, string> = {
  checking: "Checking backend…",
  online: "Backend online",
  unavailable: "Backend unavailable",
};

const DOTS: Record<ChipState, string> = {
  checking: "bg-muted-foreground animate-pulse",
  online: "bg-emerald-500",
  unavailable: "bg-red-500",
};

/** Live backend status for the shell; rechecks on an interval and on demand. */
export function HealthChip({ className }: { className?: string }) {
  const { data, isPending, isError, isFetching, refetch } = useHealth();

  let state: ChipState;
  if (isPending) state = "checking";
  else if (isError || data.status !== "ok") state = "unavailable";
  else state = "online";

  const details =
    data && Object.entries(data.checks).map(([name, value]) => `${name}: ${value}`).join(", ");

  return (
    <div className={cn("flex items-center gap-1.5 text-xs whitespace-nowrap", className)}>
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOTS[state])} />
      {/* Phones show only the dot; the label stays available to assistive technology. */}
      <span role="status" title={details || undefined} className="sr-only md:not-sr-only">
        {LABELS[state]}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => refetch()}
        disabled={isFetching}
        aria-label="Recheck backend"
      >
        <RefreshCw aria-hidden className={cn(isFetching && "animate-spin")} />
      </Button>
    </div>
  );
}
