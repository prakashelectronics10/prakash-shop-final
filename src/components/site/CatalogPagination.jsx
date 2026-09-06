import { ChevronLeft, ChevronRight } from "lucide-react";

export function CatalogPagination({ page = 1, pages = 1, total = 0, pageSize = 0, loading = false, onPageChange }) {
  const totalPages = Math.max(1, Number(pages) || 1);
  const currentPage = Math.min(totalPages, Math.max(1, Number(page) || 1));
  const safeTotal = Math.max(0, Number(total) || 0);
  const start = safeTotal ? (currentPage - 1) * pageSize + 1 : 0;
  const end = safeTotal ? Math.min(currentPage * pageSize, safeTotal) : 0;

  if (safeTotal <= pageSize && totalPages <= 1) return null;

  return (
    <nav className="catalog-pagination" aria-label="Product catalog pagination">
      <span>
        {start}-{end} of {safeTotal}
      </span>
      <div>
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={loading || currentPage <= 1}
          aria-label="Previous products page"
        >
          <ChevronLeft size={17} />
          <span>Prev</span>
        </button>
        <strong>
          {currentPage} / {totalPages}
        </strong>
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={loading || currentPage >= totalPages}
          aria-label="Next products page"
        >
          <span>Next</span>
          <ChevronRight size={17} />
        </button>
      </div>
    </nav>
  );
}
