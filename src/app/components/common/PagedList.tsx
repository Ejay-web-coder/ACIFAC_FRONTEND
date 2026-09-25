import type { ReactNode } from 'react';
import { Pagination } from './UiKit';
import { usePagination } from './usePagination';

// Renders one page of `items` plus the pager. Use it where the list is built
// after early returns, so the paging hook cannot live in the page component.
export function PagedList<T>({ items, children, pageSize, resetKey, label, pagerClassName }: {
  items: T[];
  children: (pageItems: T[]) => ReactNode;
  pageSize?: number;
  resetKey?: string;
  label?: string;
  pagerClassName?: string;
}) {
  const pages = usePagination(items, { pageSize, resetKey });
  return (
    <>
      {children(pages.pageItems)}
      <Pagination page={pages.page} totalPages={pages.totalPages} total={pages.total} pageSize={pages.pageSize} onPageChange={pages.setPage} onPageSizeChange={pages.setPageSize} label={label} className={pagerClassName} />
    </>
  );
}
