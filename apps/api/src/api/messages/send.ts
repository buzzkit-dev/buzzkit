import { decryptCredentialSecret } from '@buzzkit/api/api/credentials/index';
import {
  type AttemptOutcome,
  applyAttemptResults,
  claimDeliveryAttempts,
  type DeliveryJob,
  failDeliveriesImmediately,
} from '@buzzkit/api/api/deliveries/index';
import { SEND_CONCURRENCY } from '@buzzkit/api/api/deliveries/policy';
import { recordSystemEvents } from '@buzzkit/api/api/events/index';
import {
  capDayStart,
  policyExempt,
  policyTimezone,
  quietDeferSeconds,
  resolveSubscriberTimezone,
} from '@buzzkit/api/api/messages/policy';
import { resolveSubscriptionEventData } from '@buzzkit/api/api/subscribers/index';
import { resolveTenantSettings, type SendPolicy } from '@buzzkit/api/api/tenants/index';
import { encodeId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import {
  type MessagePayload,
  PROVIDERS,
  type ProviderEnvironment,
  type ProviderName,
  type ProviderSendResult,
} from '@buzzkit/api/providers/index';
import type { TokenMemo } from '@buzzkit/api/providers/shared/cache';
import { runConcurrently } from '@buzzkit/api/utils/concurrency';
import { and, count, type Db, eq, gte, inArray, isNull, ne, tables } from '@buzzkit/database';
import type { CredentialMemo, ProcessableRow, ProcessedDelivery, ResolvedCredential } from './types';

export function createCredentialMemo(): CredentialMemo {
  return new Map();
}

export function resolveCredential(
  db: Db,
  tenantId: number,
  provider: ProviderName,
  environment: ProviderEnvironment,
  memo?: CredentialMemo
): Promise<ResolvedCredential | null> {
  const memoKey = `${tenantId}:${provider}:${environment}`;
  const memoized = memo?.get(memoKey);
  if (memoized) return memoized;

  const pending = findCredentialForProvider(db, tenantId, provider, environment);
  memo?.set(memoKey, pending);

  return pending;
}

async function findCredentialForProvider(
  db: Db,
  tenantId: number,
  provider: ProviderName,
  preferredEnvironment: ProviderEnvironment
): Promise<ResolvedCredential | null> {
  const rows = await db
    .select()
    .from(tables.credential)
    .where(
      and(
        eq(tables.credential.tenantId, tenantId),
        eq(tables.credential.provider, provider),
        ne(tables.credential.status, 'invalid'),
        isNull(tables.credential.deletedAt)
      )
    );

  const credential = rows.find((row) => row.environment === preferredEnvironment);
  if (!credential) return null;

  return {
    id: credential.id,
    updatedAt: credential.updatedAt,
    environment: credential.environment,
    details: credential.details as Record<string, string>,
    secret: await decryptCredentialSecret(credential),
  };
}

async function listDeliveriesForProcessing(db: Db, ids: number[]): Promise<ProcessableRow[]> {
  if (ids.length === 0) return [];

  return await db
    .select({
      delivery: {
        id: tables.delivery.id,
        tenantId: tables.delivery.tenantId,
        messageId: tables.delivery.messageId,
        subscriberId: tables.delivery.subscriberId,
        subscriptionId: tables.delivery.subscriptionId,
        status: tables.delivery.status,
        attempts: tables.delivery.attempts,
        provider: tables.delivery.provider,
      },
      message: {
        id: tables.message.id,
        payload: tables.message.payload,
        targets: tables.message.targets,
        topicId: tables.message.topicId,
        expiresAt: tables.message.expiresAt,
      },
      subscription: {
        id: tables.subscription.id,
        platform: tables.subscription.platform,
        endpoint: tables.subscription.endpoint,
        enabled: tables.subscription.enabled,
        status: tables.subscription.status,
        deletedAt: tables.subscription.deletedAt,
        channel: tables.subscription.channel,
        environment: tables.subscription.environment,
      },
      subscriber: {
        id: tables.subscriber.id,
        externalId: tables.subscriber.externalId,
        attributes: tables.subscriber.attributes,
        deletedAt: tables.subscriber.deletedAt,
      },
    })
    .from(tables.delivery)
    .innerJoin(tables.message, eq(tables.message.id, tables.delivery.messageId))
    .innerJoin(tables.subscription, eq(tables.subscription.id, tables.delivery.subscriptionId))
    .innerJoin(tables.subscriber, eq(tables.subscriber.id, tables.delivery.subscriberId))
    .where(inArray(tables.delivery.id, ids));
}

export async function processDeliveryBatch(
  db: Db,
  jobs: DeliveryJob[],
  memo: CredentialMemo,
  tokens: TokenMemo
): Promise<ProcessedDelivery[]> {
  return await trace('deliveries.processBatch', { 'deliveries.count': jobs.length }, async (t) => {
    const rows = new Map(
      (
        await listDeliveriesForProcessing(
          db,
          jobs.map((job) => job.deliveryId)
        )
      ).map((row) => [row.delivery.id, row])
    );
    const processed: ProcessedDelivery[] = [];
    const unsubscribed: ProcessableRow[] = [];
    const expired: ProcessableRow[] = [];
    const candidates: Array<{ job: DeliveryJob; row: ProcessableRow }> = [];
    const now = Date.now();

    for (const job of jobs) {
      const row = rows.get(job.deliveryId);
      if (
        !row ||
        (row.delivery.status !== 'pending' && row.delivery.status !== 'retrying') ||
        row.delivery.attempts + 1 !== job.attempt
      ) {
        processed.push({
          job,
          messageId: row?.message.id ?? null,
          outcome: 'skipped',
          retryDelaySeconds: null,
        });
        continue;
      }
      if (
        !row.subscription.enabled ||
        row.subscription.status !== 'active' ||
        row.subscription.deletedAt ||
        row.subscriber.deletedAt
      ) {
        unsubscribed.push(row);
        processed.push({ job, messageId: row.message.id, outcome: 'failed', retryDelaySeconds: null });
        continue;
      }
      if (row.message.expiresAt.getTime() < now) {
        expired.push(row);
        processed.push({ job, messageId: row.message.id, outcome: 'failed', retryDelaySeconds: null });
        continue;
      }
      candidates.push({ job, row });
    }

    const policies = new Map<number, SendPolicy>();
    for (const { row } of candidates) {
      if (policies.has(row.delivery.tenantId)) continue;
      const [tenantRow] = await db
        .select({ settings: tables.tenant.settings })
        .from(tables.tenant)
        .where(eq(tables.tenant.id, row.delivery.tenantId));
      policies.set(row.delivery.tenantId, resolveTenantSettings(tenantRow?.settings).sendPolicy);
    }

    const capped: typeof candidates = [];
    const allowed: typeof candidates = [];
    const topicCaps = new Map<number, number | null>();

    for (const candidate of candidates) {
      const { job, row } = candidate;
      const policy = policies.get(row.delivery.tenantId);
      const payload = row.message.payload as MessagePayload;
      const hasTenantPolicy =
        policy !== undefined && (policy.quietHours !== null || policy.dailyCap !== null);
      if (policyExempt(payload) || (!hasTenantPolicy && row.message.topicId === null)) {
        allowed.push(candidate);
        continue;
      }
      const subscriberZone = resolveSubscriberTimezone(row.subscriber.attributes);
      if (policy?.quietHours) {
        const zone = policyTimezone(policy.quietHours, subscriberZone);
        const defer = zone ? quietDeferSeconds(new Date(now), policy.quietHours, zone) : null;
        if (defer !== null) {
          await db
            .update(tables.delivery)
            .set({ nextAttemptAt: new Date(now + defer * 1000) })
            .where(eq(tables.delivery.id, row.delivery.id));
          processed.push({ job, messageId: row.message.id, outcome: 'skipped', retryDelaySeconds: defer });
          continue;
        }
      }
      const zone =
        (policy?.quietHours ? policyTimezone(policy.quietHours, subscriberZone) : subscriberZone) ?? 'UTC';
      const dayStart = capDayStart(new Date(now), zone);
      if (policy && policy.dailyCap !== null) {
        const [countRow] = await db
          .select({ total: count() })
          .from(tables.delivery)
          .where(
            and(
              eq(tables.delivery.subscriberId, row.subscriber.id),
              eq(tables.delivery.status, 'sent'),
              gte(tables.delivery.sentAt, dayStart)
            )
          );
        if (Number(countRow?.total ?? 0) >= policy.dailyCap) {
          capped.push(candidate);
          processed.push({ job, messageId: row.message.id, outcome: 'failed', retryDelaySeconds: null });
          continue;
        }
      }
      if (row.message.topicId !== null) {
        let topicCap = topicCaps.get(row.message.topicId);
        if (topicCap === undefined) {
          const [topicRow] = await db
            .select({ dailyCap: tables.topic.dailyCap })
            .from(tables.topic)
            .where(eq(tables.topic.id, row.message.topicId));
          topicCap = topicRow?.dailyCap ?? null;
          topicCaps.set(row.message.topicId, topicCap);
        }
        if (topicCap !== null) {
          const [countRow] = await db
            .select({ total: count() })
            .from(tables.delivery)
            .innerJoin(tables.message, eq(tables.message.id, tables.delivery.messageId))
            .where(
              and(
                eq(tables.delivery.subscriberId, row.subscriber.id),
                eq(tables.delivery.status, 'sent'),
                gte(tables.delivery.sentAt, dayStart),
                eq(tables.message.topicId, row.message.topicId)
              )
            );
          if (Number(countRow?.total ?? 0) >= topicCap) {
            capped.push(candidate);
            processed.push({ job, messageId: row.message.id, outcome: 'failed', retryDelaySeconds: null });
            continue;
          }
        }
      }
      allowed.push(candidate);
    }

    await failDeliveriesImmediately(
      db,
      capped.map(({ row }) => row.delivery.id),
      'capped',
      'The daily send cap for this subscriber was reached'
    );

    await failDeliveriesImmediately(
      db,
      unsubscribed.map((row) => row.delivery.id),
      'unsubscribed',
      'Subscription is muted, removed, or invalid'
    );
    await failDeliveriesImmediately(
      db,
      expired.map((row) => row.delivery.id),
      'expired',
      'Message expired before delivery'
    );

    const startedAt = new Date();
    const claimed = await claimDeliveryAttempts(
      db,
      allowed.map(({ job }) => job),
      startedAt
    );
    const sending = allowed.filter(({ job }) => claimed.has(job.deliveryId));
    for (const { job, row } of allowed) {
      if (!claimed.has(job.deliveryId)) {
        processed.push({ job, messageId: row.message.id, outcome: 'skipped', retryDelaySeconds: null });
      }
    }

    const outcomes: AttemptOutcome[] = [];
    await runConcurrently(sending, SEND_CONCURRENCY, async ({ job, row }) => {
      const provider = row.delivery.provider;
      const stored = row.message.payload as MessagePayload;
      const payload: MessagePayload = {
        ...stored,
        bk: {
          messageId: encodeId('message', row.message.id),
          ...(stored.imageUrl !== undefined ? { image: stored.imageUrl } : {}),
          ...(stored.bk ?? {}),
        },
      };
      const credential = await resolveCredential(
        db,
        row.delivery.tenantId,
        provider,
        row.subscription.environment,
        memo
      );
      let result: ProviderSendResult;
      if (credential) {
        result = await trace(
          'deliveries.send',
          {
            'delivery.provider': provider,
            'delivery.id': row.delivery.id,
            'tenant.id': row.delivery.tenantId,
          },
          async (span) => {
            const sent = await PROVIDERS[provider].send({
              credentialId: credential.id,
              credentialUpdatedAt: credential.updatedAt.getTime(),
              secret: credential.secret,
              details: credential.details,
              environment: credential.environment,
              endpoint: row.subscription.endpoint,
              payload,
              expiresAt: row.message.expiresAt,
              tokens,
            });
            span.set('delivery.ok', sent.ok);
            if (!sent.ok) span.set('delivery.code', sent.code);
            return sent;
          }
        );
      } else {
        result = {
          ok: false,
          code: 'no_credential',
          reason: `No ${row.subscription.environment} credential configured for ${provider}`,
          request: null,
          response: null,
          latencyMs: 0,
        };
      }
      outcomes.push({
        deliveryId: row.delivery.id,
        tenantId: row.delivery.tenantId,
        messageId: row.message.id,
        subscriptionId: row.subscription.id,
        attempt: job.attempt,
        provider,
        startedAt,
        result,
      });
    });

    const applications = await applyAttemptResults(db, outcomes);
    const applied = new Map(applications.map((application) => [application.deliveryId, application]));

    for (const outcome of outcomes) {
      const application = applied.get(outcome.deliveryId);
      const job = { deliveryId: outcome.deliveryId, attempt: outcome.attempt };
      if (!application) {
        processed.push({ job, messageId: outcome.messageId, outcome: 'skipped', retryDelaySeconds: null });
        continue;
      }
      processed.push({
        job,
        messageId: outcome.messageId,
        outcome:
          application.counterDelta ?? (application.retryDelaySeconds !== null ? 'retrying' : 'skipped'),
        retryDelaySeconds: application.retryDelaySeconds,
      });
    }

    for (const application of applications.filter((entry) => entry.invalidatedSubscription)) {
      const row = rows.get(application.deliveryId)!;
      const outcome = outcomes.find((candidate) => candidate.deliveryId === application.deliveryId)!;
      await recordSystemEvents(
        row.delivery.tenantId,
        { id: row.delivery.subscriberId, externalId: row.subscriber.externalId },
        [
          {
            name: 'subscription.invalidated',
            data: {
              ...resolveSubscriptionEventData(row.subscription, row.subscriber.externalId),
              reason: outcome.result.ok ? null : outcome.result.reason,
            },
          },
        ]
      );
    }

    for (const outcome of ['sent', 'retrying', 'failed', 'invalid', 'skipped'] as const) {
      t.set(`deliveries.${outcome}`, processed.filter((entry) => entry.outcome === outcome).length);
    }

    return processed;
  });
}
