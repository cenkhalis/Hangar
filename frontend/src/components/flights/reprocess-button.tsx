"use client";

import { RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useReprocessFlightLog } from "@/hooks/use-flights";
import type { FlightLog } from "@/lib/api/flights";
import { describeError } from "@/lib/api/errors";

import { rejectionLabel } from "./flight-log-status";

/** Retry a rejected log, e.g. after registering its aircraft in Django admin. */
export function ReprocessButton({ log }: { log: FlightLog }) {
  const reprocess = useReprocessFlightLog();

  const onClick = () =>
    reprocess.mutate(log.id, {
      onSuccess: (result) => {
        if (result.status === "processed") {
          toast.success("Flight log processed", { description: "The flight was recorded." });
        } else {
          toast.warning(`Still rejected: ${rejectionLabel(result.rejection_code)}`, {
            description: result.rejection_detail,
          });
        }
      },
      onError: (error) => {
        const { title, description } = describeError(error);
        toast.error(title, { description });
      },
    });

  return (
    <Button size="sm" onClick={onClick} disabled={reprocess.isPending}>
      <RotateCcw aria-hidden />
      {reprocess.isPending ? "Reprocessing…" : "Reprocess"}
    </Button>
  );
}
