import { describeError } from './error';
import { log } from './logger';

function reviveDates<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(reviveDates) as T;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] =
      typeof entry === 'string' &&
      key.endsWith('At') &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(entry)
        ? new Date(entry)
        : reviveDates(entry);
  }

  return out as T;
}

export async function readCache<T>(namespace: KVNamespace, key: string): Promise<T | null> {
  try {
    return reviveDates(await namespace.get<T>(key, 'json'));
  } catch (error) {
    log.warn('[Cache] Read failed', { key, error: describeError(error) });
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
    log.warn('[Cache] Write failed', { key, error: describeError(error) });
  }
}

export async function deleteCache(namespace: KVNamespace, keys: string[]): Promise<void> {
  const results = await Promise.allSettled(keys.map(async (key) => namespace.delete(key)));
  for (const [index, result] of results.entries()) {
    if (result.status === 'rejected') {
      log.warn('[Cache] Delete failed', { key: keys[index], error: describeError(result.reason) });
    }
  }
}
