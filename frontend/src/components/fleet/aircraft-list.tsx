"use client";

import Link from "next/link";
import { useMemo } from "react";

import { columnHelper, DataTable } from "@/components/data-table";
import { AIRCRAFT_STATUS_LABELS, AircraftStatusBadge } from "@/components/fleet/aircraft-status-badge";
import { OptionSelect, type SelectOption } from "@/components/option-select";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAircraftList, useAircraftModels } from "@/hooks/use-fleet";
import { useDueForAircraft } from "@/hooks/use-maintenance";
import { useUrlState } from "@/hooks/use-url-state";
import type { Aircraft, AircraftStatus } from "@/lib/api/fleet";
import type { DueState } from "@/lib/api/maintenance";
import { formatHours, formatNumber } from "@/lib/format";
import { dueStateByAircraft } from "@/lib/maintenance";

const STATUS_OPTIONS: SelectOption[] = [
  { value: null, label: "All statuses" },
  ...Object.entries(AIRCRAFT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

const isAircraftStatus = (value: string | null): value is AircraftStatus =>
  value !== null && value in AIRCRAFT_STATUS_LABELS;

const toId = (value: string | null) => (value && /^\d+$/.test(value) ? Number(value) : undefined);

type DueBadgeState = { loading: boolean; byAircraft: Map<number, DueState> };

function MaintenanceCell({ aircraft, due }: { aircraft: Aircraft; due: DueBadgeState }) {
  // The due list leaves out retired aircraft.
  if (aircraft.status === "retired") return <span className="text-muted-foreground">—</span>;
  if (due.loading) return <Skeleton className="h-5 w-20" />;
  const state = due.byAircraft.get(aircraft.id);
  return state ? (
    <StatusBadge state={state} />
  ) : (
    <span className="text-muted-foreground">No items due</span>
  );
}

const helper = columnHelper<Aircraft>();

function aircraftColumns(due: DueBadgeState) {
  return helper.columns([
    helper.accessor("serial_number", {
      header: "Serial",
      cell: (info) => (
        <Link href={`/aircraft/${info.row.original.id}`} className="font-medium hover:underline">
          {info.getValue()}
        </Link>
      ),
    }),
    helper.accessor("registration", { header: "Registration", cell: (info) => info.getValue() || "—" }),
    helper.accessor("model_name", { header: "Model" }),
    helper.accessor("status", {
      header: "Status",
      cell: (info) => <AircraftStatusBadge status={info.getValue()} />,
    }),
    helper.accessor("flight_hours", { header: "Hours", cell: (info) => formatHours(info.getValue()) }),
    helper.accessor("cycles", { header: "Cycles", cell: (info) => formatNumber(info.getValue(), 0) }),
    helper.display({
      id: "maintenance",
      header: "Maintenance",
      cell: (info) => <MaintenanceCell aircraft={info.row.original} due={due} />,
    }),
  ]);
}

/** Fleet list with URL filters; uses `useSearchParams`, so render it inside Suspense. */
export function AircraftList() {
  const { params, page, setParams, setPage } = useUrlState();
  const status = params.get("status");
  const model = toId(params.get("model"));
  const filters = { page, status: isAircraftStatus(status) ? status : undefined, model };

  const aircraft = useAircraftList(filters);
  const models = useAircraftModels();
  const ids = useMemo(() => aircraft.data?.results.map((a) => a.id) ?? [], [aircraft.data]);
  const due = useDueForAircraft(ids);

  const columns = useMemo(
    () =>
      aircraftColumns({
        loading: due.isPending && ids.length > 0,
        byAircraft: due.data ? dueStateByAircraft(due.data) : new Map(),
      }),
    [due.isPending, due.data, ids.length],
  );

  const modelOptions: SelectOption[] = [
    { value: null, label: "All models" },
    ...(models.data ?? []).map((m) => ({ value: String(m.id), label: `${m.manufacturer} ${m.name}` })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <OptionSelect
          aria-label="Status"
          value={filters.status ?? null}
          onValueChange={(value) => setParams({ status: value })}
          options={STATUS_OPTIONS}
        />
        <OptionSelect
          aria-label="Model"
          value={model ? String(model) : null}
          onValueChange={(value) => setParams({ model: value })}
          options={modelOptions}
          disabled={models.isPending}
        />
      </div>
      <DataTable
        label="Aircraft"
        columns={columns}
        data={aircraft.data?.results}
        isPending={aircraft.isPending}
        error={aircraft.error}
        onRetry={() => aircraft.refetch()}
        emptyMessage={
          filters.status || filters.model
            ? "No aircraft match these filters."
            : "No aircraft yet. Add them in Django admin."
        }
        pagination={
          aircraft.data && { page, count: aircraft.data.count, onPageChange: setPage }
        }
      />
    </div>
  );
}
