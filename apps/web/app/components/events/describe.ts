import type { IconName } from '@buzzkit/ui/components/icon';

type Data = Record<string, unknown>;

type EventDescription = { label: string; icon: IconName; detail: string | null };

type Definition = {
  label: string;
  icon: IconName;
  describe?: (data: Data) => Partial<EventDescription>;
};

type Described = { event: string; actorType: string; actorDisplay: string; data: unknown };

function text(data: Data, key: string): string | null {
  const value = data[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function number(data: Data, key: string): number | null {
  const value = data[key];
  return typeof value === 'number' ? value : null;
}

function list(data: Data, key: string): string[] {
  const value = data[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function changedFields(data: Data): string | null {
  const changes = list(data, 'changes');
  return changes.length > 0 ? `Changed ${changes.join(', ')}` : null;
}

export const EVENT_GROUPS: { label: string; events: Record<string, Definition> }[] = [
  {
    label: 'Workspace',
    events: {
      'workspace.created': {
        label: 'Workspace created',
        icon: 'IconHomeRoundDoorFilled',
        describe: (data) => ({ detail: text(data, 'name') }),
      },
      'workspace.updated': {
        label: 'Workspace updated',
        icon: 'IconPencilFilled',
        describe: (data) => ({ detail: changedFields(data) }),
      },
      'workspace.deleted': {
        label: 'Workspace deleted',
        icon: 'IconTrashCanFilled',
        describe: (data) => ({ detail: text(data, 'name') }),
      },
      'member.role_changed': {
        label: 'Member role changed',
        icon: 'IconPeopleEditFilled',
        describe: (data) => {
          const from = text(data, 'from');
          const to = text(data, 'to');
          return { detail: from && to ? `From ${from} to ${to}` : null };
        },
      },
      'member.removed': {
        label: 'Member removed',
        icon: 'IconPeopleRemoveFilled',
        describe: (data) => ({ detail: text(data, 'role') }),
      },
      'invite.created': {
        label: 'Invite sent',
        icon: 'IconInviteFilled',
        describe: (data) => ({
          detail: [text(data, 'email'), text(data, 'role')].filter(Boolean).join(' as '),
        }),
      },
      'invite.resent': {
        label: 'Invite resent',
        icon: 'IconInviteFilled',
        describe: (data) => ({ detail: text(data, 'email') }),
      },
      'invite.revoked': {
        label: 'Invite revoked',
        icon: 'IconCircleXFilled',
        describe: (data) => ({ detail: text(data, 'email') }),
      },
      'invite.accepted': {
        label: 'Invite accepted',
        icon: 'IconPeopleAddFilled',
        describe: (data) => ({ detail: text(data, 'role') }),
      },
      'profile.updated': { label: 'Profile updated', icon: 'IconUserFilled' },
    },
  },
  {
    label: 'API keys',
    events: {
      'key.created': {
        label: 'API key created',
        icon: 'IconKeyholeFilled',
        describe: (data) => ({
          detail: [text(data, 'name'), text(data, 'kind')].filter(Boolean).join(' · '),
        }),
      },
      'key.revoked': {
        label: 'API key revoked',
        icon: 'IconKeyholeFilled',
        describe: (data) => ({ detail: text(data, 'name') }),
      },
    },
  },
  {
    label: 'Tenants',
    events: {
      'tenant.created': {
        label: 'Tenant created',
        icon: 'IconBuildingsFilled',
        describe: (data) => ({ detail: text(data, 'name') }),
      },
      'tenant.updated': {
        label: 'Tenant updated',
        icon: 'IconBuildingsFilled',
        describe: (data) => ({ detail: changedFields(data) }),
      },
      'tenant.deleted': {
        label: 'Tenant deleted',
        icon: 'IconTrashCanFilled',
        describe: (data) => ({ detail: text(data, 'name') }),
      },
      'tenant.identity_secret_rotated': { label: 'Identity secret rotated', icon: 'IconRotateFilled' },
    },
  },
  {
    label: 'Credentials',
    events: {
      'credential.created': {
        label: 'Credential added',
        icon: 'IconShieldCheckFilled',
        describe: (data) => ({
          detail: [text(data, 'provider'), text(data, 'environment')].filter(Boolean).join(' · '),
        }),
      },
      'credential.validated': {
        label: 'Credential validated',
        icon: 'IconShieldCheckFilled',
        describe: (data) => ({ detail: text(data, 'lastError') ?? text(data, 'status') }),
      },
      'credential.revoked': {
        label: 'Credential removed',
        icon: 'IconShieldFilled',
        describe: (data) => ({
          detail: [text(data, 'provider'), text(data, 'environment')].filter(Boolean).join(' · '),
        }),
      },
    },
  },
  {
    label: 'Topics',
    events: {
      'topic.created': {
        label: 'Topic created',
        icon: 'IconTagFilled',
        describe: (data) => ({ detail: text(data, 'name') }),
      },
      'topic.updated': {
        label: 'Topic updated',
        icon: 'IconTagFilled',
        describe: (data) => ({ detail: changedFields(data) }),
      },
      'topic.deleted': {
        label: 'Topic deleted',
        icon: 'IconTrashCanFilled',
        describe: (data) => ({ detail: text(data, 'name') }),
      },
    },
  },
  {
    label: 'Messages',
    events: {
      'message.created': {
        label: 'Message sent',
        icon: 'IconPaperPlaneTopRightFilled',
        describe: (data) => {
          const topic = text(data, 'topic');
          const recipients = number(data, 'recipients');
          const audience = topic
            ? `to ${topic}`
            : recipients === 1
              ? 'to 1 subscriber'
              : recipients
                ? `to ${recipients} subscribers`
                : null;
          return { detail: [text(data, 'channel'), audience].filter(Boolean).join(' ') || null };
        },
      },
      'message.completed': {
        label: 'Message completed',
        icon: 'IconCircleCheckFilled',
        describe: (data) => {
          const sent = number(data, 'sent');
          const failed = number(data, 'failed');
          return { detail: sent === null ? null : `${sent} sent · ${failed ?? 0} failed` };
        },
      },
    },
  },
];

const DEFINITIONS: Record<string, Definition> = Object.assign(
  {},
  ...EVENT_GROUPS.map((group) => group.events)
);

export const EVENT_NAMES = Object.keys(DEFINITIONS);

export function describeEvent(event: Described): EventDescription {
  const definition = DEFINITIONS[event.event];
  if (!definition) return { label: event.event, icon: 'IconBellFilled', detail: null };
  const data = (event.data && typeof event.data === 'object' ? event.data : {}) as Data;
  return { label: definition.label, icon: definition.icon, detail: null, ...definition.describe?.(data) };
}
