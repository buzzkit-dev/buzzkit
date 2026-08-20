import { BadRequestError } from '@buzzkit/api/libs/error';

/**
 * Keyset (cursor) pagination over serial integer PKs — the standard for every
 * list endpoint. Opaque sqid cursors, newest-first (`id desc`), limit+1
 * lookahead for hasMore (no COUNT queries), O(1) pages at any depth.
 */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export type Page<T> = {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
};

export function clampLimit(limit: number | undefined): number {
  return Math.min(limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
}

/** Decodes an opaque cursor with the resource's own decoder; 400 on garbage. */
export function resolveCursor(
  cursor: string | undefined,
  decode: (id: string) => number | undefined
): number | undefined {
  if (cursor === undefined) return undefined;

  const id = decode(cursor);
  if (!id) {
    throw new BadRequestError('Invalid cursor');
  }

  return id;
}

/** Turns a limit+1 lookahead result into a page with the next opaque cursor. */
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
