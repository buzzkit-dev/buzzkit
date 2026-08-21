import { clampLimit, resolveCursor, toPage } from '@buzzkit/api/utils/pagination';
import { describe, expect, it } from 'vitest';

describe('pagination helpers', () => {
  it('clamps limits to the default and the maximum', () => {
    expect(clampLimit(undefined)).toBe(50);
    expect(clampLimit(10)).toBe(10);
    expect(clampLimit(500)).toBe(100);
  });

  it('resolves cursors through the decoder and rejects anything that does not decode', () => {
    expect(resolveCursor(undefined, () => 1)).toBeUndefined();
    expect(resolveCursor('ok', () => 42)).toBe(42);
    expect(() => resolveCursor('bad', () => undefined)).toThrow();
    expect(() => resolveCursor('zero', () => 0)).toThrow();
  });

  it('builds pages with a next cursor only when more rows exist', () => {
    const rows = [{ id: 3 }, { id: 2 }, { id: 1 }];
    expect(toPage(rows, 2, (id) => `c${id}`)).toEqual({
      items: [{ id: 3 }, { id: 2 }],
      hasMore: true,
      nextCursor: 'c2',
    });
    expect(toPage(rows, 3, (id) => `c${id}`)).toEqual({ items: rows, hasMore: false, nextCursor: null });
    expect(toPage([], 3, (id) => `c${id}`)).toEqual({ items: [], hasMore: false, nextCursor: null });
  });
});
