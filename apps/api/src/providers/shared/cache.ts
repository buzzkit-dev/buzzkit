import { env } from 'cloudflare:workers';
import { deleteCache, readCache, writeCache } from '@buzzkit/api/libs/cache';

export type TokenMemo = Map<string, Promise<string>>;

export function createTokenMemo(): TokenMemo {
  return new Map();
}

export async function cachedToken(
  key: string,
  ttlSeconds: number,
  produce: () => Promise<string>,
  memo?: TokenMemo
): Promise<string> {
  const pending = memo?.get(key);
  if (pending) return pending;

  const lookup = (async () => {
    const cached = await readCache<string>(env.PROVIDER_CACHE, key);
    if (cached) return cached;

    const token = await produce();
    await writeCache(env.PROVIDER_CACHE, key, token, ttlSeconds);
    return token;
  })();

  memo?.set(key, lookup);
  try {
    return await lookup;
  } catch (error) {
    memo?.delete(key);
    throw error;
  }
}

export async function evictToken(key: string, memo?: TokenMemo): Promise<void> {
  memo?.delete(key);
  await deleteCache(env.PROVIDER_CACHE, [key]);
}
