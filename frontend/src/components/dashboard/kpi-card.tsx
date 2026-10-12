import { ArrowRight, CircleAlert, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** `critical` and `warning` apply only when the value is above zero. */
export type KpiTone = "neutral" | "warning" | "critical";

const TONES = {
  warning: {
    card: "ring-amber-600/40 bg-amber-50 dark:bg-amber-950/40",
    value: "text-amber-900 dark:text-amber-300",
    icon: TriangleAlert,
    label: "Needs attention",
  },
  critical: {
    card: "ring-red-600/40 bg-red-50 dark:bg-red-950/40",
    value: "text-red-800 dark:text-red-300",
    icon: CircleAlert,
    label: "Action required",
  },
} as const;

type KpiCardProps = {
  label: string;
  value: number | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry?: () => void;
  href: string;
  linkLabel: string;
  tone?: KpiTone;
};

/** One headline number with a link to the list behind it. */
export function KpiCard({
  label,
  value,
  isPending,
  isError,
  onRetry,
  href,
  linkLabel,
  tone = "neutral",
}: KpiCardProps) {
  const alert = tone !== "neutral" && value !== undefined && value > 0 ? TONES[tone] : null;
  const AlertIcon = alert?.icon;

  return (
    <Card size="sm" className={cn("justify-between", alert?.card)} data-tone={alert ? tone : undefined}>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          {AlertIcon && <AlertIcon aria-hidden className={cn("size-3.5", alert.value)} />}
          {label}
          {alert && <span className="sr-only">({alert.label})</span>}
        </CardDescription>
        <CardTitle
          className={cn("text-3xl tabular-nums group-data-[size=sm]/card:text-3xl", alert?.value)}
        >
          {isPending ? (
            <Skeleton className="h-9 w-16" />
          ) : isError ? (
            <span className="flex items-center gap-2 text-base font-normal text-muted-foreground">
              Unavailable
              {onRetry && (
                <Button variant="outline" size="xs" onClick={onRetry}>
                  Retry
                </Button>
              )}
            </span>
          ) : (
            formatNumber(value ?? 0, 0)
          )}
        </CardTitle>
      </CardHeader>
      <CardFooter>
        <Link
          href={href}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {linkLabel} <ArrowRight aria-hidden className="size-3" />
        </Link>
      </CardFooter>
    </Card>
  );
}
