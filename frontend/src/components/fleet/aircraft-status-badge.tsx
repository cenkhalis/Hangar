import { Badge } from "@/components/ui/badge";
import type { AircraftStatus } from "@/lib/api/fleet";

export const AIRCRAFT_STATUS_LABELS: Record<AircraftStatus, string> = {
  active: "Active",
  grounded: "Grounded",
  retired: "Retired",
};

const VARIANTS = { active: "secondary", grounded: "destructive", retired: "outline" } as const;

export function AircraftStatusBadge({ status }: { status: AircraftStatus }) {
  return <Badge variant={VARIANTS[status]}>{AIRCRAFT_STATUS_LABELS[status]}</Badge>;
}
