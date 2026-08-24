import { requestUrl } from '@/app/lib/utils/request';

export const PAGE_SIZE = 50;

export type Pagination = {
  page: number;
  pageCount: number | null;
  total: number | null;
  previous: string | null;
  next: string | null;
};

export function readPage(request: Request, pageSize = PAGE_SIZE) {
  const url = requestUrl(request);
  return { limit: pageSize, cursor: url.searchParams.get('cursor') ?? undefined };
}

export function paginate<T>(
  request: Request,
  page: { items: T[]; hasMore: boolean; nextCursor: string | null; total?: number },
  pageSize = PAGE_SIZE
): { items: T[]; pagination: Pagination } {
  const url = requestUrl(request);
  const cursor = url.searchParams.get('cursor');
  const trail = (url.searchParams.get('trail') ?? '').split(',').filter(Boolean);

  const link = (nextCursor: string | null, nextTrail: string[]) => {
    const target = new URL(url);
    target.searchParams.delete('cursor');
    target.searchParams.delete('trail');
    if (nextCursor) target.searchParams.set('cursor', nextCursor);
    if (nextTrail.length > 0) target.searchParams.set('trail', nextTrail.join(','));
    return `${target.pathname}${target.search}`;
  };

  return {
    items: page.items,
    pagination: {
      page: trail.length + (cursor ? 2 : 1),
      pageCount: page.total === undefined ? null : Math.max(1, Math.ceil(page.total / pageSize)),
      total: page.total ?? null,
      previous: cursor ? link(trail.at(-1) ?? null, trail.slice(0, -1)) : null,
      next:
        page.hasMore && page.nextCursor ? link(page.nextCursor, cursor ? [...trail, cursor] : trail) : null,
    },
  };
}
