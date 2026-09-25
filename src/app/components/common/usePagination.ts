import { useEffect, useMemo, useState } from 'react';

// Client-side paging for lists that are already loaded, so long lists show one
// page at a time instead of growing the page. `resetKey` (e.g. the current
// search/filter values) sends the list back to page 1 when it changes.
export function usePagination<T>(items: T[], { pageSize: initialPageSize = 10, resetKey = '' }: { pageSize?: number; resetKey?: string } = {}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => { setPage(1); }, [resetKey, pageSize]);
  // Records removed by a live refresh or filter never leave an empty page.
  const current = Math.min(page, totalPages);

  const pageItems = useMemo(() => items.slice((current - 1) * pageSize, current * pageSize), [items, current, pageSize]);

  return { pageItems, page: current, setPage, pageSize, setPageSize, total, totalPages };
}
