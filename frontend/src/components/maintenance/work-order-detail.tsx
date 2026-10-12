"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { columnHelper, DataTable } from "@/components/data-table";
import { CancelWorkOrderDialog } from "@/components/maintenance/cancel-work-order-dialog";
import { SignOffDialog } from "@/components/maintenance/sign-off-dialog";
import {
  itemProgress,
  WorkOrderItemStatusBadge,
  WorkOrderStatusBadge,
} from "@/components/maintenance/work-order-status";
import { PageHeader } from "@/components/layout/page-header";
import { QueryError } from "@/components/query-error";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompletion, useWorkOrder } from "@/hooks/use-maintenance";
import type { WorkOrderItem } from "@/lib/api/maintenance";
import { formatDateTime } from "@/lib/format";

/** Who signed off an item; fetched per cell so the table's columns never depend on it. */
function CompletionCell({ id }: { id: number }) {
  const completion = useCompletion(id);
  if (completion.isPending) return <Skeleton className="h-4 w-40" />;
  if (completion.isError) return <span className="text-muted-foreground">Unavailable</span>;
  const { performed_at, performed_by, voided } = completion.data;
  return (
    <span className="flex flex-wrap items-center gap-2">
      {formatDateTime(performed_at)} · {performed_by}
      {voided && <Badge variant="outline">Voided</Badge>}
    </span>
  );
}

const helper = columnHelper<WorkOrderItem>();

/**
 * Columns change only when the order opens or closes: new column definitions remount every cell,
 * which would drop a click landing while data loads.
 */
function itemColumns({
  canSignOff,
  onSignOff,
}: {
  canSignOff: boolean;
  onSignOff: (item: WorkOrderItem) => void;
}) {
  return helper.columns([
    helper.display({
      id: "task",
      header: "Task",
      cell: ({ row }) => (
        <span>
          <span className="font-medium">{row.original.task_code}</span> {row.original.task_title}
        </span>
      ),
    }),
    helper.accessor("status", {
      header: "Status",
      cell: (info) => <WorkOrderItemStatusBadge status={info.getValue()} />,
    }),
    helper.accessor("completion", {
      header: "Sign-off",
      cell: (info) => {
        const id = info.getValue();
        return id === null ? <span className="text-muted-foreground">—</span> : <CompletionCell id={id} />;
      },
    }),
    helper.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) =>
        canSignOff &&
        row.original.status === "pending" && (
          <Button
            size="sm"
            onClick={() => onSignOff(row.original)}
            aria-label={`Sign off ${row.original.task_code}`}
          >
            Sign off
          </Button>
        ),
    }),
  ]);
}

export function WorkOrderDetail({ id }: { id: number }) {
  const query = useWorkOrder(id);
  const [signingOff, setSigningOff] = useState<WorkOrderItem | null>(null);
  const isOpen = query.data?.status === "open";
  const columns = useMemo(
    () => itemColumns({ canSignOff: isOpen, onSignOff: setSigningOff }),
    [isOpen, setSigningOff],
  );

  if (query.isPending) return <Skeleton className="h-96 w-full" />;
  if (query.isError) return <QueryError error={query.error} onRetry={() => query.refetch()} />;

  const workOrder = query.data;
  return (
    <>
      <PageHeader
        title={`WO-${workOrder.id} ${workOrder.title}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/aircraft/${workOrder.aircraft}`} className="hover:underline">
              {workOrder.aircraft_serial}
            </Link>
            <WorkOrderStatusBadge status={workOrder.status} />
            <span>Opened {formatDateTime(workOrder.opened_at)}</span>
            {workOrder.closed_at && <span>· closed {formatDateTime(workOrder.closed_at)}</span>}
          </span>
        }
        actions={isOpen && <CancelWorkOrderDialog workOrder={workOrder} />}
      />
      {workOrder.status === "cancelled" && (
        <Alert>
          <AlertTitle>Cancelled</AlertTitle>
          <AlertDescription>{workOrder.cancel_reason}</AlertDescription>
        </Alert>
      )}
      {workOrder.notes && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-line text-sm">{workOrder.notes}</CardContent>
        </Card>
      )}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">
          Items <span className="font-normal text-muted-foreground">· {itemProgress(workOrder.items)}</span>
        </h2>
        <DataTable label="Work order items" columns={columns} data={workOrder.items} />
      </section>
      <SignOffDialog workOrder={workOrder} item={signingOff} onClose={() => setSigningOff(null)} />
    </>
  );
}
