import { AUDIT_CATALOG, PUBLIC_EVENTS as PUBLIC_AUDIT_EVENTS } from '@buzzkit/api/api/audit/catalog';
import { reservedEventName, SDK_EVENTS, SYSTEM_EVENTS } from '@buzzkit/api/api/events/catalog';
import { BadRequestError } from '@buzzkit/api/libs/error';

export const PUBLIC_STREAM_EVENTS: readonly string[] = [
  ...new Set([...Object.keys(SYSTEM_EVENTS), ...Object.keys(SDK_EVENTS)].map(reservedEventName)),
];

export const PUBLIC_WEBHOOK_EVENTS: readonly string[] = [...PUBLIC_AUDIT_EVENTS, ...PUBLIC_STREAM_EVENTS];

const PUBLIC_WEBHOOK_EVENT_SET: ReadonlySet<string> = new Set(PUBLIC_WEBHOOK_EVENTS);

const CUSTOM_EVENT_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,99}$/;

const PRIVATE_AUDIT_EVENT_SET: ReadonlySet<string> = new Set(
  Object.keys(AUDIT_CATALOG).filter((name) => !PUBLIC_WEBHOOK_EVENT_SET.has(name))
);

export type WebhookEventGroup = { label: string; wildcard?: string; options: string[] };

export function isDeliverableEvent(name: string): boolean {
  if (PUBLIC_WEBHOOK_EVENT_SET.has(name)) return true;
  if (PRIVATE_AUDIT_EVENT_SET.has(name)) return false;
  return !name.startsWith('$') && CUSTOM_EVENT_PATTERN.test(name);
}

export function subscriptionMatches(subscribed: readonly string[], name: string): boolean {
  if (subscribed.length === 0) return true;
  for (const entry of subscribed) {
    if (entry === '*' || entry === name) return true;
    if (entry.endsWith('.*') && name.startsWith(entry.slice(0, -1))) return true;
  }
  return false;
}

export function assertValidSubscriptions(entries: readonly string[]): void {
  for (const entry of entries) {
    if (entry === '*' || PUBLIC_WEBHOOK_EVENT_SET.has(entry)) continue;
    if (entry.endsWith('.*')) {
      const prefix = entry.slice(0, -1);
      if (PUBLIC_WEBHOOK_EVENTS.some((name) => name.startsWith(prefix))) continue;
      const privateOnly = [...PRIVATE_AUDIT_EVENT_SET].some((name) => name.startsWith(prefix));
      if (!privateOnly && !prefix.startsWith('$') && CUSTOM_EVENT_PATTERN.test(prefix.slice(0, -1))) continue;
      throw new BadRequestError(`'${entry}' matches no event`, { code: 'invalid_event', param: 'events' });
    }
    if (!entry.startsWith('$') && !PRIVATE_AUDIT_EVENT_SET.has(entry) && CUSTOM_EVENT_PATTERN.test(entry))
      continue;
    throw new BadRequestError(`'${entry}' is not an event you can subscribe to`, {
      code: 'invalid_event',
      param: 'events',
    });
  }
}

export function webhookEventGroups(): WebhookEventGroup[] {
  const groups = new Map<string, string[]>();
  for (const name of PUBLIC_WEBHOOK_EVENTS) {
    const resource = name.slice(0, name.indexOf('.') === -1 ? name.length : name.indexOf('.'));
    groups.set(resource, [...(groups.get(resource) ?? []), name]);
  }
  return [...groups].map(([resource, options]) => ({
    label: resource.replace(/^\$/, ''),
    ...(options.some((name) => name.includes('.')) ? { wildcard: `${resource}.*` } : {}),
    options,
  }));
}
