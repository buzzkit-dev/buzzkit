import { assertChannelsConnected, listConnectedChannels } from '@buzzkit/api/api/credentials/index';
import { recordSystemEvents, type SystemEvent, subscriberAttributes } from '@buzzkit/api/api/events/index';
import {
  assertNoSystemAttributes,
  assertTimezone,
  deviceSystemAttributes,
  recordRegistration,
  registerProfileEmail,
  registerSubscription,
  resolveProfileEmail,
  resolveSubscriptionInput,
  type SubscriptionChannel,
  type SubscriptionRegistration,
  upsertSubscriber,
} from '@buzzkit/api/api/subscribers/index';
import { ApiError } from '@buzzkit/api/libs/error';
import { log } from '@buzzkit/api/libs/logger';
import { trace } from '@buzzkit/api/libs/telemetry';
import { runConcurrently } from '@buzzkit/api/utils/concurrency';
import type { Db } from '@buzzkit/database';
import { IMPORT_CONCURRENCY } from './constants';
import type { ImportRowInput } from './schemas';
import type { ImportFailure, ImportResult, ImportRowOutcome, ImportSubscriptionOutcome } from './types';

export * from './constants';
export * from './schemas';
export type * from './types';

function resolveImportSystemAttributes(row: ImportRowInput): Record<string, string> {
  return {
    ...deviceSystemAttributes(row.device),
    ...(row.timezone ? { $timezone: row.timezone } : {}),
    ...(row.language ? { $language: row.language } : {}),
    ...(row.country ? { $country: row.country } : {}),
  };
}

function hasEndpoint(row: ImportRowInput): boolean {
  return row.channel !== undefined || row.token !== undefined || row.address !== undefined;
}

function resolveChannel(row: ImportRowInput): SubscriptionChannel {
  if (row.channel) return row.channel;
  return row.address && !row.token ? 'email' : 'push';
}

function prepareEmailRow(row: ImportRowInput, emailConnected: boolean): ImportRowInput {
  if (!hasEndpoint(row) || resolveChannel(row) !== 'email' || !row.address) return row;
  const withProfile = { ...row, attributes: { ...(row.attributes ?? {}), email: row.address } };
  if (emailConnected && row.subscribe?.email !== false) return withProfile;

  return {
    externalId: row.externalId,
    attributes: withProfile.attributes,
    ...(row.timezone !== undefined ? { timezone: row.timezone } : {}),
    ...(row.language !== undefined ? { language: row.language } : {}),
    ...(row.country !== undefined ? { country: row.country } : {}),
    ...(row.device !== undefined ? { device: row.device } : {}),
    ...(row.subscribe !== undefined ? { subscribe: row.subscribe } : {}),
  };
}

function resolveSubscriptionOutcome(registration: SubscriptionRegistration): ImportSubscriptionOutcome {
  if (registration.subscriptionCreated) return 'created';
  return registration.subscriptionRegistered ? 'updated' : 'unchanged';
}

