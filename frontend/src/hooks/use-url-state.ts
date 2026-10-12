import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { mergeSearchParams, type ParamUpdates, parsePage } from "@/lib/search-params";

/**
 * Filter and page state kept in the URL, so list views can be shared and the back button works.
 * Components using this call `useSearchParams` and must render inside a Suspense boundary.
 */
export function useUrlState() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const setParams = useCallback(
    (updates: ParamUpdates) => {
      const query = mergeSearchParams(searchParams, updates);
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [searchParams, pathname, router],
  );

  const setPage = useCallback((page: number) => setParams({ page }), [setParams]);

  return {
    params: searchParams,
    page: parsePage(searchParams.get("page")),
    setParams,
    setPage,
  };
}
