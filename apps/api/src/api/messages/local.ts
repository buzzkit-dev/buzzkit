import { resolveCredential } from '@buzzkit/api/api/messages/send';
import { createDb } from '@buzzkit/api/libs/database';
import { log } from '@buzzkit/api/libs/logger';
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
  const db = createDb({ max: 1 }, { traced: false });
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
    const result = await PROVIDERS[provider].send({
      credentialId: credential.id,
      credentialUpdatedAt: credential.updatedAt.getTime(),
      secret: credential.secret,
      details: credential.details,
      environment: credential.environment,
      endpoint: subscription.endpoint,
      payload: { silent: true, bk: { cancel: { id: runId } } },
      expiresAt: new Date(Date.now() + CANCEL_PUSH_TTL_MS),
    });
    if (!result.ok) {
      log.warn('[Engine] Cancel push failed', { runId, provider, code: result.code });
    }
  }
}
