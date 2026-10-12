import { useQuery } from "@tanstack/react-query";

import { getHealth } from "@/lib/api/health";
import { queryKeys } from "@/lib/query-keys";

/** How often the shell rechecks the backend while the tab is visible. */
export const HEALTH_POLL_MS = 30_000;

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: getHealth,
    retry: false,
    refetchInterval: HEALTH_POLL_MS,
  });
}
