import { log } from './logger';

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function readCache<T>(namespace: KVNamespace, key: string): Promise<T | null> {
  try {
    return await namespace.get<T>(key, 'json');
  } catch (error) {
    log.warn('[Cache] Read failed', { key, error: describe(error) });
    return null;
  }
}

export async function writeCache(
  namespace: KVNamespace,
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  try {
    await namespace.put(key, JSON.stringify(value), { expirationTtl: Math.max(60, ttlSeconds) });
  } catch (error) {
    log.warn('[Cache] Write failed', { key, error: describe(error) });
  }
}

export async function deleteCache(namespace: KVNamespace, keys: string[]): Promise<void> {
  const results = await Promise.allSettled(keys.map((key) => namespace.delete(key)));
  for (const [index, result] of results.entries()) {
    if (result.status === 'rejected') {
      log.warn('[Cache] Delete failed', { key: keys[index], error: describe(result.reason) });
    }
  }
}
