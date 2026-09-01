import { resolveCredential } from '@buzzkit/api/api/messages/send';
import { stepDb } from '@buzzkit/api/libs/database';
import { log } from '@buzzkit/api/libs/logger';
import { trace } from '@buzzkit/api/libs/telemetry';
import { PROVIDERS, type ProviderName, PUSH_PROVIDER_BY_PLATFORM } from '@buzzkit/api/providers/index';
import { and, eq, isNull, tables } from '@buzzkit/database';
import type { WorkflowSpec } from '@buzzkit/schema/workflows';

const CANCEL_PUSH_TTL_MS = 6 * 60 * 60 * 1000;

export function specHasLocalDelivery(spec: WorkflowSpec): boolean {
  return JSON.stringify(spec.steps).includes('"deliver":"local"');
}

export async function sendRunCancelPush(
  tenantId: number,
  subscriberId: number,
  runId: string
): Promise<void> {
  const db = stepDb();
  const subscriptions = await db
    .select()
    .from(tables.subscription)
    .where(
      and(
        eq(tables.subscription.tenantId, tenantId),
        eq(tables.subscription.subscriberId, subscriberId),
        eq(tables.subscription.channel, 'push'),
        eq(tables.subscription.enabled, true),
        eq(tables.subscription.status, 'active'),
        isNull(tables.subscription.deletedAt)
      )
    );

  for (const subscription of subscriptions) {
    if (!subscription.platform) continue;

    const provider: ProviderName = PUSH_PROVIDER_BY_PLATFORM[subscription.platform];
    const credential = await resolveCredential(db, tenantId, provider, subscription.environment);

    if (!credential) continue;

    const result = await trace(
      'deliveries.send',
      { 'delivery.provider': provider, 'tenant.id': tenantId, 'delivery.kind': 'cancel' },
      async (span) => {
        const sent = await PROVIDERS[provider].send({
          credentialId: credential.id,
          credentialUpdatedAt: credential.updatedAt.getTime(),
          secret: credential.secret,
          details: credential.details,
          environment: credential.environment,
          endpoint: subscription.endpoint,
          payload: { silent: true, bk: { cancel: { id: runId } } },
          expiresAt: new Date(Date.now() + CANCEL_PUSH_TTL_MS),
        });
        span.set('delivery.ok', sent.ok);
        if (!sent.ok) span.set('delivery.code', sent.code);
        return sent;
      }
    );

    if (!result.ok) {
      log.warn('[Deliveries] Cancel push failed', {
        runId,
        tenantId,
        subscriberId,
        provider,
        code: result.code,
      });
    }
  }
}
