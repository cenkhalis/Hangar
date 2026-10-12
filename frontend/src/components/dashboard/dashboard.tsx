"use client";

import { ClipboardPlus, ScrollText, Wrench } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState } from "@/components/empty-state";
import { CreateWorkOrderDialog } from "@/components/maintenance/create-work-order-dialog";
import { QueryError } from "@/components/query-error";
import { StatusBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAircraftCount, useFlightLogCount, useWorkOrderCount } from "@/hooks/use-dashboard";
import { useDueList } from "@/hooks/use-maintenance";
import type { AircraftStatus } from "@/lib/api/fleet";
import { formatRemaining } from "@/lib/format";
import { summarizeDue } from "@/lib/maintenance";
import { cn } from "@/lib/utils";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const STATUSES: { status: AircraftStatus; label: string }[] = [
  { status: "active", label: "Active" },
  { status: "grounded", label: "Grounded" },
  { status: "retired", label: "Retired" },
];

function FleetSection() {
  const active = useAircraftCount("active");
  const grounded = useAircraftCount("grounded");
  const retired = useAircraftCount("retired");
  const counts = { active, grounded, retired };
  const all = [active, grounded, retired];

  // The three statuses are exhaustive, so the total needs no request of its own.
  const total = all.every((q) => q.data !== undefined)
    ? all.reduce((sum, q) => sum + q.data!, 0)
    : undefined;

  return (
    <Section title="Fleet">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total aircraft"
          value={total}
          isPending={all.some((q) => q.isPending)}
          isError={all.some((q) => q.isError)}
          onRetry={() => all.forEach((q) => q.isError && q.refetch())}
          href="/aircraft"
          linkLabel="All aircraft"
        />
        {STATUSES.map(({ status, label }) => {
          const query = counts[status];
          return (
            <KpiCard
              key={status}
              label={label}
              value={query.data}
              isPending={query.isPending}
              isError={query.isError}
              onRetry={() => query.refetch()}
              href={`/aircraft?status=${status}`}
              linkLabel={`${label} aircraft`}
            />
          );
        })}
      </div>
    </Section>
  );
}

function MaintenanceSection() {
  // The due list is the actionable set itself (due soon and overdue); there is no count endpoint.
  const due = useDueList({});
  const summary = due.data ? summarizeDue(due.data) : undefined;
  const common = {
    isPending: due.isPending,
    isError: due.isError,
    onRetry: () => due.refetch(),
  };

  return (
    <Section title="Maintenance alerts">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_2fr]">
        <KpiCard
          label="Overdue tasks"
          value={summary?.overdue}
          {...common}
          href="/maintenance?state=overdue"
          linkLabel="Overdue tasks"
          tone="critical"
        />
        <KpiCard
          label="Due soon"
          value={summary?.dueSoon}
          {...common}
          href="/maintenance?state=due_soon"
          linkLabel="Due-soon tasks"
          tone="warning"
        />
        <Card size="sm">
          <CardHeader>
            <CardTitle>Most urgent</CardTitle>
          </CardHeader>
          <CardContent>
            {due.isPending ? (
              <Skeleton className="h-24 w-full" />
            ) : due.isError ? (
              <QueryError error={due.error} onRetry={() => due.refetch()} />
            ) : summary!.urgent.length === 0 ? (
              <EmptyState className="py-4">Nothing is due soon or overdue.</EmptyState>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {summary!.urgent.map((item) => {
                  const interval = item.intervals.find((i) => i.state === item.state);
                  return (
                    <li
                      key={`${item.aircraft}-${item.task}`}
                      className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
                    >
                      <StatusBadge state={item.state} />
                      <Link
                        href={`/aircraft/${item.aircraft}?tab=maintenance`}
                        className="font-medium hover:underline"
                      >
                        {item.aircraft_serial}
                      </Link>
                      <span className="min-w-40 flex-1 truncate">
                        {item.code} {item.title}
                      </span>
                      {interval?.remaining != null && (
                        <span className="text-muted-foreground">
                          {formatRemaining(interval.interval_type, interval.remaining)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}

function OperationsSection() {
  const openOrders = useWorkOrderCount("open");
  const rejectedLogs = useFlightLogCount("rejected");

  return (
    <Section title="Active operations">
      <div className="grid gap-4 sm:grid-cols-2">
        <KpiCard
          label="Open work orders"
          value={openOrders.data}
          isPending={openOrders.isPending}
          isError={openOrders.isError}
          onRetry={() => openOrders.refetch()}
          href="/work-orders?status=open"
          linkLabel="Open work orders"
        />
        <KpiCard
          label="Rejected flight logs"
          value={rejectedLogs.data}
          isPending={rejectedLogs.isPending}
          isError={rejectedLogs.isError}
          onRetry={() => rejectedLogs.refetch()}
          href="/flight-logs?status=rejected"
          linkLabel="Review rejected logs"
          tone="warning"
        />
      </div>
    </Section>
  );
}

function QuickActions() {
  const [creating, setCreating] = useState(false);
  // cn() resolves the variant's border override, as the Button component does.
  const link = cn(buttonVariants({ variant: "outline" }));
  return (
    <Section title="Quick actions">
      <div className="flex flex-wrap gap-2">
        <Link href="/maintenance" className={link}>
          <Wrench aria-hidden /> Due board
        </Link>
        <Button variant="outline" onClick={() => setCreating(true)}>
          <ClipboardPlus aria-hidden /> New work order
        </Button>
        <Link href="/flight-logs?status=rejected" className={link}>
          <ScrollText aria-hidden /> Ingest review
        </Link>
      </div>
      <CreateWorkOrderDialog open={creating} onOpenChange={setCreating} />
    </Section>
  );
}

/** Operational overview: every number links to the list behind it. */
export function Dashboard() {
  return (
    <div className="flex flex-col gap-8">
      <FleetSection />
      <MaintenanceSection />
      <OperationsSection />
      <QuickActions />
    </div>
  );
}