async function importRow(
  db: Db,
  tenantId: number,
  row: ImportRowInput,
  emailConnected: boolean
): Promise<ImportRowOutcome> {
  assertNoSystemAttributes(row.attributes);
  assertTimezone(row.timezone);
  const endpoint = hasEndpoint(row) ? resolveSubscriptionInput(row) : null;
  const email = resolveProfileEmail(
    endpoint?.channel === 'email' ? endpoint.endpoint : undefined,
    row.attributes
  );

  const upserted = await upsertSubscriber(db, tenantId, row.externalId, {
    attributes: row.attributes,
    mergeAttributes: true,
    systemAttributes: resolveImportSystemAttributes(row),
  });

  const profile = {
    externalId: upserted.subscriber.externalId,
    attributes: subscriberAttributes(upserted.subscriber),
  };

  const events: SystemEvent[] = [];
  if (!upserted.created && upserted.changed) events.push({ name: 'subscriber.updated', data: profile });

  const outcome: ImportRowOutcome = { subscriberCreated: upserted.created, subscription: 'none' };

  if (endpoint) {
    const registered = await registerSubscription(db, tenantId, {
      subscriber: upserted.subscriber,
      externalId: upserted.subscriber.externalId,
      ...endpoint,
      ...(row.lastSeenAt ? { lastSeenAt: new Date(row.lastSeenAt) } : {}),
      ...(row.enabled !== undefined ? { enabled: row.enabled } : {}),
    });
    await recordRegistration(tenantId, { ...registered, subscriberCreated: upserted.created }, events);
    outcome.subscription = resolveSubscriptionOutcome(registered);
  } else {
    if (upserted.created) events.unshift({ name: 'subscriber.created', data: profile });
    await recordSystemEvents(tenantId, upserted.subscriber, events);
  }

  if (endpoint?.channel === 'email') return outcome;

  const registeredEmail = await registerProfileEmail(db, tenantId, {
    subscriber: upserted.subscriber,
    email,
    subscribe: row.subscribe?.email,
    connected: emailConnected,
  });

  if (registeredEmail) {
    await recordRegistration(tenantId, registeredEmail);
    outcome.emailSubscription = resolveSubscriptionOutcome(registeredEmail);
  }

  return outcome;
}

function groupByExternalId(rows: ImportRowInput[]): Array<Array<{ index: number; row: ImportRowInput }>> {
  const groups = new Map<string, Array<{ index: number; row: ImportRowInput }>>();
  rows.forEach((row, index) => {
    groups.set(row.externalId, [...(groups.get(row.externalId) ?? []), { index, row }]);
  });
  return [...groups.values()];
}

export async function registerImport(
  db: Db,
  tenantId: number,
  rows: ImportRowInput[]
): Promise<ImportResult> {
  return await trace('imports.register', { 'import.rows': rows.length }, async (span) => {
    const connected = await listConnectedChannels(db, tenantId);
    const emailConnected = connected.includes('email');
    const prepared = rows.map((row) => prepareEmailRow(row, emailConnected));
    const channels = [...new Set(prepared.filter(hasEndpoint).map(resolveChannel))];

    if (channels.length > 0) assertChannelsConnected(connected, channels, 'rows');

    const counts: ImportResult['counts'] = {
      rows: rows.length,
      subscribersCreated: 0,
      subscriptionsCreated: 0,
      subscriptionsUpdated: 0,
      unchanged: 0,
      failed: 0,
    };

    const failures: ImportFailure[] = [];

    await runConcurrently(groupByExternalId(prepared), IMPORT_CONCURRENCY, async (group) => {
      for (const { index, row } of group) {
        try {
          const outcome = await importRow(db, tenantId, row, emailConnected);
          if (outcome.subscriberCreated) counts.subscribersCreated += 1;
          if (outcome.subscription === 'created') counts.subscriptionsCreated += 1;
          else if (outcome.subscription === 'updated') counts.subscriptionsUpdated += 1;
          else counts.unchanged += 1;
          if (outcome.emailSubscription === 'created') counts.subscriptionsCreated += 1;
          else if (outcome.emailSubscription === 'updated') counts.subscriptionsUpdated += 1;
        } catch (error) {
          if (!(error instanceof ApiError) || error.status >= 500) throw error;
          counts.failed += 1;
          failures.push({ index, code: error.code, message: error.message, param: error.param ?? null });
        }
      }
    });

    failures.sort((a, b) => a.index - b.index);
    span.set('import.subscribers_created', counts.subscribersCreated);
    span.set('import.subscriptions_created', counts.subscriptionsCreated);
    span.set('import.subscriptions_updated', counts.subscriptionsUpdated);
    span.set('import.failed', counts.failed);
    log.info('[Imports] Imported rows', { tenantId, ...counts });

    return { counts, failures };
  });
}
