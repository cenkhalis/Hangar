import { Badge } from "@/components/ui/badge";
import type { FlightLogStatus, RejectionCode } from "@/lib/api/flights";

export const LOG_STATUS_LABELS: Record<FlightLogStatus, string> = {
  processed: "Processed",
  rejected: "Rejected",
};

export const REJECTION_LABELS: Record<RejectionCode, string> = {
  unknown_aircraft: "Unknown aircraft",
  aircraft_retired: "Aircraft retired",
  overlapping_flight: "Overlapping flight",
};

export function FlightLogStatusBadge({ status }: { status: FlightLogStatus }) {
  return (
    <Badge variant={status === "rejected" ? "destructive" : "secondary"}>
      {LOG_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Label for a log's rejection code; processed logs have none. */
export function rejectionLabel(code: RejectionCode | ""): string | null {
  return code ? REJECTION_LABELS[code] : null;
}
