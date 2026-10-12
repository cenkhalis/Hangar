import type {
  DueItem,
  DueState,
  IntervalStatus,
  TaskStatus,
  WorkOrder,
} from "@/lib/api/maintenance";
import { formatDate, formatHours, formatNumber } from "@/lib/format";

const SEVERITY: Record<DueState, number> = {
  untracked: 0,
  not_started: 1,
  ok: 2,
  due_soon: 3,
  overdue: 4,
};

/** The most severe state, mirroring `worst_state` in the backend; undefined when empty. */
export function worstDueState(states: Iterable<DueState>): DueState | undefined {
  let worst: DueState | undefined;
  for (const state of states) {
    if (worst === undefined || SEVERITY[state] > SEVERITY[worst]) worst = state;
  }
  return worst;
}

/** Worst due state per aircraft; aircraft without due items are absent. */
export function dueStateByAircraft(items: DueItem[]): Map<number, DueState> {
  const byAircraft = new Map<number, DueState>();
  for (const item of items) {
    const current = byAircraft.get(item.aircraft);
    byAircraft.set(item.aircraft, worstDueState([item.state, ...(current ? [current] : [])])!);
  }
  return byAircraft;
}

/** When an interval falls due: a date, or an aircraft hours/cycles reading. */
export function formatDuePoint(interval: IntervalStatus): string | null {
  if (interval.due_date) return formatDate(interval.due_date);
  if (interval.due_at_aircraft_hours !== null) {
    return `at ${formatHours(interval.due_at_aircraft_hours)}`;
  }
  if (interval.due_at_aircraft_cycles !== null) {
    return `at ${formatNumber(interval.due_at_aircraft_cycles, 0)} cycles`;
  }
  return null;
}

/** Tasks already pending on an open work order, mapped to that work order's id. */
export function pendingTasks(openWorkOrders: WorkOrder[]): Map<number, number> {
  const pending = new Map<number, number>();
  for (const workOrder of openWorkOrders) {
    for (const item of workOrder.items) {
      if (item.status === "pending") pending.set(item.task, workOrder.id);
    }
  }
  return pending;
}

const ACTIONABLE_STATES: ReadonlySet<DueState> = new Set(["due_soon", "overdue"]);

/**
 * Tasks to preselect for a new work order: the requested ones, or else every task due soon or
 * overdue; tasks already pending on an open work order are never selected.
 */
export function defaultTaskSelection(
  tasks: TaskStatus[],
  pending: Map<number, number>,
  requested?: number[],
): number[] {
  const available = tasks.filter((t) => !pending.has(t.task));
  if (requested) {
    const wanted = new Set(requested);
    return available.filter((t) => wanted.has(t.task)).map((t) => t.task);
  }
  return available.filter((t) => ACTIONABLE_STATES.has(t.state)).map((t) => t.task);
}
