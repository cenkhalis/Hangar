"use client";

import {
  type ColumnDef,
  createColumnHelper,
  type RowData,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty-state";
import { Pagination, type PaginationProps } from "@/components/pagination";
import { QueryError } from "@/components/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Rendering only: filtering, sorting and paging happen on the server and live in the URL. */
export const dataTableFeatures = tableFeatures({});

export type DataTableFeatures = typeof dataTableFeatures;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- columns mix value types
export type DataTableColumns<T extends RowData> = ColumnDef<DataTableFeatures, T, any>[];

export const columnHelper = <T extends RowData>() =>
  createColumnHelper<DataTableFeatures, T>();

const SKELETON_ROWS = 5;

type DataTableProps<T extends RowData> = {
  /**
   * Keep this stable (module scope, or memoized on values that rarely change): new column
   * definitions remount every cell, so a click landing during that render is lost. Pass
   * fast-changing data to cells through context instead.
   */
  columns: DataTableColumns<T>;
  /** Rows of the current page; `undefined` while the first load is pending. */
  data: T[] | undefined;
  /** Accessible name for the table. */
  label: string;
  isPending?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyMessage?: ReactNode;
  pagination?: PaginationProps;
};

const EMPTY_ROWS: never[] = [];

export function DataTable<T extends RowData>({
  columns,
  data,
  label,
  isPending = false,
  error,
  onRetry,
  emptyMessage = "Nothing to show.",
  pagination,
}: DataTableProps<T>) {
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data: data ?? (EMPTY_ROWS as T[]),
  });

  if (error) return <QueryError error={error} onRetry={onRetry} />;

  const rows = table.getRowModel().rows;
  const columnCount = table.getAllLeafColumns().length;

  let body: ReactNode;
  if (isPending) {
    body = Array.from({ length: SKELETON_ROWS }, (_, i) => (
      <TableRow key={i}>
        {Array.from({ length: columnCount }, (_, j) => (
          <TableCell key={j}>
            <Skeleton className="h-4 w-full" />
          </TableCell>
        ))}
      </TableRow>
    ));
  } else if (rows.length === 0) {
    body = (
      <TableRow>
        <TableCell colSpan={columnCount}>
          <EmptyState>{emptyMessage}</EmptyState>
        </TableCell>
      </TableRow>
    );
  } else {
    body = rows.map((row) => (
      <TableRow key={row.id}>
        {row.getAllCells().map((cell) => (
          <TableCell key={cell.id}>
            <table.FlexRender cell={cell} />
          </TableCell>
        ))}
      </TableRow>
    ));
  }

  return (
    <div className="flex flex-col gap-3">
      <Table aria-label={label} aria-busy={isPending || undefined}>
        <TableHeader>
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>{body}</TableBody>
      </Table>
      {pagination && !isPending && pagination.count > 0 && <Pagination {...pagination} />}
    </div>
  );
}
