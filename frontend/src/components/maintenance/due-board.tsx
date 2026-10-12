"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { columnHelper, DataTable } from "@/components/data-table";
import { CreateWorkOrderDialog } from "@/components/maintenance/create-work-order-dialog";
import { OptionSelect, type SelectOption } from "@/components/option-select";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { useAllAircraft } from "@/hooks/use-fleet";
import { useDueList } from "@/hooks/use-maintenance";
import { useUrlState } from "@/hooks/use-url-state";
import type { DueItem, DueState } from "@/lib/api/maintenance";
import { formatRemaining, formatUsage } from "@/lib/format";
import { formatDuePoint } from "@/lib/maintenance";

/** `null` is the API default: due soon and overdue. */
const STATE_OPTIONS: SelectOption[] = [
  { value: null, label: "Due soon & overdue" },
  { value: "overdue", label: "Overdue" },
  { value: "due_soon", label: "Due soon" },
  { value: "not_started", label: "Not started" },
  { value: "ok", label: "OK" },
];

const STATES = new Set(STATE_OPTIONS.flatMap((o) => (o.value ? [o.value] : [])));
const isState = (value: string | null): value is DueState => value !== null && STATES.has(value);
const toId = (value: string | null) => (value && /^\d+$/.test(value) ? Number(value) : undefined);

type CreateRequest = { aircraftId: number; taskIds: number[] };

const helper = columnHelper<DueItem>();

function dueColumns(onCreate: (request: CreateRequest) => void) {
  return helper.columns([
    helper.accessor("state", {
      header: "State",
      cell: (info) => <StatusBadge state={info.getValue()} />,
    }),
    helper.accessor("aircraft_serial", {
      header: "Aircraft",
      cell: (info) => (
        <Link
          href={`/aircraft/${info.row.original.aircraft}?tab=maintenance`}
          className="font-medium hover:underline"
        >
          {info.getValue()}
        </Link>
      ),
    }),
    helper.display({
      id: "task",
      header: "Task",
      cell: ({ row }) => (
        <span>
          <span className="font-medium">{row.original.code}</span> {row.original.title}
        </span>
      ),
    }),
    helper.accessor("intervals", {
      header: "Remaining",
      cell: (info) => (
        <ul>
          {info.getValue().map((interval) => {
            const duePoint = formatDuePoint(interval);
            return (
              <li key={interval.interval_type}>
                {interval.remaining === null
                  ? `Every ${formatUsage(interval.interval_type, interval.interval)} · not started`
                  : formatRemaining(interval.interval_type, interval.remaining)}
                {duePoint && <span className="text-muted-foreground"> · due {duePoint}</span>}
              </li>
            );
          })}
        </ul>
      ),
    }),
    helper.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCreate({ aircraftId: row.original.aircraft, taskIds: [row.original.task] })}
          aria-label={`Create work order for ${row.original.code} on ${row.original.aircraft_serial}`}
        >
          Create work order
        </Button>
      ),
    }),
  ]);
}

/**
 * Fleet-wide due list, most severe first (the API's order). Uses `useSearchParams`, so render it
 * inside Suspense.
 */
export function DueBoard() {
  const { params, setParams } = useUrlState();
  const state = params.get("state");
  const aircraft = toId(params.get("aircraft"));
  const filters = {
    state: isState(state) ? [state] : undefined,
    aircraft: aircraft ? [aircraft] : undefined,
  };

  const due = useDueList(filters);
  const fleet = useAllAircraft();
  const [creating, setCreating] = useState<CreateRequest | null>(null);
  const columns = useMemo(() => dueColumns(setCreating), [setCreating]);

  const aircraftOptions: SelectOption[] = [
    { value: null, label: "All aircraft" },
    ...(fleet.data ?? [])
      .filter((a) => a.status !== "retired")
      .map((a) => ({ value: String(a.id), label: a.serial_number })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <OptionSelect
          aria-label="State"
          value={isState(state) ? state : null}
          onValueChange={(value) => setParams({ state: value })}
          options={STATE_OPTIONS}
        />
        <OptionSelect
          aria-label="Aircraft"
          value={aircraft ? String(aircraft) : null}
          onValueChange={(value) => setParams({ aircraft: value })}
          options={aircraftOptions}
          disabled={fleet.isPending}
        />
      </div>
      <DataTable
        label="Due tasks"
        columns={columns}
        data={due.data}
        isPending={due.isPending}
        error={due.error}
        onRetry={() => due.refetch()}
        emptyMessage={
          filters.state || filters.aircraft
            ? "No tasks match these filters."
            : "Nothing is due soon or overdue."
        }
      />
      <CreateWorkOrderDialog
        open={creating !== null}
        onOpenChange={(open) => !open && setCreating(null)}
        aircraftId={creating?.aircraftId}
        taskIds={creating?.taskIds}
      />
    </div>
  );
}
