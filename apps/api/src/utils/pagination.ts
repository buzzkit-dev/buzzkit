import { BadRequestError } from '@buzzkit/api/libs/error';
import { t } from 'elysia';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export const PaginationQuerySchema = t.Object({
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: MAX_PAGE_SIZE })),
  cursor: t.Optional(t.String()),
});

export type Page<T> = {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
};

export function clampLimit(limit: number | undefined): number {
  return Math.min(limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
}

export function resolveCursor(
  cursor: string | undefined,
  decode: (id: string) => number | undefined
): number | undefined {
  if (cursor === undefined) return undefined;

  const id = decode(cursor);
  if (!id) {
    throw new BadRequestError('Invalid cursor', { code: 'invalid_cursor', param: 'cursor' });
  }

  return id;
}

export function toPage<T extends { id: number }>(
  rows: T[],
  limit: number,
  encode: (id: number) => string
): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = items.at(-1);

  return {
    items,
    hasMore,
    nextCursor: hasMore && lastItem ? encode(lastItem.id) : null,
  };
}
