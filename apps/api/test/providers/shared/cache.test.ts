import { env } from 'cloudflare:workers';
import { cachedToken, createTokenMemo, evictToken } from '@buzzkit/api/providers/shared/cache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@buzzkit/api/libs/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const bindings = env as unknown as Record<string, unknown>;

function fakeKv() {
  const store = new Map<string, string>();

  return {
    store,
    get: async (key: string) => {
      const value = store.get(key);
      return value === undefined ? null : JSON.parse(value);
    },
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
  };
}

let kv: ReturnType<typeof fakeKv>;

beforeEach(() => {
  kv = fakeKv();
  bindings.PROVIDER_CACHE = kv;
});

afterEach(() => {
  delete bindings.PROVIDER_CACHE;
});

describe('cachedToken', () => {
  it('mints once, writes KV, and serves later calls from KV', async () => {
    const produce = vi.fn(async () => 'minted-1');

    expect(await cachedToken('apns:jwt:1:1', 300, produce)).toBe('minted-1');
    expect(await cachedToken('apns:jwt:1:1', 300, produce)).toBe('minted-1');
    expect(produce).toHaveBeenCalledTimes(1);
    expect(kv.store.has('apns:jwt:1:1')).toBe(true);
  });

  it('dedupes concurrent mints through the batch memo', async () => {
    const produce = vi.fn(async () => 'minted-2');
    const memo = createTokenMemo();

    const [first, second] = await Promise.all([
      cachedToken('fcm:token:1:1', 300, produce, memo),
      cachedToken('fcm:token:1:1', 300, produce, memo),
    ]);

    expect(first).toBe('minted-2');
    expect(second).toBe('minted-2');
    expect(produce).toHaveBeenCalledTimes(1);
  });

  it('clears the memo entry when the mint fails so the next call retries', async () => {
    const produce = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('mint failed'))
      .mockResolvedValueOnce('minted-3');
    const memo = createTokenMemo();

    await expect(cachedToken('fcm:token:2:1', 300, produce, memo)).rejects.toThrow('mint failed');
    expect(await cachedToken('fcm:token:2:1', 300, produce, memo)).toBe('minted-3');
  });
});

describe('evictToken', () => {
  it('removes the token from the memo and KV', async () => {
    const memo = createTokenMemo();
    await cachedToken('apns:jwt:9:9', 300, async () => 'stale', memo);

    await evictToken('apns:jwt:9:9', memo);

    expect(memo.size).toBe(0);
    expect(kv.store.has('apns:jwt:9:9')).toBe(false);
  });
});
