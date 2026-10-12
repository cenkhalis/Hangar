import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type CompletionFilters,
  type DueState,
  getMaintenanceStatus,
  type HistoricalCompletionRequest,
  listCompletions,
  listDue,
  recordHistoricalCompletion,
  voidCompletion,
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

export function useMaintenanceStatus(aircraftId: number) {
  return useQuery({
    queryKey: queryKeys.maintenance.status(aircraftId),
    queryFn: () => getMaintenanceStatus(aircraftId),
  });
}

export function useCompletions(filters: CompletionFilters) {
  return useQuery({
    queryKey: queryKeys.maintenance.completions(filters),
    queryFn: () => listCompletions(filters),
    placeholderData: keepPreviousData,
  });
}

/** Sign-offs change due status, the due list and the history, which all live under one key. */
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
