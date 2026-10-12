import { Badge } from "@/components/ui/badge";
import type { WorkOrderItem, WorkOrderStatus } from "@/lib/api/maintenance";

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  open: "Open",
  completed: "Completed",
  cancelled: "Cancelled",
};

const ORDER_VARIANTS = { open: "default", completed: "secondary", cancelled: "outline" } as const;

export function WorkOrderStatusBadge({ status }: { status: WorkOrderStatus }) {
  return <Badge variant={ORDER_VARIANTS[status]}>{WORK_ORDER_STATUS_LABELS[status]}</Badge>;
}

const ITEM_LABELS: Record<WorkOrderItem["status"], string> = {
  pending: "Pending",
  signed_off: "Signed off",
  cancelled: "Cancelled",
};

const ITEM_VARIANTS = { pending: "default", signed_off: "secondary", cancelled: "outline" } as const;

export function WorkOrderItemStatusBadge({ status }: { status: WorkOrderItem["status"] }) {
  return <Badge variant={ITEM_VARIANTS[status]}>{ITEM_LABELS[status]}</Badge>;
}

/** "2 of 3 signed off"; cancelled items are left out of the count. */
export function itemProgress(items: WorkOrderItem[]): string {
  const live = items.filter((item) => item.status !== "cancelled");
  const done = live.filter((item) => item.status === "signed_off").length;
  return `${done} of ${live.length} signed off`;
}
