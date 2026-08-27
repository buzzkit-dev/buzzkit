import { env } from 'cloudflare:workers';
import { readCache, writeCache } from '@buzzkit/api/libs/cache';
import { trace } from '@buzzkit/api/libs/telemetry';
import { signTinybirdJwt } from '@buzzkit/api/libs/tinybird';
import { DASHBOARD_ENDPOINTS } from '@buzzkit/tinybird';
import { EVENTS_TOKEN_RPS, EVENTS_TOKEN_TTL_SECONDS } from './constants';

type EventsToken = { token: string; expiresAt: string };

export async function createEventsToken(tenantId: number): Promise<EventsToken & { url: string }> {
  const cacheKey = `events-token:${tenantId}`;
  const cached = await readCache<EventsToken>(env.AUTH_CACHE, cacheKey);
  if (cached && new Date(cached.expiresAt).getTime() > Date.now() + 5 * 60_000) {
    return { ...cached, url: env.TINYBIRD_URL };
  }

  const expiresAt = new Date(Date.now() + EVENTS_TOKEN_TTL_SECONDS * 1000);
  const token = await trace('events.createToken', async () =>
    signTinybirdJwt({
      name: `dashboard_tenant_${tenantId}`,
      expiresAt,
      scopes: DASHBOARD_ENDPOINTS.map((resource) => ({
        type: 'PIPES:READ' as const,
        resource,
        fixed_params: { tenant_id: tenantId },
      })),
      limits: { rps: EVENTS_TOKEN_RPS },
    })
  );
  const minted = { token, expiresAt: expiresAt.toISOString() };
  await writeCache(env.AUTH_CACHE, cacheKey, minted, EVENTS_TOKEN_TTL_SECONDS - 10 * 60);
  return { ...minted, url: env.TINYBIRD_URL };
}
