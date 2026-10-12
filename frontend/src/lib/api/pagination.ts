/** DRF PageNumberPagination page size; must match REST_FRAMEWORK["PAGE_SIZE"] in the backend. */
export const PAGE_SIZE = 50;

export function pageCount(count: number, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(count / pageSize));
}

type Page<T> = { results: T[]; next: string | null };

/** Fetch every page of a small reference list (models, component types) in order. */
export async function fetchAllPages<T>(fetchPage: (page: number) => Promise<Page<T>>): Promise<T[]> {
  const results: T[] = [];
  for (let page = 1; ; page += 1) {
    const data = await fetchPage(page);
    results.push(...data.results);
    if (!data.next) return results;
  }
}
