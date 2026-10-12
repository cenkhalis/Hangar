import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { PAGE_SIZE, pageCount } from "@/lib/api/pagination";

export type PaginationProps = {
  /** 1-based current page. */
  page: number;
  /** Total results across all pages (DRF `count`). */
  count: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
};

export function Pagination({ page, count, pageSize = PAGE_SIZE, onPageChange }: PaginationProps) {
  const pages = pageCount(count, pageSize);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4 text-sm">
      <p className="text-muted-foreground">
        {formatNumber(count)} {count === 1 ? "result" : "results"}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft aria-hidden /> Previous
        </Button>
        <span aria-current="page">
          Page {page} of {pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
        >
          Next <ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
