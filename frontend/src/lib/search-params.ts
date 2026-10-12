export type ParamUpdates = Record<string, string | number | null | undefined>;

/**
 * Apply updates to a query string and return the new one (without "?"). Empty values remove the
 * key. Changing anything other than `page` resets to the first page, since the old page number
 * refers to a different result set.
 */
export function mergeSearchParams(
  current: URLSearchParams | string,
  updates: ParamUpdates,
): string {
  const params = new URLSearchParams(current);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === "") params.delete(key);
    else params.set(key, String(value));
  }
  if (!("page" in updates)) params.delete("page");
  if (params.get("page") === "1") params.delete("page");
  return params.toString();
}

/** A 1-based page number from the URL; anything invalid means the first page. */
export function parsePage(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  return Math.max(1, Number(value));
}
