type EventDefinition = {
  webhook: boolean;
};

export const EVENT_CATALOG = {
  'workspace.created': { webhook: false },
  'workspace.updated': { webhook: true },
  'workspace.deleted': { webhook: true },

  'member.role_changed': { webhook: true },
  'member.removed': { webhook: true },
  'invite.created': { webhook: true },
  'invite.resent': { webhook: false },
  'invite.revoked': { webhook: true },
  'invite.accepted': { webhook: true },

  'key.created': { webhook: false },
  'key.revoked': { webhook: false },

  'tenant.created': { webhook: true },
  'tenant.updated': { webhook: true },
  'tenant.deleted': { webhook: true },

  'credential.created': { webhook: true },
  'credential.validated': { webhook: true },
  'credential.revoked': { webhook: true },

  'subscriber.created': { webhook: true },
  'subscriber.updated': { webhook: true },
  'subscriber.deleted': { webhook: true },
  'device.registered': { webhook: true },
  'device.removed': { webhook: true },
  'topic.created': { webhook: true },
  'topic.updated': { webhook: true },
  'topic.deleted': { webhook: true },
  'preferences.updated': { webhook: true },

  'profile.updated': { webhook: false },
} as const satisfies Record<string, EventDefinition>;

export type EventName = keyof typeof EVENT_CATALOG;

const names = Object.keys(EVENT_CATALOG) as EventName[];

export const PUBLIC_EVENTS: readonly EventName[] = names.filter((name) => EVENT_CATALOG[name].webhook);

const PUBLIC_EVENT_SET: ReadonlySet<string> = new Set(PUBLIC_EVENTS);

export function isPublicEvent(name: string): boolean {
  return PUBLIC_EVENT_SET.has(name);
}
