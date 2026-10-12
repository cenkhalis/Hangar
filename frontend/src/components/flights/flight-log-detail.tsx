"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { FlightLogStatusBadge, rejectionLabel } from "@/components/flights/flight-log-status";
import { ReprocessButton } from "@/components/flights/reprocess-button";
import { PageHeader } from "@/components/layout/page-header";
import { QueryError } from "@/components/query-error";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFlightLog } from "@/hooks/use-flights";
import { formatDateTime } from "@/lib/format";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all">{children}</dd>
    </>
  );
}

export function FlightLogDetail({ id }: { id: number }) {
  const query = useFlightLog(id);

  if (query.isPending) return <Skeleton className="h-96 w-full" />;
  if (query.isError) return <QueryError error={query.error} onRetry={() => query.refetch()} />;

  const log = query.data;
  return (
    <>
      <PageHeader
        title={log.source_filename}
        description={<FlightLogStatusBadge status={log.status} />}
        actions={log.status === "rejected" && <ReprocessButton log={log} />}
      />
      {log.status === "rejected" && (
        <Alert variant="destructive">
          <AlertTitle>{rejectionLabel(log.rejection_code)}</AlertTitle>
          <AlertDescription>
            {log.rejection_detail} Fix the cause (for example, register the aircraft in Django
            admin), then reprocess the log.
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-6">
            <Row label="Flight">
              {log.flight === null ? (
                "—"
              ) : (
                <Link href={`/flights/${log.flight}`} className="hover:underline">
                  View flight
                </Link>
              )}
            </Row>
            <Row label="Received">{formatDateTime(log.received_at)}</Row>
            <Row label="Processed">{log.processed_at ? formatDateTime(log.processed_at) : "—"}</Row>
            <Row label="Duplicates">
              {log.duplicate_count}
              {log.duplicate_count > 0 && ` (last seen ${formatDateTime(log.last_seen_at)})`}
            </Row>
            <Row label="Format">
              {log.source_format.toUpperCase()}, schema v{log.schema_version}
            </Row>
            <Row label="Log ID">
              <code className="font-mono text-xs">{log.log_id}</code>
            </Row>
            <Row label="Stream message">{log.stream_message_id || "—"}</Row>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Payload</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
            {JSON.stringify(log.payload, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </>
  );
}
