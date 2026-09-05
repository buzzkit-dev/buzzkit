import { resolveCredential } from '@buzzkit/api/api/messages/send';
import type { Subscriber } from '@buzzkit/api/api/subscribers/index';
import type { Tenant } from '@buzzkit/api/api/tenants/index';
import { BadRequestError, NotFoundError } from '@buzzkit/api/libs/error';
import { log } from '@buzzkit/api/libs/logger';
import { encodeId } from '@buzzkit/api/libs/sqids';
import { trace } from '@buzzkit/api/libs/telemetry';
import { type LiveActivityPayload, PROVIDERS } from '@buzzkit/api/providers/index';
import { and, type Db, eq, isNull, tables } from '@buzzkit/database';
import type { SendLiveActivitySchema } from './schemas';
import type { LiveActivity } from './types';

export * from './schemas';
export * from './serialize';
export type * from './types';

export async function registerLiveActivity(
  db: Db,
  tenantId: number,
  subscriber: Subscriber,
  input: {
    kind?: 'activity' | 'start';
    activityId?: string;
    attributesType: string;
    token: string;
    environment?: 'production' | 'sandbox';
  }
): Promise<{ activity: LiveActivity; created: boolean }> {
  const kind = input.kind ?? 'activity';
  if (kind === 'activity' && !input.activityId) {
    throw new BadRequestError('Provide the activityId of the Live Activity this token belongs to', {
      code: 'activity_id_missing',
      param: 'activityId',
    });
  }

  return await trace(
    'liveActivities.register',
    { 'tenant.id': tenantId, 'subscriber.id': subscriber.id, 'live_activity.kind': kind },
    async (span) => {
      const { activity, created } = await registerLiveActivityRow(db, tenantId, subscriber, kind, input);
      span.set('live_activity.created', created);
      return { activity, created };
    }
  );
}

async function registerLiveActivityRow(
  db: Db,
  tenantId: number,
  subscriber: Subscriber,
  kind: 'activity' | 'start',
  input: {
    activityId?: string;
    attributesType: string;
    token: string;
    environment?: 'production' | 'sandbox';
  }
): Promise<{ activity: LiveActivity; created: boolean }> {
  const token = input.token.toLowerCase();
  const environment = input.environment ?? 'production';
  const identity =
    kind === 'activity'
      ? eq(tables.liveActivity.activityId, input.activityId as string)
      : eq(tables.liveActivity.attributesType, input.attributesType);
  const [existing] = await db
    .select()
    .from(tables.liveActivity)
    .where(
      and(
        eq(tables.liveActivity.tenantId, tenantId),
        eq(tables.liveActivity.subscriberId, subscriber.id),
        eq(tables.liveActivity.kind, kind),
        identity,
        isNull(tables.liveActivity.deletedAt)
      )
    );

  if (existing) {
    const [updated] = await db
      .update(tables.liveActivity)
      .set({ token, environment, attributesType: input.attributesType, endedAt: null })
      .where(eq(tables.liveActivity.id, existing.id))
      .returning();
    return { activity: updated as LiveActivity, created: false };
  }

  const [created] = await db
    .insert(tables.liveActivity)
    .values({
      tenantId,
      subscriberId: subscriber.id,
      kind,
      activityId: kind === 'activity' ? (input.activityId as string) : null,
      attributesType: input.attributesType,
      token,
      environment,
    })
    .returning();
  return { activity: created as LiveActivity, created: true };
}

export async function endLiveActivityByClient(
  db: Db,
  tenantId: number,
  subscriberId: number,
  activityId: string
): Promise<LiveActivity> {
  return await trace(
    'liveActivities.end',
    { 'tenant.id': tenantId, 'subscriber.id': subscriberId },
    async () => {
      const [updated] = await db
        .update(tables.liveActivity)
        .set({ endedAt: new Date() })
        .where(
          and(
            eq(tables.liveActivity.tenantId, tenantId),
            eq(tables.liveActivity.subscriberId, subscriberId),
            eq(tables.liveActivity.kind, 'activity'),
            eq(tables.liveActivity.activityId, activityId),
            isNull(tables.liveActivity.deletedAt)
          )
        )
        .returning();
      if (!updated) {
        throw new NotFoundError('Live activity not found');
      }
      return updated as LiveActivity;
    }
  );
}

