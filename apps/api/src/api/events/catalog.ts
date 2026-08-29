import { BadRequestError } from '@buzzkit/api/libs/error';
import { type TSchema, t } from 'elysia';
import { RESERVED_EVENT_PREFIX } from './constants';
import type { EventSource } from './types';

const AttributesSchema = t.Record(t.String(), t.Unknown());

const SubscriptionEventDataSchema = t.Object({
  externalId: t.String(),
  channel: t.String(),
  platform: t.Union([t.String(), t.Null()]),
  endpoint: t.String(),
  enabled: t.Boolean(),
});

const RunSchema = t.Object({
  runId: t.String(),
  workflow: t.String(),
  workflowId: t.String(),
  versionId: t.String(),
  startedAt: t.String(),
});

export const SYSTEM_EVENTS = {
  'subscriber.created': t.Object({ externalId: t.String(), attributes: AttributesSchema }),
  'subscriber.updated': t.Object({ externalId: t.String(), attributes: AttributesSchema }),
  'subscriber.deleted': t.Object({ externalId: t.String() }),
  'subscription.registered': SubscriptionEventDataSchema,
  'subscription.muted': SubscriptionEventDataSchema,
  'subscription.unmuted': SubscriptionEventDataSchema,
  'subscription.removed': SubscriptionEventDataSchema,
  'subscription.invalidated': t.Composite([
    SubscriptionEventDataSchema,
    t.Object({ reason: t.Union([t.String(), t.Null()]) }),
  ]),
  'preferences.updated': t.Object({ changes: t.Record(t.String(), t.Unknown()) }),
  identify: t.Object({ attributes: AttributesSchema }),
  'run.started': t.Object({
    ...RunSchema.properties,
    trigger: t.Object({ name: t.String(), id: t.String() }),
  }),
  'run.step': t.Object({
    ...RunSchema.properties,
    step: t.String(),
    status: t.String(),
    summary: t.String(),
  }),
  'run.completed': RunSchema,
  'run.cancelled': t.Object({ ...RunSchema.properties, reason: t.String() }),
  'run.failed': t.Object({ ...RunSchema.properties, error: t.Optional(t.String()) }),
} as const satisfies Record<string, TSchema>;

export const SDK_EVENTS = {
  'app.opened': t.Object({}),
  'app.backgrounded': t.Object({}),
  'session.ended': t.Object({ durationSec: t.Optional(t.Number()) }),
  'notification.delivered': t.Object({ messageId: t.Optional(t.String()) }),
  'notification.opened': t.Object({ messageId: t.Optional(t.String()), action: t.Optional(t.String()) }),
  'permission.changed': t.Object({ status: t.String() }),
  identify: t.Object({ attributes: t.Optional(AttributesSchema) }),
} as const satisfies Record<string, TSchema>;

export function reservedEventName(name: string): string {
  return `${RESERVED_EVENT_PREFIX}${name}`;
}

export function isReservedEventName(name: string): boolean {
  return name.startsWith(RESERVED_EVENT_PREFIX);
}

export function isSdkEventName(name: string): boolean {
  return isReservedEventName(name) && Object.hasOwn(SDK_EVENTS, name.slice(RESERVED_EVENT_PREFIX.length));
}

export function assertEventNameAllowed(name: string, source: EventSource): void {
  if (!isReservedEventName(name) || source === 'system') return;
  if (source !== 'server' && isSdkEventName(name)) return;
  throw new BadRequestError(`'${name}' is reserved for buzzkit; event names may not start with '$'`, {
    code: 'reserved_event',
    param: 'name',
  });
}
