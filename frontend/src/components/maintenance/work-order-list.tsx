"use client";

import Link from "next/link";
import { useState } from "react";

import { columnHelper, DataTable } from "@/components/data-table";
import { CreateWorkOrderDialog } from "@/components/maintenance/create-work-order-dialog";
import {
  itemProgress,
  WORK_ORDER_STATUS_LABELS,
  WorkOrderStatusBadge,
} from "@/components/maintenance/work-order-status";
import { OptionSelect, type SelectOption } from "@/components/option-select";
import { Button } from "@/components/ui/button";
import { useAllAircraft } from "@/hooks/use-fleet";
import { useWorkOrders } from "@/hooks/use-maintenance";
import { useUrlState } from "@/hooks/use-url-state";
import type { WorkOrder, WorkOrderStatus } from "@/lib/api/maintenance";
import { formatDateTime } from "@/lib/format";

const STATUS_OPTIONS: SelectOption[] = [
  { value: null, label: "All statuses" },
  ...Object.entries(WORK_ORDER_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

const isStatus = (value: string | null): value is WorkOrderStatus =>
  value !== null && value in WORK_ORDER_STATUS_LABELS;
const toId = (value: string | null) => (value && /^\d+$/.test(value) ? Number(value) : undefined);

const helper = columnHelper<WorkOrder>();

const columns = helper.columns([
  helper.accessor("id", {
    header: "Work order",
    cell: (info) => (
      <Link href={`/work-orders/${info.getValue()}`} className="font-medium hover:underline">
        WO-{info.getValue()}
      </Link>
    ),
  }),
  helper.accessor("title", { header: "Title" }),
  helper.accessor("aircraft_serial", {
    header: "Aircraft",
    cell: (info) => (
      <Link href={`/aircraft/${info.row.original.aircraft}`} className="hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
  helper.accessor("status", {
    header: "Status",
    cell: (info) => <WorkOrderStatusBadge status={info.getValue()} />,
  }),
  helper.accessor("items", { header: "Progress", cell: (info) => itemProgress(info.getValue()) }),
  helper.accessor("opened_at", { header: "Opened", cell: (info) => formatDateTime(info.getValue()) }),
  helper.accessor("closed_at", {
    header: "Closed",
    cell: (info) => {
      const closed = info.getValue();
      return closed ? formatDateTime(closed) : <span className="text-muted-foreground">—</span>;
    },
  }),
]);

/** Work orders with URL filters; uses `useSearchParams`, so render it inside Suspense. */
export function WorkOrderList() {
  const { params, page, setParams, setPage } = useUrlState();
  const status = params.get("status");
  const aircraft = toId(params.get("aircraft"));
  const filters = { page, status: isStatus(status) ? status : undefined, aircraft };

  const workOrders = useWorkOrders(filters);
  const fleet = useAllAircraft();
  const [creating, setCreating] = useState(false);

  const aircraftOptions: SelectOption[] = [
    { value: null, label: "All aircraft" },
    ...(fleet.data ?? []).map((a) => ({ value: String(a.id), label: a.serial_number })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <OptionSelect
            aria-label="Status"
            value={filters.status ?? null}
            onValueChange={(value) => setParams({ status: value })}
            options={STATUS_OPTIONS}
          />
          <OptionSelect
            aria-label="Aircraft"
            value={aircraft ? String(aircraft) : null}
            onValueChange={(value) => setParams({ aircraft: value })}
            options={aircraftOptions}
            disabled={fleet.isPending}
          />
        </div>
        <Button onClick={() => setCreating(true)}>Create work order</Button>
      </div>
      <DataTable
        label="Work orders"
        columns={columns}
        data={workOrders.data?.results}
        isPending={workOrders.isPending}
        error={workOrders.error}
        onRetry={() => workOrders.refetch()}
        emptyMessage={
          filters.status || filters.aircraft
            ? "No work orders match these filters."
            : "No work orders yet."
        }
        pagination={
          workOrders.data && { page, count: workOrders.data.count, onPageChange: setPage }
        }
      />
      <CreateWorkOrderDialog open={creating} onOpenChange={setCreating} aircraftId={aircraft} />
    </div>
  );
}
