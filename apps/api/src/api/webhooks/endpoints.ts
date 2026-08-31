import { env } from 'cloudflare:workers';
import { createAuditLogger } from '@buzzkit/api/api/audit/index';
import { BadRequestError, NotFoundError } from '@buzzkit/api/libs/error';
import { log } from '@buzzkit/api/libs/logger';
import { decodeEntityId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { and, count, type Db, eq, isNull, or, sql, tables } from '@buzzkit/database';
import { generateWebhookSecret } from 'buzzkit/webhooks';
import { assertValidSubscriptions, subscriptionMatches } from './catalog';
import { DISABLE_AFTER_FAILING_MS, MAX_ENDPOINTS_PER_WORKSPACE, SECRET_OVERLAP_MS } from './policy';
import type { EndpointInput, WebhookEndpoint } from './types';

const PRIVATE_HOSTNAME_PATTERN =
  /^(localhost|.*\.(local|internal|localhost)|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+|\[?::1\]?|\[?::ffff:.*|\[?fc[0-9a-f]{2}:.*|\[?fd[0-9a-f]{2}:.*|\[?fe80:.*)$/i;

export function assertValidEndpointUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestError('Endpoint URL is not a valid URL', { code: 'invalid_url', param: 'url' });
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new BadRequestError('Endpoint URL must use https or http', { code: 'invalid_url', param: 'url' });
  }
  if (parsed.username || parsed.password) {
    throw new BadRequestError('Endpoint URL may not carry credentials', {
      code: 'invalid_url',
      param: 'url',
    });
  }
  if ((env.ENVIRONMENT as string) === 'production') {
    if (parsed.protocol !== 'https:') {
      throw new BadRequestError('Endpoint URL must use https', { code: 'invalid_url', param: 'url' });
    }
    if (PRIVATE_HOSTNAME_PATTERN.test(parsed.hostname.replace(/\.$/, ''))) {
      throw new BadRequestError('Endpoint URL must be publicly reachable', {
        code: 'invalid_url',
        param: 'url',
      });
    }
  }
}

export async function findEndpoint(
  db: Db,
  workspaceId: number,
  endpointSqid: string
): Promise<WebhookEndpoint> {
  const endpointId = decodeEntityId('webhook', endpointSqid);
  const [row] = endpointId
    ? await trace(
        'webhooks.find',
        async () =>
          await db
            .select()
            .from(tables.webhookEndpoint)
            .where(
              and(
                eq(tables.webhookEndpoint.id, endpointId),
                eq(tables.webhookEndpoint.workspaceId, workspaceId),
                isNull(tables.webhookEndpoint.deletedAt)
              )
            )
      )
    : [];
  if (!row) throw new NotFoundError('Webhook endpoint not found');
  return row;
}

export async function findEnabledEndpointById(db: Db, endpointId: number): Promise<WebhookEndpoint | null> {
  const [row] = await db
    .select()
    .from(tables.webhookEndpoint)
    .where(
      and(
        eq(tables.webhookEndpoint.id, endpointId),
        isNull(tables.webhookEndpoint.disabledAt),
        isNull(tables.webhookEndpoint.deletedAt)
      )
    );
  return row ?? null;
}

export async function listEndpoints(db: Db, workspaceId: number): Promise<WebhookEndpoint[]> {
  return await trace(
    'webhooks.list',
    async () =>
      await db
        .select()
        .from(tables.webhookEndpoint)
        .where(
          and(eq(tables.webhookEndpoint.workspaceId, workspaceId), isNull(tables.webhookEndpoint.deletedAt))
        )
        .orderBy(tables.webhookEndpoint.id)
  );
}

export async function listEnabledEndpoints(
  db: Db,
  workspaceId: number,
  tenantId: number | null
): Promise<WebhookEndpoint[]> {
  return await db
    .select()
    .from(tables.webhookEndpoint)
    .where(
      and(
        eq(tables.webhookEndpoint.workspaceId, workspaceId),
        isNull(tables.webhookEndpoint.disabledAt),
        isNull(tables.webhookEndpoint.deletedAt),
        tenantId === null
          ? isNull(tables.webhookEndpoint.tenantId)
          : or(isNull(tables.webhookEndpoint.tenantId), eq(tables.webhookEndpoint.tenantId, tenantId))
      )
    );
}

export const ENDPOINT_HORIZON_CLOCK_SKEW_MS = 1000;

export function endpointReceives(
  endpoint: WebhookEndpoint,
  eventName: string,
  occurredAt: Date,
  skewMs = 0
): boolean {
  return (
    endpoint.createdAt.getTime() - skewMs <= occurredAt.getTime() &&
    subscriptionMatches(endpoint.events, eventName)
  );
}

export async function matchingEndpoints(
  db: Db,
  workspaceId: number,
  tenantId: number | null,
  eventName: string,
  occurredAt: Date
): Promise<WebhookEndpoint[]> {
  const endpoints = await listEnabledEndpoints(db, workspaceId, tenantId);
  return endpoints.filter((endpoint) => endpointReceives(endpoint, eventName, occurredAt));
}

export async function createEndpoint(
  db: Db,
  workspaceId: number,
  input: EndpointInput,
  createdByUserId: string | null
): Promise<WebhookEndpoint> {
  assertValidEndpointUrl(input.url);
  assertValidSubscriptions(input.events ?? []);

  const [existing] = await db
    .select({ total: count() })
    .from(tables.webhookEndpoint)
    .where(
      and(eq(tables.webhookEndpoint.workspaceId, workspaceId), isNull(tables.webhookEndpoint.deletedAt))
    );
  if (Number(existing?.total ?? 0) >= MAX_ENDPOINTS_PER_WORKSPACE) {
    throw new BadRequestError(
      `A workspace can have at most ${MAX_ENDPOINTS_PER_WORKSPACE} webhook endpoints`,
      {
        code: 'endpoint_limit',
      }
    );
  }

  const [created] = await trace(
    'webhooks.create',
    async () =>
      await db
        .insert(tables.webhookEndpoint)
        .values({
          workspaceId,
          tenantId: input.tenantId ?? null,
          url: input.url,
          description: input.description ?? null,
          events: input.events ?? [],
          secret: generateWebhookSecret(),
          createdByUserId,
        })
        .returning()
  );
  return created!;
}

export async function updateEndpoint(
  db: Db,
  existing: WebhookEndpoint,
  input: Partial<EndpointInput> & { enabled?: boolean }
): Promise<WebhookEndpoint> {
  if (input.url !== undefined) assertValidEndpointUrl(input.url);
  if (input.events !== undefined) assertValidSubscriptions(input.events);

  const [updated] = await trace(
    'webhooks.update',
    async () =>
      await db
        .update(tables.webhookEndpoint)
        .set({
          ...(input.url !== undefined && { url: input.url }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.events !== undefined && { events: input.events }),
          ...(input.tenantId !== undefined && { tenantId: input.tenantId }),
          ...(input.enabled === true && { disabledAt: null, disabledReason: null, failingSince: null }),
          ...(input.enabled === false && { disabledAt: new Date(), disabledReason: 'disabled' }),
        })
        .where(eq(tables.webhookEndpoint.id, existing.id))
        .returning()
  );
  return updated!;
}

export async function rotateEndpointSecret(db: Db, endpoint: WebhookEndpoint): Promise<WebhookEndpoint> {
  const [updated] = await trace(
    'webhooks.rotateSecret',
    async () =>
      await db
        .update(tables.webhookEndpoint)
        .set({
          secret: generateWebhookSecret(),
          previousSecret: endpoint.secret,
          previousSecretExpiresAt: new Date(Date.now() + SECRET_OVERLAP_MS),
        })
        .where(eq(tables.webhookEndpoint.id, endpoint.id))
        .returning()
  );
  return updated!;
}

export async function softDeleteEndpoint(db: Db, endpointId: number): Promise<WebhookEndpoint> {
  const [deleted] = await trace(
    'webhooks.softDelete',
    async () =>
      await db
        .update(tables.webhookEndpoint)
        .set({ deletedAt: new Date() })
        .where(eq(tables.webhookEndpoint.id, endpointId))
        .returning()
  );
  return deleted!;
}

export async function markEndpointSuccess(db: Db, endpoint: WebhookEndpoint): Promise<void> {
  if (endpoint.failingSince === null) return;
  await db
    .update(tables.webhookEndpoint)
    .set({ failingSince: null })
    .where(eq(tables.webhookEndpoint.id, endpoint.id));
}

export async function markEndpointFailure(db: Db, endpoint: WebhookEndpoint): Promise<{ disabled: boolean }> {
  const [streak] = await db
    .update(tables.webhookEndpoint)
    .set({ failingSince: sql`coalesce(${tables.webhookEndpoint.failingSince}, now())` })
    .where(eq(tables.webhookEndpoint.id, endpoint.id))
    .returning({
      failingSince: tables.webhookEndpoint.failingSince,
      disabledAt: tables.webhookEndpoint.disabledAt,
    });

  if (
    !streak?.failingSince ||
    streak.disabledAt ||
    Date.now() - streak.failingSince.getTime() <= DISABLE_AFTER_FAILING_MS
  ) {
    return { disabled: false };
  }

  await db
    .update(tables.webhookEndpoint)
    .set({ disabledAt: new Date(), disabledReason: 'failing for three days' })
    .where(eq(tables.webhookEndpoint.id, endpoint.id));
  await createAuditLogger(
    db,
    { type: 'system' },
    null,
    endpoint.workspaceId
  )({
    event: 'webhook.disabled',
    target: { type: 'webhook', id: endpoint.id },
    data: { url: endpoint.url, failingSince: streak.failingSince.toISOString() },
  });
  log.warn('[Webhooks] Endpoint disabled after three days of failures', {
    endpointId: endpoint.id,
    workspaceId: endpoint.workspaceId,
    url: endpoint.url,
  });
  return { disabled: true };
}