export async function sendLiveActivity(
  db: Db,
  tenant: Tenant,
  subscriber: Subscriber,
  input: typeof SendLiveActivitySchema.static
): Promise<Array<{ id: string; ok: boolean; code?: string; reason?: string }>> {
  if (input.event === 'start' && !input.attributesType) {
    throw new BadRequestError('Starting a Live Activity needs the attributesType to start', {
      code: 'attributes_type_missing',
      param: 'attributesType',
    });
  }
  if (input.event === 'start' && !input.alert?.title && !input.alert?.body) {
    throw new BadRequestError('Starting a Live Activity needs an alert, which iOS requires to show it', {
      code: 'alert_missing',
      param: 'alert',
    });
  }
  if (input.event !== 'start' && !input.activityId) {
    throw new BadRequestError('Updating or ending a Live Activity needs its activityId', {
      code: 'activity_id_missing',
      param: 'activityId',
    });
  }

  const conditions = [
    eq(tables.liveActivity.tenantId, tenant.id),
    eq(tables.liveActivity.subscriberId, subscriber.id),
    isNull(tables.liveActivity.deletedAt),
  ];
  if (input.event === 'start') {
    conditions.push(
      eq(tables.liveActivity.kind, 'start'),
      eq(tables.liveActivity.attributesType, input.attributesType as string)
    );
  } else {
    conditions.push(
      eq(tables.liveActivity.kind, 'activity'),
      eq(tables.liveActivity.activityId, input.activityId as string),
      isNull(tables.liveActivity.endedAt)
    );
  }

  const rows = await db
    .select()
    .from(tables.liveActivity)
    .where(and(...conditions));
  if (rows.length === 0) {
    throw new NotFoundError(
      input.event === 'start'
        ? 'No push-to-start token registered for this attributes type'
        : 'No live activity with this id'
    );
  }

  return await trace(
    'liveActivities.send',
    { 'tenant.id': tenant.id, 'subscriber.id': subscriber.id, 'live_activity.event': input.event },
    async (outer) => {
      const results: Array<{ id: string; ok: boolean; code?: string; reason?: string }> = [];
      for (const row of rows) {
        const credential = await resolveCredential(db, tenant.id, 'apns', row.environment);
        if (!credential) {
          results.push({
            id: encodeId('liveActivity', row.id),
            ok: false,
            code: 'no_credential',
            reason: `No ${row.environment} APNs credential configured`,
          });
          continue;
        }

        const liveActivity: LiveActivityPayload = {
          event: input.event,
          contentState: input.contentState,
          ...(input.event === 'start'
            ? { attributesType: row.attributesType, attributes: input.attributes ?? {} }
            : {}),
          ...(input.alert ? { alert: input.alert } : {}),
          ...(input.staleDate ? { staleDate: input.staleDate } : {}),
          ...(input.dismissalDate ? { dismissalDate: input.dismissalDate } : {}),
          ...(input.timestamp !== undefined ? { timestamp: input.timestamp } : {}),
        };
        const result = await trace(
          'deliveries.send',
          { 'delivery.provider': 'apns', 'tenant.id': tenant.id, 'live_activity.id': row.id },
          async (span) => {
            const sent = await PROVIDERS.apns.send({
              credentialId: credential.id,
              credentialUpdatedAt: credential.updatedAt.getTime(),
              secret: credential.secret,
              details: credential.details,
              environment: credential.environment,
              endpoint: row.token,
              payload: { ...(input.priority ? { priority: input.priority } : {}), liveActivity },
              expiresAt: null,
            });
            span.set('delivery.ok', sent.ok);
            if (!sent.ok) span.set('delivery.code', sent.code);
            return sent;
          }
        );

        if (!result.ok) {
          log.warn('[Deliveries] Live activity send failed', {
            tenantId: tenant.id,
            subscriberId: subscriber.id,
            liveActivityId: row.id,
            event: input.event,
            code: result.code,
            reason: result.reason,
          });
        }
        if (result.ok && input.event === 'end') {
          await db
            .update(tables.liveActivity)
            .set({ endedAt: new Date() })
            .where(eq(tables.liveActivity.id, row.id));
        }

        results.push({
          id: encodeId('liveActivity', row.id),
          ok: result.ok,
          ...(result.ok ? {} : { code: result.code, reason: result.reason }),
        });
      }
      outer.set('liveActivities.sent', results.filter((entry) => entry.ok).length);
      outer.set('liveActivities.failed', results.filter((entry) => !entry.ok).length);

      return results;
    }
  );
}
