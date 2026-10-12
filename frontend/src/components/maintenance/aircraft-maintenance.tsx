"use client";

import { useMemo, useState } from "react";

import { columnHelper, DataTable } from "@/components/data-table";
import { HistoricalCompletionDialog } from "@/components/maintenance/historical-completion-dialog";
import { VoidCompletionDialog } from "@/components/maintenance/void-completion-dialog";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCompletions, useMaintenanceStatus } from "@/hooks/use-maintenance";
import { useUrlState } from "@/hooks/use-url-state";
import type { Aircraft } from "@/lib/api/fleet";
import type { IntervalStatus, TaskCompletion, TaskStatus } from "@/lib/api/maintenance";
import { formatDate, formatDateTime, formatRemaining, formatUsage } from "@/lib/format";
import { formatDuePoint } from "@/lib/maintenance";

function IntervalLine({ interval }: { interval: IntervalStatus }) {
  const every = `Every ${formatUsage(interval.interval_type, interval.interval)}`;
  if (interval.remaining === null) {
    return (
      <li>
        {every} · <span className="text-muted-foreground">not started (no in-service date)</span>
      </li>
    );
  }
  const duePoint = formatDuePoint(interval);
  return (
    <li>
      {every} · {formatRemaining(interval.interval_type, interval.remaining)}
      {duePoint && <span className="text-muted-foreground"> · due {duePoint}</span>}
    </li>
  );
}

const taskHelper = columnHelper<TaskStatus>();

const taskColumns = taskHelper.columns([
  taskHelper.display({
    id: "task",
    header: "Task",
    cell: ({ row }) => (
      <span>
        <span className="font-medium">{row.original.code}</span> {row.original.title}
      </span>
    ),
  }),
  taskHelper.accessor("state", {
    header: "State",
    cell: (info) => <StatusBadge state={info.getValue()} />,
  }),
  taskHelper.accessor("intervals", {
    header: "Intervals",
    cell: (info) => (
      <ul>
        {info.getValue().map((interval) => (
          <IntervalLine key={interval.interval_type} interval={interval} />
        ))}
      </ul>
    ),
  }),
  taskHelper.accessor("last_completion", {
    header: "Last sign-off",
    cell: (info) => {
      const last = info.getValue();
      if (!last) return <span className="text-muted-foreground">Never</span>;
      return (
        <span>
          {formatDate(last.performed_at.slice(0, 10))} · {last.performed_by}
          {last.kind === "historical" && <span className="text-muted-foreground"> (historical)</span>}
        </span>
      );
    },
  }),
]);

const completionHelper = columnHelper<TaskCompletion>();

function completionColumns(onVoid: (completion: TaskCompletion) => void) {
  return completionHelper.columns([
    completionHelper.accessor("performed_at", {
      header: "Performed",
      cell: (info) => formatDateTime(info.getValue()),
    }),
    completionHelper.display({
      id: "task",
      header: "Task",
      cell: ({ row }) => `${row.original.task_code} ${row.original.task_title}`,
    }),
    completionHelper.accessor("work_order", {
      header: "Source",
      cell: (info) => {
        const workOrder = info.getValue();
        return workOrder === null ? "Historical" : `WO-${workOrder}`;
      },
    }),
    completionHelper.accessor("performed_by", { header: "By" }),
    completionHelper.display({
      id: "status",
      header: "Status",
      cell: ({ row }) =>
        row.original.voided ? (
          <span className="flex flex-col gap-0.5">
            <Badge variant="outline">Voided</Badge>
            <span className="text-xs text-muted-foreground">{row.original.void_reason}</span>
          </span>
        ) : (
          <Badge variant="secondary">Valid</Badge>
        ),
    }),
    completionHelper.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) =>
        !row.original.voided && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onVoid(row.original)}
            aria-label={`Void ${row.original.task_code} sign-off`}
          >
            Void
          </Button>
        ),
    }),
  ]);
}

function SignOffHistory({ aircraftId }: { aircraftId: number }) {
  const { page, setPage } = useUrlState();
  const completions = useCompletions({ page, aircraft: aircraftId });
  const [voiding, setVoiding] = useState<TaskCompletion | null>(null);
  const columns = useMemo(() => completionColumns(setVoiding), []);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">Sign-off history</h2>
      <DataTable
        label="Sign-off history"
        columns={columns}
        data={completions.data?.results}
        isPending={completions.isPending}
        error={completions.error}
        onRetry={() => completions.refetch()}
        emptyMessage="No sign-offs recorded."
        pagination={
          completions.data && { page, count: completions.data.count, onPageChange: setPage }
        }
      />
      <VoidCompletionDialog completion={voiding} onClose={() => setVoiding(null)} />
    </section>
  );
}

export function AircraftMaintenance({ aircraft }: { aircraft: Aircraft }) {
  const report = useMaintenanceStatus(aircraft.id);
  const untracked = report.data?.state === "untracked" && report.data.tasks.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            Task status {report.data && <StatusBadge state={report.data.state} />}
          </h2>
          {report.data && (
            <HistoricalCompletionDialog aircraftId={aircraft.id} tasks={report.data.tasks} />
          )}
        </div>
        <DataTable
          label="Task status"
          columns={taskColumns}
          data={report.data?.tasks}
          isPending={report.isPending}
          error={report.error}
          onRetry={() => report.refetch()}
          emptyMessage={
            untracked
              ? `No maintenance program for ${aircraft.model_name}. Set one up in Django admin.`
              : "The maintenance program has no active tasks."
          }
        />
      </section>
      <SignOffHistory aircraftId={aircraft.id} />
    </div>
  );
}
