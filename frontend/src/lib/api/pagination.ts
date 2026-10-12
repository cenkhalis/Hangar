/** DRF PageNumberPagination page size; must match REST_FRAMEWORK["PAGE_SIZE"] in the backend. */
export const PAGE_SIZE = 50;

export function pageCount(count: number, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(count / pageSize));
}
