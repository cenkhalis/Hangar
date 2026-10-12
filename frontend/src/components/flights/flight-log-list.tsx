"use client";

import Link from "next/link";

import { columnHelper, DataTable } from "@/components/data-table";
import {
  FlightLogStatusBadge,
  LOG_STATUS_LABELS,
  REJECTION_LABELS,
  rejectionLabel,
} from "@/components/flights/flight-log-status";
import { OptionSelect, type SelectOption } from "@/components/option-select";
import { useFlightLogs } from "@/hooks/use-flights";
import { useUrlState } from "@/hooks/use-url-state";
import type { FlightLog, FlightLogStatus, RejectionCode } from "@/lib/api/flights";
import { formatDateTime } from "@/lib/format";

const STATUS_OPTIONS: SelectOption[] = [
  { value: null, label: "All statuses" },
  ...Object.entries(LOG_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];

const REJECTION_OPTIONS: SelectOption[] = [
  { value: null, label: "All reasons" },
  ...Object.entries(REJECTION_LABELS).map(([value, label]) => ({ value, label })),
];

const isStatus = (value: string | null): value is FlightLogStatus =>
  value !== null && value in LOG_STATUS_LABELS;
const isRejectionCode = (value: string | null): value is RejectionCode =>
  value !== null && value in REJECTION_LABELS;

const helper = columnHelper<FlightLog>();

const columns = helper.columns([
  helper.accessor("received_at", {
    header: "Received",
    cell: (info) => formatDateTime(info.getValue()),
  }),
  helper.accessor("source_filename", {
    header: "File",
    cell: (info) => (
      <Link href={`/flight-logs/${info.row.original.id}`} className="font-medium hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
  helper.accessor("status", {
    header: "Status",
    cell: (info) => <FlightLogStatusBadge status={info.getValue()} />,
  }),
  helper.accessor("rejection_code", {
    header: "Reason",
    cell: (info) => rejectionLabel(info.getValue()) ?? <span className="text-muted-foreground">—</span>,
  }),
  helper.accessor("duplicate_count", { header: "Duplicates" }),
  helper.accessor("flight", {
    header: "Flight",
    cell: (info) => {
      const flight = info.getValue();
      return flight === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <Link href={`/flights/${flight}`} className="hover:underline">
          View flight
        </Link>
      );
    },
  }),
]);

/** Received flight logs with URL filters; uses `useSearchParams`, so render it in Suspense. */
export function FlightLogList() {
  const { params, page, setParams, setPage } = useUrlState();
  const status = params.get("status");
  const reason = params.get("rejection_code");
  const filters = {
    page,
    status: isStatus(status) ? status : undefined,
    rejection_code: isRejectionCode(reason) ? reason : undefined,
  };
  const logs = useFlightLogs(filters);

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
          aria-label="Rejection reason"
          value={filters.rejection_code ?? null}
          onValueChange={(value) => setParams({ rejection_code: value })}
          options={REJECTION_OPTIONS}
        />
      </div>
      <DataTable
        label="Flight logs"
        columns={columns}
        data={logs.data?.results}
        isPending={logs.isPending}
        error={logs.error}
        onRetry={() => logs.refetch()}
        emptyMessage={
          filters.status || filters.rejection_code
            ? "No flight logs match these filters."
            : "No flight logs received yet."
        }
        pagination={logs.data && { page, count: logs.data.count, onPageChange: setPage }}
      />
    </div>
  );
}
