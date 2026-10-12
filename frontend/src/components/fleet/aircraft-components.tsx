"use client";

import { useMemo } from "react";

import { columnHelper, DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { useAirworthiness, useComponentTypes } from "@/hooks/use-fleet";
import type { ComponentType, InstalledComponentStatus } from "@/lib/api/fleet";
import { formatRemaining } from "@/lib/format";

const helper = columnHelper<InstalledComponentStatus>();

function componentColumns(types: Map<number, ComponentType>) {
  return helper.columns([
    helper.accessor("component_type", {
      header: "Type",
      cell: (info) => {
        const type = types.get(info.getValue());
        return type ? `${type.name} (${type.part_number})` : "—";
      },
    }),
    helper.accessor("serial_number", { header: "Serial" }),
    helper.accessor("position", { header: "Position", cell: (info) => info.getValue() || "—" }),
    helper.accessor("life_status", {
      id: "state",
      header: "Life",
      cell: (info) => <StatusBadge state={info.getValue().state} />,
    }),
    helper.accessor("life_status", {
      id: "remaining",
      header: "Remaining",
      cell: (info) => {
        const limits = info.getValue().limits.filter((limit) => limit.remaining !== null);
        if (limits.length === 0) return <span className="text-muted-foreground">No limits</span>;
        return (
          <ul>
            {limits.map((limit) => (
              <li key={limit.limit_type}>{formatRemaining(limit.limit_type, limit.remaining!)}</li>
            ))}
          </ul>
        );
      },
    }),
  ]);
}

export function AircraftComponents({ aircraftId }: { aircraftId: number }) {
  const airworthiness = useAirworthiness(aircraftId);
  const types = useComponentTypes();
  const columns = useMemo(
    () => componentColumns(new Map((types.data ?? []).map((t) => [t.id, t]))),
    [types.data],
  );

  return (
    <DataTable
      label="Installed components"
      columns={columns}
      data={airworthiness.data?.components}
      isPending={airworthiness.isPending}
      error={airworthiness.error}
      onRetry={() => airworthiness.refetch()}
      emptyMessage="No components installed."
    />
  );
}
