import { api, type Schemas, unwrap } from "./client";

export type DueState = Schemas["DueStateEnum"];
export type DueItem = Schemas["DueItem"];
export type MaintenanceReport = Schemas["MaintenanceReport"];
export type TaskStatus = Schemas["TaskStatus"];
export type IntervalStatus = Schemas["IntervalStatus"];
export type TaskCompletion = Schemas["TaskCompletion"];
export type HistoricalCompletionRequest = Schemas["HistoricalCompletionRequest"];

/** Due list; the API defaults to due_soon and overdue across the whole fleet. */
export function listDue({ aircraft, state }: { aircraft?: number[]; state?: DueState[] } = {}) {
  return unwrap(api.GET("/api/maintenance/due/", { params: { query: { aircraft, state } } }));
}

export function getMaintenanceStatus(aircraftId: number): Promise<MaintenanceReport> {
  return unwrap(
    api.GET("/api/maintenance/aircraft/{id}/status/", { params: { path: { id: aircraftId } } }),
  );
}

export type CompletionFilters = { page: number; aircraft?: number };

export function listCompletions({ page, aircraft }: CompletionFilters) {
  return unwrap(
    api.GET("/api/maintenance/completions/", { params: { query: { page, aircraft } } }),
  );
}

export function recordHistoricalCompletion(
  body: HistoricalCompletionRequest,
): Promise<TaskCompletion> {
  return unwrap(api.POST("/api/maintenance/completions/", { body }));
}

export function voidCompletion(id: number, reason: string): Promise<TaskCompletion> {
  return unwrap(
    api.POST("/api/maintenance/completions/{id}/void/", {
      params: { path: { id } },
      body: { reason },
    }),
  );
}

export type WorkOrder = Schemas["WorkOrder"];
export type WorkOrderStatus = Schemas["WorkOrderStatusEnum"];
export type WorkOrderItem = Schemas["WorkOrderItem"];
export type WorkOrderCreateRequest = Schemas["WorkOrderCreateRequest"];
export type SignOffRequest = Schemas["SignOffRequest"];

export type WorkOrderFilters = { page: number; status?: WorkOrderStatus; aircraft?: number };

export function listWorkOrders(query: WorkOrderFilters) {
  return unwrap(api.GET("/api/maintenance/work-orders/", { params: { query } }));
}

export function getWorkOrder(id: number): Promise<WorkOrder> {
  return unwrap(api.GET("/api/maintenance/work-orders/{id}/", { params: { path: { id } } }));
}

export function createWorkOrder(body: WorkOrderCreateRequest): Promise<WorkOrder> {
  return unwrap(api.POST("/api/maintenance/work-orders/", { body }));
}

export function cancelWorkOrder(id: number, reason: string): Promise<WorkOrder> {
  return unwrap(
    api.POST("/api/maintenance/work-orders/{id}/cancel/", {
      params: { path: { id } },
      body: { reason },
    }),
  );
}

/** Sign off one item; signing off the last pending item completes the work order. */
export function signOffItem(itemId: number, body: SignOffRequest): Promise<TaskCompletion> {
  return unwrap(
    api.POST("/api/maintenance/work-order-items/{id}/sign-off/", {
      params: { path: { id: itemId } },
      body,
    }),
  );
}

export function getCompletion(id: number): Promise<TaskCompletion> {
  return unwrap(api.GET("/api/maintenance/completions/{id}/", { params: { path: { id } } }));
}

/** Work orders in a status, read from `count` of a one-row page. */
export async function countWorkOrders(status: WorkOrderStatus): Promise<number> {
  const page = await unwrap(
    api.GET("/api/maintenance/work-orders/", { params: { query: { status, page_size: 1 } } }),
  );
  return page.count;
}
