import { env } from 'cloudflare:workers';
import type { ActorEventRow } from '@buzzkit/api/actor/types';
import { isPublicEvent } from '@buzzkit/api/api/audit/catalog';
import { isDeliverableEvent } from '@buzzkit/api/api/webhooks/catalog';
import {
  claimDeliveryAttempt,
  createDeliveries,
  endpointReceives,
  findDeliveryById,
  findEnabledEndpointById,
  findWebhookEventById,
  listEnabledEndpoints,
  listReconcilableAuditIds,
  listStaleDeliveryIds,
  markEndpointFailure,
  markEndpointSuccess,
  matchingEndpoints,
  recordAttempt,
  recordWebhookEvent,
  settleDelivery,
  signingSecrets,
  type WebhookDelivery,
  type WebhookEndpoint,
  type WebhookEvent,
} from '@buzzkit/api/api/webhooks/index';
import {
  buildAuditPayload,
  buildStreamPayload,
  resolveWebhookScope,
} from '@buzzkit/api/api/webhooks/payload';
import {
  DELIVERY_TIMEOUT_MS,
  isSuccessStatus,
  RESPONSE_EXCERPT_BYTES,
  retryDelaySeconds,
} from '@buzzkit/api/api/webhooks/policy';
import { createDb } from '@buzzkit/api/libs/database';
import { describeError } from '@buzzkit/api/libs/error';
import { log } from '@buzzkit/api/libs/logger';
import { encodeId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { type Db, eq, tables } from '@buzzkit/database';
import { signWebhook } from 'buzzkit/webhooks';

export type WebhookQueueMessage =
  | { kind: 'audit'; auditId: number }
  | { kind: 'stream'; tenantId: number; subscriberId: number; externalId: string; rows: ActorEventRow[] }
  | { kind: 'deliver'; deliveryId: number };

const RETRY_DELAY_SECONDS = 30;

const SWEEP_LIMIT = 500;

export async function handleWebhookBatch(batch: MessageBatch<WebhookQueueMessage>): Promise<void> {
  await trace('queue.webhooks.batch', { 'queue.batch_size': batch.messages.length }, async () => {
    const db = createDb({ max: 2 });
    for (const item of batch.messages) {
      try {
        await processWebhookMessage(db, item.body);
        item.ack();
      } catch (error) {
        log.error('[Webhooks] Message failed, retrying', {
          kind: item.body.kind,
          error: describeError(error),
        });
        item.retry({ delaySeconds: RETRY_DELAY_SECONDS });
      }
    }
  });
}

export async function processWebhookMessage(db: Db, message: WebhookQueueMessage): Promise<void> {
  if (message.kind === 'audit') return await processAuditEvent(db, message.auditId);
  if (message.kind === 'stream') return await processStreamRows(db, message);
  return await processDelivery(db, message.deliveryId);
}

async function processAuditEvent(db: Db, auditId: number): Promise<void> {
  const [row] = await db.select().from(tables.event).where(eq(tables.event.id, auditId));
  if (!row?.workspaceId || !isPublicEvent(row.event)) return;

  const endpoints = await matchingEndpoints(
    db,
    row.workspaceId,
    row.tenantId ?? null,
    row.event,
    row.createdAt
  );
  if (endpoints.length === 0) return;

  const scope = await resolveWebhookScope(db, row.workspaceId, row.tenantId ?? null);
  if (!scope) return;

  const event = await recordWebhookEvent(db, {
    workspaceId: row.workspaceId,
    tenantId: row.tenantId ?? null,
    subscriberId: null,
    source: 'audit',
    sourceId: String(row.id),
    type: row.event,
    payload: await buildAuditPayload(db, row, scope),
  });
  await deliverAll(db, event, endpoints);
}

async function processStreamRows(
  db: Db,
  message: { tenantId: number; subscriberId: number; externalId: string; rows: ActorEventRow[] }
): Promise<void> {
  const [tenant] = await db
    .select({ workspaceId: tables.tenant.workspaceId })
    .from(tables.tenant)
    .where(eq(tables.tenant.id, message.tenantId));
  if (!tenant) return;

  const endpoints = await listEnabledEndpoints(db, tenant.workspaceId, message.tenantId);
  if (endpoints.length === 0) return;

  const scope = await resolveWebhookScope(db, tenant.workspaceId, message.tenantId);
  if (!scope) return;

  for (const row of message.rows) {
    if (!isDeliverableEvent(row.name)) continue;
    const matched = endpoints.filter((endpoint) =>
      endpointReceives(endpoint, row.name, new Date(row.received_at))
    );
    if (matched.length === 0) continue;
    const event = await recordWebhookEvent(db, {
      workspaceId: tenant.workspaceId,
      tenantId: message.tenantId,
      subscriberId: message.subscriberId,
      source: 'stream',
      sourceId: row.id,
      type: row.name,
      payload: buildStreamPayload(row, { id: message.subscriberId, externalId: message.externalId }, scope),
    });
    await deliverAll(db, event, matched);
  }
}

async function processDelivery(db: Db, deliveryId: number): Promise<void> {
  const delivery = await findDeliveryById(db, deliveryId);
  if (!delivery || (delivery.status !== 'pending' && delivery.status !== 'failed')) return;
  if (delivery.nextAttemptAt !== null && delivery.nextAttemptAt.getTime() > Date.now()) return;
  const endpoint = await findEnabledEndpointById(db, delivery.endpointId);
  if (!endpoint) return;
  const event = await findWebhookEventById(db, delivery.eventId);
  if (!event) return;
  await deliver(db, delivery, endpoint, event);
}

async function deliverAll(db: Db, event: WebhookEvent, endpoints: WebhookEndpoint[]): Promise<void> {
  const deliveries = await createDeliveries(db, event, endpoints);
  const endpointById = new Map(endpoints.map((endpoint) => [endpoint.id, endpoint]));
  for (const delivery of deliveries) {
    const endpoint = endpointById.get(delivery.endpointId);
    if (endpoint) await deliver(db, delivery, endpoint, event);
  }
}

export async function deliver(
  db: Db,
  delivery: WebhookDelivery,
  endpoint: WebhookEndpoint,
  event: WebhookEvent
): Promise<boolean> {
  return await trace(
    'webhooks.deliver',
    { 'webhook.endpoint_id': endpoint.id, 'webhook.delivery_id': delivery.id, 'webhook.event': event.type },
    async (t) => {
      const attempts = await claimDeliveryAttempt(db, delivery);
      if (attempts === null) {
        t.set('webhook.claimed', false);
        return false;
      }
      const body = JSON.stringify(event.payload);
      const id = encodeId('webhookEvent', event.id);
      const timestamp = Math.floor(Date.now() / 1000);
      const signatures = await Promise.all(
        signingSecrets(endpoint).map((secret) => signWebhook(secret, id, timestamp, body))
      );

      const started = Date.now();
      let status: number | null = null;
      let error: string | null = null;
      let responseBody: string | null = null;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
      try {
        const response = await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'user-agent': 'buzzkit-webhooks/1',
            'webhook-id': id,
            'webhook-timestamp': String(timestamp),
            'webhook-signature': signatures.join(' '),
          },
          body,
          redirect: 'manual',
          signal: controller.signal,
        });
        status = response.status;
        responseBody = (await response.text()).slice(0, RESPONSE_EXCERPT_BYTES) || null;
        if (!isSuccessStatus(status)) error = `Endpoint responded ${status}`;
      } catch (caught) {
        error = describeDeliveryError(caught, controller.signal.aborted);
      } finally {
        clearTimeout(timer);
      }
      const durationMs = Date.now() - started;
      const ok = status !== null && isSuccessStatus(status);

      await recordAttempt(db, delivery.id, { attempt: attempts, status, error, durationMs, responseBody });
      t.set('webhook.attempt', attempts);
      t.set('webhook.status', status ?? 0);

      if (ok) {
        await settleDelivery(db, delivery.id, {
          status: 'success',
          attempts,
          nextAttemptAt: null,
          lastStatus: status,
          lastError: null,
        });
        await markEndpointSuccess(db, endpoint);
        return true;
      }

      const delay = retryDelaySeconds(attempts);
      if (delay === null) {
        await settleDelivery(db, delivery.id, {
          status: 'exhausted',
          attempts,
          nextAttemptAt: null,
          lastStatus: status,
          lastError: error,
        });
      } else {
        await settleDelivery(db, delivery.id, {
          status: 'failed',
          attempts,
          nextAttemptAt: new Date(Date.now() + delay * 1000),
          lastStatus: status,
          lastError: error,
        });
        await env.WEBHOOKS.send({ kind: 'deliver', deliveryId: delivery.id }, { delaySeconds: delay });
      }
      await markEndpointFailure(db, endpoint);
      return false;
    }
  );
}

