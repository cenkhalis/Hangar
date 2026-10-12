import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  cancelWorkOrder,
  type CompletionFilters,
  createWorkOrder,
  type DueState,
  getCompletion,
  getMaintenanceStatus,
  getWorkOrder,
  type HistoricalCompletionRequest,
  listCompletions,
  listDue,
  listWorkOrders,
  recordHistoricalCompletion,
  type SignOffRequest,
  signOffItem,
  voidCompletion,
  type WorkOrderCreateRequest,
  type WorkOrderFilters,
} from "@/lib/api/maintenance";
import { queryKeys } from "@/lib/query-keys";

const ACTIONABLE: DueState[] = ["due_soon", "overdue"];

/**
 * Due-soon and overdue items for the given aircraft. Disabled for an empty list, which the API
 * would otherwise read as "the whole fleet".
 */
export function useDueForAircraft(aircraft: number[]) {
  const filters = { aircraft, state: ACTIONABLE };
  return useQuery({
    queryKey: queryKeys.maintenance.due(filters),
    queryFn: () => listDue(filters),
    enabled: aircraft.length > 0,
  });
}

/** Fleet due board; `aircraft` narrows it, and an empty `state` means the API default. */
export function useDueList(filters: { aircraft?: number[]; state?: DueState[] }) {
  return useQuery({
    queryKey: queryKeys.maintenance.due(filters),
    queryFn: () => listDue(filters),
  });
}

export function useMaintenanceStatus(aircraftId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.maintenance.status(aircraftId ?? 0),
    queryFn: () => getMaintenanceStatus(aircraftId!),
    enabled: aircraftId !== undefined,
  });
}

export function useCompletions(filters: CompletionFilters) {
  return useQuery({
    queryKey: queryKeys.maintenance.completions(filters),
    queryFn: () => listCompletions(filters),
    placeholderData: keepPreviousData,
  });
}

export function useWorkOrders(filters: WorkOrderFilters, { enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.maintenance.workOrders(filters),
    queryFn: () => listWorkOrders(filters),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useWorkOrder(id: number) {
  return useQuery({
    queryKey: queryKeys.maintenance.workOrder(id),
    queryFn: () => getWorkOrder(id),
  });
}

export function useCompletion(id: number) {
  return useQuery({
    queryKey: queryKeys.maintenance.completion(id),
    queryFn: () => getCompletion(id),
  });
}

/**
 * Work orders, sign-offs, due status, the due list and the history all live under one key, and
 * every maintenance mutation can move several of them.
 */
function useInvalidateMaintenance() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.maintenance.all });
}

export function useRecordHistoricalCompletion() {
  const invalidate = useInvalidateMaintenance();
  return useMutation({
    mutationFn: (body: HistoricalCompletionRequest) => recordHistoricalCompletion(body),
    onSuccess: invalidate,
  });
}

export function useVoidCompletion() {
  const invalidate = useInvalidateMaintenance();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => voidCompletion(id, reason),
    onSuccess: invalidate,
  });
}

export function useCreateWorkOrder() {
  const invalidate = useInvalidateMaintenance();
  return useMutation({
    mutationFn: (body: WorkOrderCreateRequest) => createWorkOrder(body),
    onSuccess: invalidate,
  });
}

export function useCancelWorkOrder() {
  const invalidate = useInvalidateMaintenance();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => cancelWorkOrder(id, reason),
    onSuccess: invalidate,
  });
}

export function useSignOffItem() {
  const invalidate = useInvalidateMaintenance();
  return useMutation({
    mutationFn: ({ itemId, body }: { itemId: number; body: SignOffRequest }) =>
      signOffItem(itemId, body),
    onSuccess: invalidate,
  });
}
