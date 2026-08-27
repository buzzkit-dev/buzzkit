type EventDefinition = {
  webhook: boolean;
};

export const AUDIT_CATALOG = {
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
  'tenant.identity_secret_rotated': { webhook: true },

  'credential.created': { webhook: true },
  'credential.validated': { webhook: true },
  'credential.revoked': { webhook: true },

  'topic.created': { webhook: true },
  'topic.updated': { webhook: true },
  'topic.deleted': { webhook: true },

  'message.created': { webhook: true },
  'message.completed': { webhook: true },

  'profile.updated': { webhook: false },

  'webhook.created': { webhook: false },
  'webhook.updated': { webhook: false },
  'webhook.deleted': { webhook: false },
  'webhook.secret_rotated': { webhook: false },
  'webhook.replayed': { webhook: false },
  'webhook.disabled': { webhook: false },
} as const satisfies Record<string, EventDefinition>;

export type AuditEventName = keyof typeof AUDIT_CATALOG;

const names = Object.keys(AUDIT_CATALOG) as AuditEventName[];

export const PUBLIC_EVENTS: readonly AuditEventName[] = names.filter((name) => AUDIT_CATALOG[name].webhook);

const PUBLIC_EVENT_SET: ReadonlySet<string> = new Set(PUBLIC_EVENTS);

export function isPublicEvent(name: string): boolean {
  return PUBLIC_EVENT_SET.has(name);
}