function describeDeliveryError(caught: unknown, timedOut: boolean): string {
  if (timedOut) return `No response within ${DELIVERY_TIMEOUT_MS / 1000} seconds`;
  const message = caught instanceof Error ? caught.message : String(caught);
  if (message.startsWith('internal error')) return 'Could not connect to the endpoint';
  return message;
}

export async function reconcileWebhooks(): Promise<void> {
  await trace('scheduler.webhooks', async (t) => {
    const db = createDb({ max: 2 });
    const auditIds = await listReconcilableAuditIds(db, SWEEP_LIMIT);
    for (const auditId of auditIds) {
      await env.WEBHOOKS.send({ kind: 'audit', auditId });
    }
    const deliveryIds = await listStaleDeliveryIds(db, SWEEP_LIMIT);
    for (const deliveryId of deliveryIds) {
      await env.WEBHOOKS.send({ kind: 'deliver', deliveryId });
    }
    t.set('webhooks.reenqueued_events', auditIds.length);
    t.set('webhooks.reenqueued_deliveries', deliveryIds.length);
    if (auditIds.length > 0 || deliveryIds.length > 0) {
      log.warn('[Webhooks] Reconciliation re-enqueued work', {
        events: auditIds.length,
        deliveries: deliveryIds.length,
      });
    }
  });
}
