import { describe, expect, it, vi } from 'vitest';
import type { Page, PageParams } from '../../src/core/pagination';
import { paginate } from '../../src/core/pagination';

type Row = { id: string };

function pagesOf(...batches: Array<{ items: Row[]; nextCursor: string | null }>) {
  const load = vi.fn(async (params: PageParams & { limit?: number }): Promise<Page<Row>> => {
    const index = params.cursor
      ? batches.findIndex((candidate) => candidate.nextCursor === params.cursor) + 1
      : 0;
    const batch = batches[index];
    if (!batch) throw new Error(`No page for cursor ${String(params.cursor)}`);

    return { items: batch.items, hasMore: batch.nextCursor !== null, nextCursor: batch.nextCursor };
  });

  return load;
}

describe('paginate', () => {
  it('resolves to the first page when awaited', async () => {
    const load = pagesOf({ items: [{ id: 'a' }], nextCursor: null });

    const page = await paginate(load, { limit: 10 });

    expect(page.items).toEqual([{ id: 'a' }]);
    expect(page.hasMore).toBe(false);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith({ limit: 10 });
  });

  it('walks every page when iterated', async () => {
    const load = pagesOf(
      { items: [{ id: 'a' }, { id: 'b' }], nextCursor: 'cur_1' },
      { items: [{ id: 'c' }], nextCursor: 'cur_2' },
      { items: [{ id: 'd' }], nextCursor: null }
    );

    const seen: string[] = [];
    for await (const row of paginate(load, { limit: 2 })) seen.push(row.id);

    expect(seen).toEqual(['a', 'b', 'c', 'd']);
    expect(load).toHaveBeenNthCalledWith(2, { limit: 2, cursor: 'cur_1' });
    expect(load).toHaveBeenNthCalledWith(3, { limit: 2, cursor: 'cur_2' });
  });

  it('fetches the first page once however it is consumed', async () => {
    const load = pagesOf({ items: [{ id: 'a' }], nextCursor: null });
    const pending = paginate(load, {});

    const first = await pending;
    const seen: string[] = [];
    for await (const row of pending) seen.push(row.id);

    expect(first.items).toEqual([{ id: 'a' }]);
    expect(seen).toEqual(['a']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('stops at a page that claims more but carries no cursor', async () => {
    const load = vi.fn(async (): Promise<Page<Row>> => {
      return { items: [{ id: 'a' }], hasMore: true, nextCursor: null };
    });

    const seen: string[] = [];
    for await (const row of paginate(load, {})) seen.push(row.id);

    expect(seen).toEqual(['a']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('yields nothing for an empty page', async () => {
    const load = pagesOf({ items: [], nextCursor: null });

    const seen: Row[] = [];
    for await (const row of paginate(load, {})) seen.push(row);

    expect(seen).toEqual([]);
  });

  it('rejects rather than hanging when the page fails', async () => {
    const load = vi.fn(async (): Promise<Page<Row>> => {
      throw new Error('boom');
    });

    await expect(paginate(load, {})).rejects.toThrow('boom');
  });

  it('is catchable and finally-able like a promise', async () => {
    const load = vi.fn(async (): Promise<Page<Row>> => {
      throw new Error('boom');
    });
    const settled = vi.fn();

    const caught = await paginate(load, {})
      .catch((error: Error) => error.message)
      .finally(settled);

    expect(caught).toBe('boom');
    expect(settled).toHaveBeenCalled();
  });
});

describe('PagePromise shape', () => {
  it('runs finally directly on the page promise', async () => {
    const load = pagesOf({ items: [{ id: 'a' }], nextCursor: null });
    const settled = vi.fn();

    await paginate(load, {}).finally(settled);

    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('identifies itself for debugging', () => {
    const load = pagesOf({ items: [], nextCursor: null });

    expect(Object.prototype.toString.call(paginate(load, {}))).toBe('[object PagePromise]');
  });
});
