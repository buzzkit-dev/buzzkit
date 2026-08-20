import { env } from 'cloudflare:workers';
import { deleteCache, readCache, writeCache } from '@buzzkit/api/libs/cache';

export async function cachedToken(
  key: string,
  ttlSeconds: number,
  produce: () => Promise<string>
): Promise<string> {
  const cached = await readCache<string>(env.PROVIDER_CACHE, key);
  if (cached) return cached;

  const token = await produce();
  await writeCache(env.PROVIDER_CACHE, key, token, ttlSeconds);
  return token;
}

export async function evictToken(key: string): Promise<void> {
  await deleteCache(env.PROVIDER_CACHE, [key]);
}
