import {
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  Clock,
  type LucideIcon,
} from "lucide-react";

import type { Schemas } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export type StatusState = Schemas["LifeStateEnum"] | Schemas["DueStateEnum"];

type StateStyle = { label: string; icon: LucideIcon; className: string };

const STYLES: Record<StatusState, StateStyle> = {
  ok: {
    label: "OK",
    icon: CircleCheck,
    className: "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300",
  },
  due_soon: {
    label: "Due soon",
    icon: Clock,
    className: "bg-amber-50 text-amber-900 ring-amber-600/30 dark:bg-amber-950 dark:text-amber-300",
  },
  overdue: {
    label: "Overdue",
    icon: CircleX,
    className: "bg-red-50 text-red-800 ring-red-600/20 dark:bg-red-950 dark:text-red-300",
  },
  expired: {
    label: "Expired",
    icon: CircleX,
    className: "bg-red-50 text-red-800 ring-red-600/20 dark:bg-red-950 dark:text-red-300",
  },
  not_started: {
    label: "Not started",
    icon: CircleDashed,
    className: "bg-muted text-muted-foreground ring-border",
  },
  untracked: {
    label: "Untracked",
    icon: CircleMinus,
    className: "bg-muted text-muted-foreground ring-border",
  },
};

export function stateLabel(state: StatusState): string {
  return STYLES[state].label;
}

/** State indicator with icon and text, so meaning never depends on colour alone. */
export function StatusBadge({ state, className }: { state: StatusState; className?: string }) {
  const { label, icon: Icon, className: stateClass } = STYLES[state];
  return (
    <span
      data-state={state}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        stateClass,
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {label}
    </span>
  );
}
