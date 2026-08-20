import { env } from 'cloudflare:workers';

export async function cachedToken(
  key: string,
  ttlSeconds: number,
  produce: () => Promise<string>
): Promise<string> {
  const cached = await env.PROVIDER_CACHE.get(key);
  if (cached) return cached;

  const token = await produce();
  await env.PROVIDER_CACHE.put(key, token, { expirationTtl: Math.max(60, ttlSeconds) });
  return token;
}

export async function evictToken(key: string): Promise<void> {
  await env.PROVIDER_CACHE.delete(key);
}
